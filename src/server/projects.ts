import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { favorites, projects, projectTemplates, tasks, templateTasks } from "@/db/schema";
import { logActivity } from "./activity";
import type { Ctx } from "./context";
import { AppError, conflict, notFound } from "./errors";
import { assertMembers } from "./members";

export const isoDate = z.iso.date();
// Omitted stays undefined (leave as is); empty string or null clears it.
const nullableText = z.string().trim().max(200).nullish().transform((v) => (v === undefined ? undefined : v || null));

export const projectInput = z.object({
  name: z.string().trim().min(1).max(200),
  client: nullableText,
  ownerId: z.uuid().nullish(),
  status: z.enum(["active", "waiting", "completed"]).default("active"),
  priority: z.enum(["normal", "high"]).default("normal"),
  dueDate: isoDate.nullish(),
  notes: z.string().max(100_000).default(""),
});
export type ProjectInput = z.input<typeof projectInput>;

// Built without defaults: in zod 4 `.default()` survives `.partial()`, which would reset omitted fields.
export const projectPatch = z.object({
  name: projectInput.shape.name.optional(),
  client: nullableText,
  ownerId: z.uuid().nullish(),
  status: z.enum(["active", "waiting", "completed"]).optional(),
  priority: z.enum(["normal", "high"]).optional(),
  dueDate: isoDate.nullish(),
  version: z.int(),
});

export type ProjectSummary = {
  id: string;
  name: string;
  client: string | null;
  ownerId: string | null;
  status: "active" | "waiting" | "completed";
  priority: "normal" | "high";
  dueDate: string | null;
  position: number;
  version: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  waitingCount: number;
  nextTask: { id: string; title: string; dueDate: string | null; assigneeId: string | null } | null;
  pinned: boolean;
};

const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Card data for many projects in one query: counts and the next open task come from aggregates
 * and a correlated subquery, never one request per card.
 */
export async function listProjectSummaries(
  ctx: Ctx,
  opts: { archived?: boolean; ids?: string[]; today?: string; limit?: number; offset?: number } = {},
): Promise<ProjectSummary[]> {
  const today = opts.today ?? todayUtc();
  const where: SQL[] = [eq(projects.workspaceId, ctx.workspaceId)];
  where.push(opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt));
  if (opts.ids) where.push(inArray(projects.id, opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]));

  const live = sql`${tasks.deletedAt} is null`;
  const rows = await db
    .select({
      p: projects,
      taskCount: sql<number>`count(${tasks.id}) filter (where ${live})::int`,
      doneCount: sql<number>`count(${tasks.id}) filter (where ${live} and ${tasks.done})::int`,
      overdueCount: sql<number>`count(${tasks.id}) filter (where ${live} and not ${tasks.done} and ${tasks.dueDate} < ${today})::int`,
      waitingCount: sql<number>`count(${tasks.id}) filter (where ${live} and not ${tasks.done} and ${tasks.waiting})::int`,
      nextTask: sql<ProjectSummary["nextTask"]>`(
        select json_build_object('id', nt.id, 'title', nt.title, 'dueDate', nt.due_date, 'assigneeId', nt.assignee_id)
        from tasks nt where nt.project_id = ${projects.id} and not nt.done and nt.deleted_at is null
        order by nt.position limit 1)`,
      pinned: sql<boolean>`exists (select 1 from ${favorites} f where f.membership_id = ${ctx.membershipId}
        and f.kind = 'project' and f.entity_id = ${projects.id})`,
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(and(...where))
    .groupBy(projects.id)
    .orderBy(opts.archived ? desc(projects.archivedAt) : asc(projects.position), asc(projects.createdAt))
    .limit(opts.limit ?? 500)
    .offset(opts.offset ?? 0);

  return rows.map(({ p, ...agg }) => ({
    id: p.id,
    name: p.name,
    client: p.client,
    ownerId: p.ownerId,
    status: p.status,
    priority: p.priority,
    dueDate: p.dueDate,
    position: p.position,
    version: p.version,
    archivedAt: p.archivedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    lastActivityAt: p.lastActivityAt.toISOString(),
    ...agg,
  }));
}

async function loadProject(ctx: Ctx, id: string, tx: Tx | typeof db = db) {
  const [p] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)));
  if (!p) throw notFound("Project");
  return p;
}

export async function getProject(ctx: Ctx, id: string) {
  const p = await loadProject(ctx, id);
  const list = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, id), eq(tasks.workspaceId, ctx.workspaceId), isNull(tasks.deletedAt)))
    .orderBy(asc(tasks.position), asc(tasks.createdAt));
  const [fav] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.membershipId, ctx.membershipId), eq(favorites.kind, "project"), eq(favorites.entityId, id)));
  return { project: p, tasks: list, pinned: !!fav };
}

