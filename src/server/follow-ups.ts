import "server-only";
import { and, asc, eq, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { logActivity } from "./activity";
import type { Ctx } from "./context";
import { conflict } from "./errors";
import { isoDate, loadProject } from "./projects";

/**
 * Client follow-ups and the quick contact log.
 *
 * `activity_events.action` and `.entity_type` are plain text columns (not enums), so a logged
 * contact is an ordinary `project` event with the action `contact_logged` and structured `data`
 * ({ kind, outcome }). No enum change, no extra table: it shows up in the project history like
 * every other event.
 */

export const CONTACT_KINDS = ["call", "email", "meeting"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export const contactInput = z.object({
  kind: z.enum(CONTACT_KINDS),
  // Short on purpose: history keeps small facts, long text belongs in the notes.
  outcome: z.string().trim().max(300).default(""),
  followUpOn: isoDate.nullish(),
});

export type FollowUp = {
  projectId: string;
  name: string;
  client: string | null;
  ownerId: string | null;
  followUpOn: string;
  followUpNote: string | null;
  version: number;
};

/** Follow-ups due on or before `today` on live projects, oldest first. */
export async function listDueFollowUps(ctx: Ctx, today: string): Promise<FollowUp[]> {
  const rows = await db
    .select({
      projectId: projects.id,
      name: projects.name,
      client: projects.client,
      ownerId: projects.ownerId,
      followUpOn: projects.followUpOn,
      followUpNote: projects.followUpNote,
      version: projects.version,
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, ctx.workspaceId),
        isNull(projects.archivedAt),
        isNull(projects.deletedAt),
        isNotNull(projects.followUpOn),
        lte(projects.followUpOn, today),
      ),
    )
    .orderBy(asc(projects.followUpOn), asc(projects.name))
    .limit(100);
  return rows as FollowUp[];
}

/** "Done": clears the follow-up (date and note) and records it in the project history. */
export async function completeFollowUp(ctx: Ctx, projectId: string) {
  const before = await loadProject(ctx, projectId);
  if (!before.followUpOn) return before; // already cleared by someone else
  const [p] = await db
    .update(projects)
    .set({ followUpOn: null, followUpNote: null, version: sql`${projects.version} + 1`, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId), eq(projects.followUpOn, before.followUpOn)))
    .returning();
  if (!p) throw conflict(await loadProject(ctx, projectId));
  await logActivity(ctx, {
    projectId,
    entityType: "project",
    entityId: projectId,
    action: "follow_up_done",
    data: { on: before.followUpOn, ...(before.followUpNote ? { note: before.followUpNote } : {}) },
  });
  return p;
}

/** One contact (call, e-mail, meeting) with its outcome, optionally scheduling the next one. */
export async function logContact(ctx: Ctx, projectId: string, raw: z.input<typeof contactInput>) {
  const input = contactInput.parse(raw);
  await loadProject(ctx, projectId);
  return db.transaction(async (tx) => {
    await logActivity(
      ctx,
      { projectId, entityType: "project", entityId: projectId, action: "contact_logged", data: { kind: input.kind, ...(input.outcome ? { outcome: input.outcome } : {}) } },
      tx,
    );
    const [p] = await tx
      .update(projects)
      .set({
        lastActivityAt: new Date(),
        updatedAt: new Date(),
        ...(input.followUpOn ? { followUpOn: input.followUpOn, followUpNote: null, version: sql`${projects.version} + 1` } : {}),
      })
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .returning();
    if (input.followUpOn) {
      await logActivity(ctx, { projectId, entityType: "project", entityId: projectId, action: "follow_up_set", data: { on: input.followUpOn } }, tx);
    }
    return p;
  });
}
