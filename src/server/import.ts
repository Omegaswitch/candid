import "server-only";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { importRuns, memberships, projects, tasks } from "@/db/schema";
import { buildPlan, MAX_IMPORT_ROWS, referencedIds, type ApplyProject, type WorkspaceSnapshot } from "@/lib/import/plan";
import { IMPORT_FIELDS, type ImportPlan, type ImportRequest, type ImportResult } from "@/lib/import/types";
import { logActivity } from "./activity";
import type { Ctx } from "./context";
import { AppError, conflict } from "./errors";

const cell = z.union([
  z.string().max(100_000),
  z.number(),
  z.boolean(),
  z.null(),
  z.object({ formula: z.string().max(10_000), unsupported: z.literal(true) }),
]);
const dateOrder = z.enum(["dmy", "mdy"]);
const rowNumbers = z.array(z.int().positive()).max(MAX_IMPORT_ROWS + 10).default([]);

export const importRequest = z.object({
  source: z.enum(["csv", "xlsx", "paste", "google"]),
  label: z.string().trim().max(300).default(""),
  header: z.array(z.string().max(300)).max(100),
  rows: z.array(z.array(cell).max(100)),
  firstRow: z.int().positive().default(2),
  mapping: z.array(z.enum(IMPORT_FIELDS).nullable()).max(100),
  options: z.object({
    mode: z.enum(["create", "update"]),
    dateOrders: z.object({ projectDueDate: dateOrder.optional(), taskDueDate: dateOrder.optional() }).default({}),
    strictEmails: z.boolean().default(false),
    createMissing: z.boolean().default(false),
    skipRows: rowNumbers,
    acceptDuplicates: rowNumbers,
  }),
});
export const importCommit = importRequest.extend({ idempotencyKey: z.uuid() });

/** Size check before the schema, so a big file gets a clear 413 instead of a validation error. */
function parseRequest<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const rows = (raw as { rows?: unknown })?.rows;
  if (Array.isArray(rows) && rows.length > MAX_IMPORT_ROWS) {
    throw new AppError("too_large", `Import at most ${MAX_IMPORT_ROWS} rows at a time (this sheet has ${rows.length})`, { max: MAX_IMPORT_ROWS });
  }
  const req = schema.parse(raw) as ImportRequest;
  const mapped = req.mapping.filter(Boolean);
  if (new Set(mapped).size !== mapped.length) throw new AppError("invalid", "Each field can be mapped to one column only");
  if (!req.mapping.includes("project") && !req.mapping.includes("projectId")) {
    throw new AppError("invalid", "Map a Project or Project ID column");
  }
  return req as z.output<T>;
}

/** The workspace records the plan needs. Always filtered by ctx.workspaceId: foreign IDs simply are not found. */
async function loadSnapshot(ctx: Ctx, req: ImportRequest, tx: Tx | typeof db = db): Promise<WorkspaceSnapshot> {
  const { projectIds, taskIds } = referencedIds(req);
  const taskRows = await tx
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workspaceId, ctx.workspaceId),
        isNull(tasks.deletedAt),
        or(
          inArray(tasks.id, taskIds.length ? taskIds : [NIL]),
          inArray(tasks.projectId, projectIds.length ? projectIds : [NIL]),
        ),
      ),
    );
  const wanted = [...new Set([...projectIds, ...taskRows.map((t) => t.projectId)])];
  const projectRows = await tx
    .select({
      id: projects.id,
      name: projects.name,
      client: projects.client,
      status: projects.status,
      priority: projects.priority,
      ownerId: projects.ownerId,
      dueDate: projects.dueDate,
      version: projects.version,
      archivedAt: projects.archivedAt,
      // Notes can be long: only for the projects the file refers to.
      notes: sql<string>`case when ${inArray(projects.id, wanted.length ? wanted : [NIL])} then ${projects.notes} else '' end`,
    })
    .from(projects)
    .where(eq(projects.workspaceId, ctx.workspaceId));
  const members = await tx
    .select({ id: memberships.id, email: memberships.email })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), ne(memberships.status, "removed")));
  return {
    projects: projectRows.map(({ archivedAt, ...p }) => ({ ...p, archived: !!archivedAt })),
    tasks: taskRows.map((t) => ({ id: t.id, projectId: t.projectId, title: t.title, done: t.done, assigneeId: t.assigneeId, dueDate: t.dueDate, note: t.note, version: t.version })),
    members,
  };
}

const NIL = "00000000-0000-0000-0000-000000000000";

/** POST /api/import/preview: what the import would do. Changes nothing. */
export async function previewImport(ctx: Ctx, raw: unknown): Promise<ImportPlan> {
  const req = parseRequest(importRequest, raw);
  return buildPlan(req, await loadSnapshot(ctx, req)).plan;
}

/**
 * POST /api/import/commit. The import_runs row is written first in the same transaction; its unique
 * (workspace, idempotency key) makes a retry or double submit return the first run's summary.
 * Everything else lands atomically: all valid rows, or nothing.
 */
