import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activityEvents, memberships } from "@/db/schema";
import type { Ctx } from "./context";
import { loadProject } from "./projects";

export type ActivityItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  data: Record<string, unknown> | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
};

/** Latest events for one project, newest first, with the actor's display name. */
export async function listProjectActivity(ctx: Ctx, projectId: string, limit = 30): Promise<ActivityItem[]> {
  await loadProject(ctx, projectId);
  const rows = await db
    .select({
      e: activityEvents,
      displayName: memberships.displayName,
      email: memberships.email,
    })
    .from(activityEvents)
    .leftJoin(memberships, and(eq(memberships.id, activityEvents.actorId), eq(memberships.workspaceId, ctx.workspaceId)))
    .where(and(eq(activityEvents.workspaceId, ctx.workspaceId), eq(activityEvents.projectId, projectId)))
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(limit);
  return rows.map(({ e, displayName, email }) => ({
    id: e.id,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    data: e.data ?? null,
    actorId: e.actorId,
    actorName: displayName ?? email ?? null,
    createdAt: e.createdAt.toISOString(),
  }));
}
