import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { activityEvents, favorites, labels, projectLabels, projects, projectTemplates, tasks, templateTasks } from "@/db/schema";
import { logActivity } from "./activity";
import { defaultTemplateId } from "./templates";
import type { Ctx } from "./context";
import { AppError, conflict, notFound } from "./errors";
import { assertMembers } from "./members";
import type { Label } from "./labels";

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
  contactName: nullableText,
  contactEmail: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null))
    .pipe(z.email().nullish()),
  contactPhone: z.string().trim().max(50).regex(/^[+\d\s()./-]*$/).nullish().transform((v) => (v === undefined ? undefined : v || null)),
  // Next planned contact: a date and a one-line reminder. Clearing the date also clears the note.
  followUpOn: isoDate.nullish(),
  followUpNote: z.string().trim().max(300).nullish().transform((v) => (v === undefined ? undefined : v || null)),
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
  /** Latest of the project's own activity stamp and its newest history entry. */
  lastActivityAt: string;
  /** When the project last changed status (from the history log); its creation date if it never did. */
  statusSince: string;
  taskCount: number;
  doneCount: number;
  overdueCount: number;
  waitingCount: number;
  nextTask: { id: string; title: string; dueDate: string | null; assigneeId: string | null } | null;
  /** Members with at least one open step here (the "Mine" quick filter). */
  openAssigneeIds: string[];
  pinned: boolean;
  labels: Label[];
};

const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Card data for many projects in one query: counts and the next open task come from aggregates
 * and a correlated subquery, never one request per card.
 */
export async function listProjectSummaries(
  ctx: Ctx,
  opts: { archived?: boolean | "any"; ids?: string[]; today?: string; limit?: number; offset?: number } = {},
): Promise<ProjectSummary[]> {
  const today = opts.today ?? todayUtc();
  const where: SQL[] = [eq(projects.workspaceId, ctx.workspaceId)];
  if (opts.archived !== "any") where.push(opts.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt));
  where.push(isNull(projects.deletedAt));
  if (opts.ids) where.push(inArray(projects.id, opts.ids.length ? opts.ids : ["00000000-0000-0000-0000-000000000000"]));

  const live = sql`${tasks.deletedAt} is null`;
  const rows = await db
    .select({
      p: projects,
      taskCount: sql<number>`count(${tasks.id}) filter (where ${live})::int`,
      doneCount: sql<number>`count(${tasks.id}) filter (where ${live} and ${tasks.done})::int`,
      overdueCount: sql<number>`count(${tasks.id}) filter (where ${live} and not ${tasks.done} and ${tasks.dueDate} < ${today})::int`,
      waitingCount: sql<number>`count(${tasks.id}) filter (where ${live} and not ${tasks.done} and ${tasks.waiting})::int`,
      openAssigneeIds: sql<string[]>`coalesce(json_agg(distinct ${tasks.assigneeId})
        filter (where ${live} and not ${tasks.done} and ${tasks.assigneeId} is not null), '[]'::json)`,
      nextTask: sql<ProjectSummary["nextTask"]>`(
        select json_build_object('id', nt.id, 'title', nt.title, 'dueDate', nt.due_date, 'assigneeId', nt.assignee_id)
        from tasks nt where nt.project_id = ${projects.id} and not nt.done and nt.deleted_at is null
        order by nt.position limit 1)`,
      pinned: sql<boolean>`exists (select 1 from ${favorites} f where f.membership_id = ${ctx.membershipId}
        and f.kind = 'project' and f.entity_id = ${projects.id})`,
      // Two index lookups on activity_events (project_id, created_at) per project, inside the same query: no N+1.
      statusSince: sql<string>`to_char(coalesce((select max(e.created_at) from ${activityEvents} e
        where e.project_id = ${projects.id} and e.action = 'status_changed' and e.data ->> 'to' is not null), ${projects.createdAt})
        at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
      lastActivityAt: sql<string>`to_char(greatest(${projects.lastActivityAt}, (select max(e.created_at) from ${activityEvents} e
        where e.project_id = ${projects.id})) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
      labels: sql<Label[]>`coalesce((
        select json_agg(json_build_object('id', l.id, 'name', l.name, 'color', l.color) order by l.name)
        from project_labels pl join labels l on l.id = pl.label_id where pl.project_id = ${projects.id}), '[]'::json)`,
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(and(...where))
    .groupBy(projects.id)
    .orderBy(opts.archived === true ? desc(projects.archivedAt) : asc(projects.position), asc(projects.createdAt))
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
    ...agg,
  }));
}

async function loadProject(ctx: Ctx, id: string, tx: Tx | typeof db = db) {
  const [p] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId), isNull(projects.deletedAt)));
  if (!p) throw notFound("Project");
  return p;
}

