import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { integrationConnections, memberships } from "@/db/schema";
import { logActivity } from "./activity";
import type { Ctx } from "./context";
import { AppError, notFound } from "./errors";
import type { MemberSummary } from "./members";

export const inviteInput = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  role: z.enum(["admin", "member"]).default("member"),
});
export const roleInput = z.object({ role: z.enum(["admin", "member"]) });

const requireAdmin = (ctx: Ctx) => {
  if (ctx.role !== "admin") throw new AppError("forbidden", "Only admins can manage members");
};

const summary = (m: typeof memberships.$inferSelect): MemberSummary => ({
  id: m.id,
  name: m.displayName ?? m.email,
  email: m.email,
  role: m.role,
  status: m.status,
});

/**
 * Creates an invited membership. The person binds to it on first sign-in with a verified email
 * (see claimInvite in context.ts). Re-inviting someone who was removed starts them over.
 */
export async function inviteMember(ctx: Ctx, raw: z.input<typeof inviteInput>): Promise<MemberSummary> {
  requireAdmin(ctx);
  const { email, role } = inviteInput.parse(raw);
  const [existing] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.email, email)));
  let m: typeof memberships.$inferSelect;
  if (existing && existing.status !== "removed") {
    throw new AppError("invalid", existing.status === "invited" ? "This person is already invited" : "This person is already a member");
  } else if (existing) {
    [m] = await db
      .update(memberships)
      .set({ status: "invited", role, userId: null, updatedAt: new Date() })
      .where(eq(memberships.id, existing.id))
      .returning();
  } else {
    [m] = await db.insert(memberships).values({ workspaceId: ctx.workspaceId, email, role, status: "invited" }).returning();
  }
  await logActivity(ctx, { entityType: "member", entityId: m.id, action: "invited", data: { role } });
  return summary(m);
}

/** Locks the workspace's active admins so two admins cannot demote or remove each other at once. */
async function assertAnotherAdmin(ctx: Ctx, targetId: string, tx: Tx) {
  const admins = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), eq(memberships.role, "admin"), eq(memberships.status, "active")))
    .for("update");
  if (!admins.some((a) => a.id !== targetId)) {
    throw new AppError("invalid", "The workspace needs at least one admin. Make someone else an admin first.");
  }
}

async function loadMember(ctx: Ctx, id: string, tx: Tx) {
  const [m] = await tx
    .select()
    .from(memberships)
    .where(and(eq(memberships.id, id), eq(memberships.workspaceId, ctx.workspaceId), ne(memberships.status, "removed")));
  if (!m) throw notFound("Member");
  return m;
}

export async function changeRole(ctx: Ctx, id: string, raw: z.input<typeof roleInput>): Promise<MemberSummary> {
  requireAdmin(ctx);
  const { role } = roleInput.parse(raw);
  return db.transaction(async (tx) => {
    const m = await loadMember(ctx, id, tx);
    if (m.role === role) return summary(m);
    if (m.role === "admin" && m.status === "active") await assertAnotherAdmin(ctx, id, tx);
    const [u] = await tx.update(memberships).set({ role, updatedAt: new Date() }).where(eq(memberships.id, id)).returning();
    await logActivity(ctx, { entityType: "member", entityId: id, action: "role_changed", data: { from: m.role, to: role } }, tx);
    return summary(u);
  });
}

/** Soft remove: status "removed" keeps their name on past activity. Their Google tokens are deleted. */
export async function removeMember(ctx: Ctx, id: string) {
  requireAdmin(ctx);
  const revoked: (string | null)[] = [];
  await db.transaction(async (tx) => {
    const m = await loadMember(ctx, id, tx);
    if (m.role === "admin" && m.status === "active") await assertAnotherAdmin(ctx, id, tx);
    await tx.update(memberships).set({ status: "removed", updatedAt: new Date() }).where(eq(memberships.id, id));
    const conns = await tx.delete(integrationConnections).where(eq(integrationConnections.membershipId, id)).returning();
    revoked.push(...conns.map((c) => c.refreshTokenEnc ?? c.accessTokenEnc));
    await logActivity(ctx, { entityType: "member", entityId: id, action: "removed" }, tx);
  });
  // Also end their Google grant at Google, after the tokens are gone from our database.
  const { revokeStored } = await import("./google");
  await Promise.all(revoked.map(revokeStored));
}