export async function commitImport(ctx: Ctx, raw: unknown): Promise<ImportResult> {
  const req = parseRequest(importCommit, raw);
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(importRuns)
      .values({ workspaceId: ctx.workspaceId, membershipId: ctx.membershipId, idempotencyKey: req.idempotencyKey, source: req.source, mode: req.options.mode })
      .onConflictDoNothing({ target: [importRuns.workspaceId, importRuns.idempotencyKey] })
      .returning();
    if (!run) {
      const [prev] = await tx
        .select()
        .from(importRuns)
        .where(and(eq(importRuns.workspaceId, ctx.workspaceId), eq(importRuns.idempotencyKey, req.idempotencyKey)));
      return { ...(prev.summary as Omit<ImportResult, "replayed">), runId: prev.id, replayed: true };
    }

    const { plan, apply } = buildPlan(req, await loadSnapshot(ctx, req, tx));
    const counts = await applyPlan(ctx, tx, apply, req.options.mode);
    const result: ImportResult = {
      runId: run.id,
      replayed: false,
      ...counts,
      skipped: plan.counts.skipped,
      failed: plan.counts.errors,
      rowErrors: plan.issues.filter((i) => i.severity === "error").map((i) => ({ row: i.row, message: i.message })),
    };
    const summary: Record<string, unknown> = { ...result, label: req.label, rows: plan.counts.rows };
    delete summary.replayed;
    await tx
      .update(importRuns)
      .set({ status: "completed", completedAt: new Date(), summary })
      .where(eq(importRuns.id, run.id));
    return result;
  });
}

async function applyPlan(ctx: Ctx, tx: Tx, apply: ApplyProject[], mode: "create" | "update") {
  const created = { projects: 0, tasks: 0 };
  const updated = { projects: 0, tasks: 0 };
  const now = new Date();
  const done = (v: boolean | undefined) =>
    v === undefined ? {} : v ? { done: true, completedAt: now, completedBy: ctx.membershipId } : { done: false, completedAt: null, completedBy: null };

  const newProjects = apply.filter((p) => p.action === "create").length;
  const [{ min }] = await tx
    .select({ min: sql<number>`coalesce(min(${projects.position}), 0)` })
    .from(projects)
    .where(eq(projects.workspaceId, ctx.workspaceId));
  let nextTop = min - newProjects; // new projects go on top, in file order

  for (const p of apply) {
    const creates = p.tasks.filter((t) => t.action === "create");
    const taskUpdates = p.tasks.filter((t) => t.action === "update").length;
    if (p.action === "unchanged" && !creates.length && !taskUpdates) continue;

    let projectId: string;
    if (p.action === "create") {
      const [row] = await tx
        .insert(projects)
        .values({ ...p.values, name: p.values.name!, workspaceId: ctx.workspaceId, createdBy: ctx.membershipId, position: nextTop++ })
        .returning({ id: projects.id });
      projectId = row.id;
      created.projects++;
    } else if (p.action === "update") {
      projectId = p.id!;
      const { notes, ...rest } = p.values;
      const [row] = await tx
        .update(projects)
        .set({
          ...rest,
          ...(notes !== undefined ? { notes, notesVersion: sql`${projects.notesVersion} + 1` } : {}),
          version: sql`${projects.version} + 1`,
          updatedAt: now,
          lastActivityAt: now,
        })
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId), eq(projects.version, p.version!)))
        .returning({ id: projects.id });
      if (!row) throw conflict({ projectId });
      updated.projects++;
    } else {
      projectId = p.id!;
      await tx.update(projects).set({ updatedAt: now, lastActivityAt: now }).where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)));
    }

    if (creates.length) {
      const [{ max }] = await tx
        .select({ max: sql<number>`coalesce(max(${tasks.position}), -1)` })
        .from(tasks)
        .where(eq(tasks.projectId, projectId));
      const values = creates.map((t, i) => {
        const { done: d, ...v } = t.values;
        return { ...v, ...done(d), workspaceId: ctx.workspaceId, projectId, position: max + 1 + i };
      });
      for (let i = 0; i < values.length; i += 1000) await tx.insert(tasks).values(values.slice(i, i + 1000));
      created.tasks += creates.length;
    }
    for (const t of p.tasks) {
      if (t.action !== "update") continue;
      const { done: d, ...v } = t.values;
      const [row] = await tx
        .update(tasks)
        .set({ ...v, ...done(d), version: sql`${tasks.version} + 1`, updatedAt: now })
        .where(and(eq(tasks.id, t.id), eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.version, t.version), isNull(tasks.deletedAt)))
        .returning({ id: tasks.id });
      if (!row) throw conflict({ taskId: t.id });
      updated.tasks++;
    }

    await logActivity(
      ctx,
      {
        projectId,
        entityType: "import",
        entityId: projectId,
        action: p.action === "create" ? "imported" : "import_updated",
        data: { mode, projectFields: Object.keys(p.values), tasksCreated: creates.length, tasksUpdated: taskUpdates },
      },
      tx,
    );
  }
  return { created, updated };
}
