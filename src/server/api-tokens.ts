import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { apiTokens, memberships } from "@/db/schema";
import { logActivity } from "./activity";
import { toCtx, type Ctx } from "./context";
import { AppError, notFound } from "./errors";

/** Personal access tokens for the MCP endpoint. Only the sha256 is stored; the token is shown once. */
const TOKEN_PREFIX = "cand_";
export const tokenInput = z.object({ name: z.string().trim().min(1).max(100) });
const MAX_TOKENS = 20;
/** lastUsedAt is written at most this often per token. */
const TOUCH_MS = 5 * 60_000;

export type ApiTokenDto = { id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const toDto = (r: typeof apiTokens.$inferSelect): ApiTokenDto => ({
  id: r.id,
  name: r.name,
  prefix: r.prefix,
  createdAt: r.createdAt.toISOString(),
  lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
});

/** The caller's own active tokens (never other people's). */
export async function listApiTokens(ctx: Ctx): Promise<ApiTokenDto[]> {
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.workspaceId, ctx.workspaceId), eq(apiTokens.membershipId, ctx.membershipId), isNull(apiTokens.revokedAt)))
    .orderBy(desc(apiTokens.createdAt));
  return rows.map(toDto);
}

export async function createApiToken(ctx: Ctx, raw: z.input<typeof tokenInput>): Promise<ApiTokenDto & { token: string }> {
  const { name } = tokenInput.parse(raw);
  if ((await listApiTokens(ctx)).length >= MAX_TOKENS) throw new AppError("invalid", `At most ${MAX_TOKENS} tokens per person`);
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(apiTokens)
    .values({ workspaceId: ctx.workspaceId, membershipId: ctx.membershipId, name, tokenHash: hashToken(token), prefix: token.slice(0, 9) })
    .returning();
  await logActivity(ctx, { entityType: "integration", entityId: row.id, action: "token_created", data: { name } });
  return { ...toDto(row), token };
}

export async function revokeApiToken(ctx: Ctx, id: string) {
  const [row] = await db
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiTokens.id, id), eq(apiTokens.workspaceId, ctx.workspaceId), eq(apiTokens.membershipId, ctx.membershipId), isNull(apiTokens.revokedAt)))
    .returning();
  if (!row) throw notFound("Token");
  await logActivity(ctx, { entityType: "integration", entityId: id, action: "token_revoked", data: { name: row.name } });
}

/**
 * Resolves a bearer token to the same Ctx a signed-in member gets. Null when the token is unknown,
 * revoked, or its membership is no longer active (removed members lose API access at once).
 */
export async function ctxFromToken(token: string | null | undefined): Promise<(Ctx & { tokenId: string }) | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;
  const [row] = await db
    .select({ t: apiTokens, m: memberships })
    .from(apiTokens)
    .innerJoin(memberships, and(eq(memberships.id, apiTokens.membershipId), eq(memberships.workspaceId, apiTokens.workspaceId)))
    .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)));
  if (!row || row.m.status !== "active" || !row.m.userId) return null;
  const now = new Date();
  if (!row.t.lastUsedAt || now.getTime() - row.t.lastUsedAt.getTime() > TOUCH_MS) {
    const cutoff = new Date(now.getTime() - TOUCH_MS);
    await db
      .update(apiTokens)
      .set({ lastUsedAt: now })
      .where(and(eq(apiTokens.id, row.t.id), or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, cutoff))));
  }
  return { ...toCtx(row.m.userId, row.m), tokenId: row.t.id };
}

// Best-effort per-instance limiter (no shared limiter exists in the app): a fixed one-minute window per token.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 120;
const hits = new Map<string, { start: number; n: number }>();
export function rateLimited(key: string, now = Date.now(), max = MAX_PER_WINDOW) {
  const h = hits.get(key);
  if (!h || now - h.start > WINDOW_MS) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { start: now, n: 1 });
    return false;
  }
  return ++h.n > max;
}
