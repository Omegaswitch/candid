import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { memberships } from "@/db/schema";
import type { Ctx } from "./context";
import { AppError } from "./errors";

export type MemberSummary = { id: string; name: string; email: string; role: "admin" | "member"; status: string };

export async function listMembers(ctx: Ctx): Promise<MemberSummary[]> {
  const rows = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), ne(memberships.status, "removed")))
    .orderBy(memberships.displayName, memberships.email);
  return rows.map((m) => ({ id: m.id, name: m.displayName ?? m.email, email: m.email, role: m.role, status: m.status }));
}

/** Throws unless every given membership id belongs to the caller's workspace. */
export async function assertMembers(ctx: Ctx, ids: (string | null | undefined)[], tx: Tx | typeof db = db) {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))];
  if (!wanted.length) return;
  const found = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), inArray(memberships.id, wanted), ne(memberships.status, "removed")));
  if (found.length !== wanted.length) throw new AppError("invalid", "Unknown person for this workspace");
}

/** email (lowercased) → membership id, for import matching. Unknown emails are reported, never created. */
export async function memberIdsByEmail(ctx: Ctx): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: memberships.id, email: memberships.email })
    .from(memberships)
    .where(and(eq(memberships.workspaceId, ctx.workspaceId), ne(memberships.status, "removed")));
  return new Map(rows.map((r) => [r.email.toLowerCase(), r.id]));
}
