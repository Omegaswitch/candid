import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { memberships, workspaces } from "@/db/schema";
import { getAuthProfile, getAuthUserId } from "@/lib/auth/session";
import { AppError } from "./errors";

export type Role = "admin" | "member";
export type Ctx = {
  userId: string; // auth provider id
  membershipId: string;
  workspaceId: string;
  role: Role;
  name: string;
  email: string;
};

const DEFAULT_WORKSPACE = { slug: "main", name: process.env.WORKSPACE_NAME ?? "Candid" };

const bootstrapAdmins = () =>
  (process.env.BOOTSTRAP_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/**
 * Resolves the caller's active membership. Every server operation goes through this, and every
 * query is then filtered by `ctx.workspaceId`. One shared workspace for now: a user with several
 * memberships gets the oldest; a workspace switcher would pass the id explicitly.
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const userId = await getAuthUserId();
  if (!userId) return null;

  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
    .orderBy(memberships.createdAt)
    .limit(1);
  if (m) return toCtx(userId, m);

  return claimInvite(userId);
});

/** First sign-in: bind a pending invite (by verified email), or bootstrap the first admin. */
async function claimInvite(userId: string): Promise<Ctx | null> {
  const profile = await getAuthProfile();
  const email = profile?.email?.toLowerCase();
  if (!email) return null;

  const [invite] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.email, email), eq(memberships.status, "invited"), isNull(memberships.userId)))
    .orderBy(memberships.createdAt)
    .limit(1);
  if (invite) {
    const [bound] = await db
      .update(memberships)
      .set({ userId, status: "active", displayName: invite.displayName ?? profile?.name, updatedAt: new Date() })
      .where(and(eq(memberships.id, invite.id), isNull(memberships.userId)))
      .returning();
    return bound ? toCtx(userId, bound) : null;
  }

  if (!bootstrapAdmins().includes(email)) return null;
  // Bootstrap creates an admin for a listed email that has no membership row yet. The unique
  // (workspace, email) index makes this a no-op for an existing row, so a removed member is never
  // revived and an existing membership is never taken over.
  const ws = await ensureDefaultWorkspace();
  const [admin] = await db
    .insert(memberships)
    .values({ workspaceId: ws.id, userId, email, displayName: profile?.name, role: "admin", status: "active" })
    .onConflictDoNothing()
    .returning();
  if (!admin) return null;
  return toCtx(userId, admin);
}

export async function ensureDefaultWorkspace() {
  const [existing] = await db.select().from(workspaces).where(eq(workspaces.slug, DEFAULT_WORKSPACE.slug));
  if (existing) return existing;
  const [ws] = await db
    .insert(workspaces)
    .values(DEFAULT_WORKSPACE)
    .onConflictDoNothing()
    .returning();
  return ws ?? (await db.select().from(workspaces).where(eq(workspaces.slug, DEFAULT_WORKSPACE.slug)))[0];
}

function toCtx(userId: string, m: typeof memberships.$inferSelect): Ctx {
  return {
    userId,
    membershipId: m.id,
    workspaceId: m.workspaceId,
    role: m.role,
    email: m.email,
    name: m.displayName ?? m.email,
  };
}

/** Throws 401 / 403. Use in every route handler and server action. */
export async function requireCtx(role?: Role): Promise<Ctx> {
  const userId = await getAuthUserId();
  if (!userId) throw new AppError("unauthenticated", "Sign in to continue");
  const ctx = await getCtx();
  if (!ctx) throw new AppError("forbidden", "You are not a member of this workspace");
  if (role === "admin" && ctx.role !== "admin") throw new AppError("forbidden", "Only admins can do this");
  return ctx;
}
