import "server-only";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { documents, projects, tasks } from "@/db/schema";
import { logActivity } from "./activity";
import type { Ctx } from "./context";
import { notFound } from "./errors";

/** How long deleted things stay restorable before the daily cleanup erases them. */
export const TRASH_DAYS = 10;
const DAY = 86_400_000;

export type TrashItem = { kind: "project" | "task" | "document"; id: string; name: string; context: string | null; deletedAt: string; purgeOn: string };

const item = (kind: TrashItem["kind"], id: string, name: string, context: string | null, deletedAt: Date): TrashItem => ({
  kind,
  id,
  name,
  context,
  deletedAt: deletedAt.toISOString(),
  purgeOn: new Date(deletedAt.getTime() + TRASH_DAYS * DAY).toISOString(),
});

/** Everything deleted in this workspace in the last 10 days, newest first. */
export async function listTrash(ctx: Ctx): Promise<TrashItem[]> {
  const [p, t, d] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, client: projects.client, deletedAt: projects.deletedAt })
      .from(projects)
      .where(and(eq(projects.workspaceId, ctx.workspaceId), isNotNull(projects.deletedAt))),
    db
      .select({ id: tasks.id, title: tasks.title, project: projects.name, deletedAt: tasks.deletedAt })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      // A task inside a trashed project comes back with the project, so it is not listed on its own.
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), isNotNull(tasks.deletedAt), isNull(projects.deletedAt))),
    db
      .select({ id: documents.id, name: documents.name, project: projects.name, deletedAt: documents.deletedAt })
      .from(documents)
      .leftJoin(projects, eq(projects.id, documents.projectId))
      .where(and(eq(documents.workspaceId, ctx.workspaceId), isNotNull(documents.deletedAt), isNotNull(documents.uploadedAt))),
  ]);
  return [
    ...p.map((x) => item("project", x.id, x.name, x.client, x.deletedAt!)),
    ...t.map((x) => item("task", x.id, x.title, x.project, x.deletedAt!)),
    ...d.map((x) => item("document", x.id, x.name, x.project, x.deletedAt!)),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}

/** Takes one item out of the trash. A project returns to the Archive. */
export async function restoreFromTrash(ctx: Ctx, kind: TrashItem["kind"], id: string) {
  const table = kind === "project" ? projects : kind === "task" ? tasks : documents;
  const [row] = await db
    .update(table)
    .set({ deletedAt: null })
    .where(and(eq(table.id, id), eq(table.workspaceId, ctx.workspaceId), isNotNull(table.deletedAt)))
    .returning({ id: table.id });
  if (!row) throw notFound("Item");
  await logActivity(ctx, { entityType: kind, entityId: id, projectId: kind === "project" ? id : null, action: "restored_from_trash" });
}

/** Daily cleanup (cron): erases projects and tasks deleted more than 10 days ago. Documents: purgeRemovedDocuments. */
export async function purgeTrash(now = new Date()) {
  const before = new Date(now.getTime() - TRASH_DAYS * DAY);
  const t = await db.delete(tasks).where(lt(tasks.deletedAt, before)).returning({ id: tasks.id });
  const p = await db.delete(projects).where(lt(projects.deletedAt, before)).returning({ id: projects.id });
  return { projects: p.length, tasks: t.length };
}

