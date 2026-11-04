import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { logActivity } from "./activity";
import type { Ctx } from "./context";
import { conflict, notFound } from "./errors";
import { assertMembers } from "./members";
import { isoDate, loadProject, touchProject } from "./projects";

export const taskInput = z.object({
  title: z.string().trim().min(1).max(500),
  assigneeId: z.uuid().nullish(),
  dueDate: isoDate.nullish(),
  note: z.string().max(20_000).default(""),
  waiting: z.boolean().default(false),
  waitingReason: z.string().trim().max(500).nullish(),
});
export const taskPatch = taskInput.partial().extend({ done: z.boolean().optional(), version: z.int() });

async function loadTask(ctx: Ctx, id: string) {
  const [t] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.workspaceId, ctx.workspaceId)));
  if (!t) throw notFound("Task");
  return t;
}

export async function createTask(ctx: Ctx, projectId: string, raw: z.input<typeof taskInput>) {
  const input = taskInput.parse(raw);
  await loadProject(ctx, projectId);
  await assertMembers(ctx, [input.assigneeId]);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${tasks.position}), -1)` })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));
  const [t] = await db
    .insert(tasks)
    .values({ ...input, assigneeId: input.assigneeId ?? null, workspaceId: ctx.workspaceId, projectId, position: max + 1 })
    .returning();
  await touchProject(ctx, projectId);
  await logActivity(ctx, { projectId, entityType: "task", entityId: t.id, action: "created", data: { title: t.title } });
  return t;
}

const doneFields = (ctx: Ctx, done: boolean) =>
  done ? { done, completedAt: new Date(), completedBy: ctx.membershipId } : { done, completedAt: null, completedBy: null };

export async function updateTask(ctx: Ctx, id: string, raw: z.input<typeof taskPatch>) {
  const { version, done, ...patch } = taskPatch.parse(raw);
  await assertMembers(ctx, [patch.assigneeId]);
  const before = await loadTask(ctx, id);
  const [t] = await db
    .update(tasks)
    .set({
      ...patch,
      ...(done === undefined || done === before.done ? {} : doneFields(ctx, done)),
      version: sql`${tasks.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, id), eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.version, version), isNull(tasks.deletedAt)))
    .returning();
  if (!t) throw conflict(await loadTask(ctx, id));
  await touchProject(ctx, t.projectId);
  if (done !== undefined && done !== before.done) {
    await logActivity(ctx, { projectId: t.projectId, entityType: "task", entityId: id, action: done ? "completed" : "reopened", data: { title: t.title } });
  } else if (patch.title && patch.title !== before.title) {
    await logActivity(ctx, { projectId: t.projectId, entityType: "task", entityId: id, action: "renamed", data: { from: before.title, to: t.title } });
  }
  return t;
}

/** Soft delete so Undo can restore it. */
export async function setTaskRemoved(ctx: Ctx, id: string, removed: boolean) {
  const [t] = await db
    .update(tasks)
    .set({ deletedAt: removed ? new Date() : null, version: sql`${tasks.version} + 1`, updatedAt: new Date() })
    .where(and(eq(tasks.id, id), eq(tasks.workspaceId, ctx.workspaceId)))
    .returning();
  if (!t) throw notFound("Task");
  await touchProject(ctx, t.projectId);
  await logActivity(ctx, { projectId: t.projectId, entityType: "task", entityId: id, action: removed ? "removed" : "restored", data: { title: t.title } });
  return t;
}

export async function reorderTasks(ctx: Ctx, projectId: string, orderedIds: string[]) {
  await loadProject(ctx, projectId);
  await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.workspaceId, ctx.workspaceId), inArray(tasks.id, orderedIds)));
    if (owned.length !== new Set(orderedIds).size) throw notFound("Task");
    for (const [i, tid] of orderedIds.entries()) {
      await tx.update(tasks).set({ position: i }).where(eq(tasks.id, tid));
    }
  });
  await touchProject(ctx, projectId);
}