export async function createProject(
  ctx: Ctx,
  raw: ProjectInput & { templateId?: string | null; tasks?: { title: string; note?: string }[] },
) {
  const input = projectInput.parse(raw);
  await assertMembers(ctx, [input.ownerId]);
  return db.transaction(async (tx) => {
    const [{ min }] = await tx
      .select({ min: sql<number>`coalesce(min(${projects.position}), 0)` })
      .from(projects)
      .where(eq(projects.workspaceId, ctx.workspaceId));
    const [p] = await tx
      .insert(projects)
      .values({ ...input, ownerId: input.ownerId ?? null, workspaceId: ctx.workspaceId, createdBy: ctx.membershipId, position: min - 1 })
      .returning();

    let seed = raw.tasks ?? [];
    if (raw.templateId && !raw.tasks) {
      const [tpl] = await tx
        .select({ id: projectTemplates.id })
        .from(projectTemplates)
        .where(and(eq(projectTemplates.id, raw.templateId), eq(projectTemplates.workspaceId, ctx.workspaceId), isNull(projectTemplates.archivedAt)));
      if (!tpl) throw notFound("Template");
      // Copied, not linked: later template edits never touch this project.
      seed = await tx
        .select({ title: templateTasks.title, note: templateTasks.note })
        .from(templateTasks)
        .where(eq(templateTasks.templateId, tpl.id))
        .orderBy(asc(templateTasks.position));
    }
    if (seed.length) {
      await tx.insert(tasks).values(
        seed.map((t, i) => ({ workspaceId: ctx.workspaceId, projectId: p.id, title: t.title, note: t.note ?? "", position: i })),
      );
    }
    await logActivity(ctx, { projectId: p.id, entityType: "project", entityId: p.id, action: "created", data: { fromTemplate: !!raw.templateId } }, tx);
    return p;
  });
}

/** Optimistic concurrency: the write only lands if `version` still matches. */
export async function updateProject(ctx: Ctx, id: string, raw: z.input<typeof projectPatch>) {
  const { version, ...patch } = projectPatch.parse(raw);
  await assertMembers(ctx, [patch.ownerId]);
  const before = await loadProject(ctx, id);
  const [p] = await db
    .update(projects)
    .set({ ...patch, version: sql`${projects.version} + 1`, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId), eq(projects.version, version)))
    .returning();
  if (!p) throw conflict(await loadProject(ctx, id));
  const changed = Object.keys(patch).filter((k) => (before as Record<string, unknown>)[k] !== (patch as Record<string, unknown>)[k]);
  if (changed.length) {
    const action = changed.includes("status") ? "status_changed" : changed.includes("name") ? "renamed" : "edited";
    await logActivity(ctx, { projectId: id, entityType: "project", entityId: id, action, data: { fields: changed, ...(patch.status ? { from: before.status, to: patch.status } : {}) } });
  }
  return p;
}

/** Notes save separately and never overwrite silently: a stale `notesVersion` returns 409 with the server copy. */
export async function updateProjectNotes(ctx: Ctx, id: string, notes: string, notesVersion: number) {
  if (notes.length > 100_000) throw new AppError("invalid", "Notes are too long");
  const [p] = await db
    .update(projects)
    .set({ notes, notesVersion: sql`${projects.notesVersion} + 1`, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId), eq(projects.notesVersion, notesVersion)))
    .returning({ notes: projects.notes, notesVersion: projects.notesVersion, updatedAt: projects.updatedAt });
  if (!p) {
    const cur = await loadProject(ctx, id);
    throw conflict({ notes: cur.notes, notesVersion: cur.notesVersion, updatedAt: cur.updatedAt });
  }
  // Logged without the note text itself.
  await logActivity(ctx, { projectId: id, entityType: "project", entityId: id, action: "notes_edited", data: { length: notes.length } });
  return p;
}

export async function setArchived(ctx: Ctx, id: string, archived: boolean) {
  const [p] = await db
    .update(projects)
    .set({
      archivedAt: archived ? new Date() : null,
      archivedBy: archived ? ctx.membershipId : null,
      version: sql`${projects.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
    .returning();
  if (!p) throw notFound("Project");
  await logActivity(ctx, { projectId: id, entityType: "project", entityId: id, action: archived ? "archived" : "restored" });
  return p;
}

/** Copies the structure; every task starts open. Notes and dates only when asked. */
export async function duplicateProject(ctx: Ctx, id: string, opts: { name?: string; includeNotes: boolean; includeDates: boolean }) {
  const src = await getProject(ctx, id);
  return createProject(ctx, {
    name: opts.name?.trim() || `${src.project.name} (copy)`,
    client: src.project.client,
    ownerId: src.project.ownerId,
    priority: src.project.priority,
    status: "active",
    dueDate: opts.includeDates ? src.project.dueDate : null,
    notes: opts.includeNotes ? src.project.notes : "",
  }).then(async (p) => {
    if (src.tasks.length) {
      await db.insert(tasks).values(
        src.tasks.map((t, i) => ({
          workspaceId: ctx.workspaceId,
          projectId: p.id,
          title: t.title,
          assigneeId: t.assigneeId,
          note: opts.includeNotes ? t.note : "",
          dueDate: opts.includeDates ? t.dueDate : null,
          position: i,
        })),
      );
    }
    return p;
  });
}

/** Rewrites positions in the given order; ids must all belong to this workspace. */
export async function reorderProjects(ctx: Ctx, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.workspaceId, ctx.workspaceId), inArray(projects.id, orderedIds)));
    if (owned.length !== new Set(orderedIds).size) throw notFound("Project");
    for (const [i, pid] of orderedIds.entries()) {
      await tx.update(projects).set({ position: i }).where(and(eq(projects.id, pid), eq(projects.workspaceId, ctx.workspaceId)));
    }
  });
}

/** Called after any task change so "recent activity" sorting and `updatedAt` stay true. */
export async function touchProject(ctx: Ctx, id: string, tx: Tx | typeof db = db) {
  await tx
    .update(projects)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)));
}

export { loadProject };