/** Two parallel queries: the project row (with pinned and label ids as subqueries) and its tasks. */
export async function getProject(ctx: Ctx, id: string) {
  const [[row], list] = await Promise.all([
    db
      .select({
        p: projects,
        // `id` is the bound parameter, never a bare column, so nothing inside the subqueries can capture it.
        pinned: sql<boolean>`exists (select 1 from ${favorites} f where f.membership_id = ${ctx.membershipId}
          and f.kind = 'project' and f.entity_id = ${id})`,
        labelIds: sql<string[]>`coalesce((select json_agg(pl.label_id) from ${projectLabels} pl
          join ${labels} l on l.id = pl.label_id where pl.project_id = ${id} and l.workspace_id = ${ctx.workspaceId}), '[]'::json)`,
      })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId), isNull(projects.deletedAt))),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, id), eq(tasks.workspaceId, ctx.workspaceId), isNull(tasks.deletedAt)))
      .orderBy(asc(tasks.position), asc(tasks.createdAt)),
  ]);
  if (!row) throw notFound("Project");
  return { project: row.p, tasks: list, pinned: row.pinned, labelIds: row.labelIds };
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
    // No checklist given and no template chosen: start from the workspace default (Settings → Templates).
    const templateId = raw.tasks ? null : (raw.templateId ?? (await defaultTemplateId(ctx, tx)));
    if (templateId) {
      const [tpl] = await tx
        .select({ id: projectTemplates.id })
        .from(projectTemplates)
        .where(and(eq(projectTemplates.id, templateId), eq(projectTemplates.workspaceId, ctx.workspaceId), isNull(projectTemplates.archivedAt)));
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
    await logActivity(ctx, { projectId: p.id, entityType: "project", entityId: p.id, action: "created", data: { fromTemplate: !raw.tasks } }, tx);
    return p;
  });
}

/** Optimistic concurrency: the write only lands if `version` still matches. */
export async function updateProject(ctx: Ctx, id: string, raw: z.input<typeof projectPatch>) {
  const { version, ...patch } = projectPatch.parse(raw);
  if (patch.followUpOn === null) patch.followUpNote = null;
  await assertMembers(ctx, [patch.ownerId]);
  const before = await loadProject(ctx, id);
  const [p] = await db
    .update(projects)
    .set({ ...patch, version: sql`${projects.version} + 1`, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId), eq(projects.version, version)))
    .returning();
  if (!p) throw conflict(await loadProject(ctx, id));
  const differs = (k: string) => (before as Record<string, unknown>)[k] !== (patch as Record<string, unknown>)[k];
  const changed = Object.keys(patch).filter((k) => !k.startsWith("followUp") && differs(k));
  if (patch.followUpOn !== undefined && differs("followUpOn")) {
    await logActivity(ctx, { projectId: id, entityType: "project", entityId: id, action: p.followUpOn ? "follow_up_set" : "follow_up_cleared", data: { on: p.followUpOn ?? before.followUpOn } });
  }
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

/**
 * Permanent delete, allowed only for an archived project (archive first, so deleting is always two
 * deliberate steps). Its tasks and activity go with it; its documents stay on the shelf, unlinked.
 */
export async function deleteArchivedProject(ctx: Ctx, id: string) {
  const p = await loadProject(ctx, id);
  if (!p.archivedAt) throw new AppError("invalid", "Only archived projects can be deleted. Archive it first.");
  await db.transaction(async (tx) => {
    // Into the trash, not gone: restorable for 10 days (see restoreFromTrash / purgeTrash).
    await tx.delete(favorites).where(and(eq(favorites.workspaceId, ctx.workspaceId), eq(favorites.entityId, id)));
    await tx
      .update(projects)
      .set({ deletedAt: new Date(), version: sql`${projects.version} + 1` })
      .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId), isNotNull(projects.archivedAt)));
    await logActivity(ctx, { entityType: "project", entityId: id, action: "deleted", data: { name: p.name } }, tx);
  });
}

/** Copies the structure, labels and contact; every task starts open. Notes and dates only when asked. */
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
    tasks: [], // the copies below are the checklist; never add the default template on top
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
    // Labels and the client contact belong to the project's identity, so the copy keeps them.
    if (src.labelIds.length) await db.insert(projectLabels).values(src.labelIds.map((labelId) => ({ projectId: p.id, labelId })));
    const { contactName, contactEmail, contactPhone } = src.project;
    if (contactName || contactEmail || contactPhone) {
      await db.update(projects).set({ contactName, contactEmail, contactPhone }).where(and(eq(projects.id, p.id), eq(projects.workspaceId, ctx.workspaceId)));
      return { ...p, contactName, contactEmail, contactPhone };
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
    const { ids, positions } = positionArrays(orderedIds);
    await tx.execute(sql`update ${projects} set position = v.pos
      from unnest(${ids}::uuid[], ${positions}::float8[]) as v(id, pos)
      where ${projects.id} = v.id and ${projects.workspaceId} = ${ctx.workspaceId}`);
  });
}

/**
 * One UPDATE for a whole reorder instead of one per row: the new positions travel as two array
 * literals (the ids are validated uuids). A repeated id keeps its last index, as row-by-row did.
 */
export function positionArrays(orderedIds: string[]) {
  const pos = new Map(orderedIds.map((id, i) => [id, i]));
  return { ids: `{${[...pos.keys()].join(",")}}`, positions: `{${[...pos.values()].join(",")}}` };
}

/** Called after any task change so "recent activity" sorting and `updatedAt` stay true. */
export async function touchProject(ctx: Ctx, id: string, tx: Tx | typeof db = db) {
  await tx
    .update(projects)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)));
}

export { loadProject };