export const bulkPatch = z
  .object({
    ids: z.array(z.uuid()).min(1).max(500),
    done: z.boolean().optional(),
    assigneeId: z.uuid().nullable().optional(),
    dueDate: isoDate.nullable().optional(),
  })
  .refine((v) => v.done !== undefined || v.assigneeId !== undefined || v.dueDate !== undefined, "Nothing to change");

/** Returns the previous values so the client can offer Undo. */
export async function bulkUpdateTasks(ctx: Ctx, raw: z.input<typeof bulkPatch>) {
  const { ids, done, ...patch } = bulkPatch.parse(raw);
  await assertMembers(ctx, [patch.assigneeId]);
  return db.transaction(async (tx) => {
    const before = await tx
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), inArray(tasks.id, ids), isNull(tasks.deletedAt)));
    if (before.length !== new Set(ids).size) throw notFound("Task");
    const set = { ...patch, ...(done === undefined ? {} : doneFields(ctx, done)) };
    const changed = done === undefined ? before : before.filter((t) => t.done !== done);
    if (changed.length) {
      await tx
        .update(tasks)
        .set({ ...set, version: sql`${tasks.version} + 1`, updatedAt: new Date() })
        .where(and(eq(tasks.workspaceId, ctx.workspaceId), inArray(tasks.id, changed.map((t) => t.id))));
    }
    for (const pid of new Set(before.map((t) => t.projectId))) {
      await touchProject(ctx, pid, tx);
      await logActivity(ctx, { projectId: pid, entityType: "task", action: "bulk_updated", data: { count: before.filter((t) => t.projectId === pid).length, fields: Object.keys(set) } }, tx);
    }
    return { before: before.map((t) => ({ id: t.id, done: t.done, assigneeId: t.assigneeId, dueDate: t.dueDate })) };
  });
}

export type TaskView = "mine" | "due-soon" | "overdue" | "waiting";

/** Cross-project task lists. Open tasks on non-archived projects only. */
export async function listTaskView(ctx: Ctx, view: TaskView, opts: { today: string; days?: number; limit?: number; offset?: number }) {
  const where: SQL[] = [
    eq(tasks.workspaceId, ctx.workspaceId),
    isNull(tasks.deletedAt),
    eq(tasks.done, false),
    isNull(projects.archivedAt),
  ];
  const horizon = addDays(opts.today, opts.days ?? 7);
  if (view === "mine") where.push(eq(tasks.assigneeId, ctx.membershipId));
  if (view === "due-soon") where.push(gte(tasks.dueDate, opts.today), lte(tasks.dueDate, horizon));
  if (view === "overdue") where.push(lt(tasks.dueDate, opts.today));
  if (view === "waiting") where.push(eq(tasks.waiting, true));
  return db
    .select({ task: tasks, project: { id: projects.id, name: projects.name, client: projects.client, priority: projects.priority } })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(...where))
    .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(projects.position), asc(tasks.position))
    .limit(opts.limit ?? 200)
    .offset(opts.offset ?? 0);
}

export async function taskCounts(ctx: Ctx, today: string) {
  const horizon = addDays(today, 7);
  const [row] = await db
    .select({
      activeProjects: sql<number>`(select count(*)::int from ${projects} where workspace_id = ${ctx.workspaceId} and archived_at is null and status <> 'completed')`,
      overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${today})::int`,
      dueThisWeek: sql<number>`count(*) filter (where ${tasks.dueDate} >= ${today} and ${tasks.dueDate} <= ${horizon})::int`,
      mine: sql<number>`count(*) filter (where ${tasks.assigneeId} = ${ctx.membershipId})::int`,
      waiting: sql<number>`count(*) filter (where ${tasks.waiting})::int`,
    })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.workspaceId, ctx.workspaceId), isNull(tasks.deletedAt), eq(tasks.done, false), isNull(projects.archivedAt)));
  return row;
}

export function addDays(isoDay: string, n: number) {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export { loadTask };
