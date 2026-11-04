import "server-only";
import type { Db, Tx } from "@/db";
import { db as defaultDb } from "@/db";
import { activityEvents } from "@/db/schema";
import type { Ctx } from "./context";

export type ActivityInput = {
  projectId?: string | null;
  entityType: "project" | "task" | "document" | "template" | "member" | "import" | "export" | "integration";
  entityId?: string | null;
  action: string; // e.g. "created", "renamed", "completed", "archived", "notes_edited"
  data?: Record<string, unknown>; // small facts only: never tokens or full note bodies
};

export async function logActivity(ctx: Ctx, input: ActivityInput, tx: Db | Tx = defaultDb) {
  await tx.insert(activityEvents).values({
    workspaceId: ctx.workspaceId,
    actorId: ctx.membershipId,
    projectId: input.projectId ?? null,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    action: input.action,
    data: input.data,
  });
}
