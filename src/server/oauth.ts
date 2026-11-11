import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memberships, oauthAccessTokens, oauthClients, oauthCodes, oauthGrants } from "@/db/schema";
import { logActivity } from "./activity";
import { hashToken } from "./api-tokens";
import { toCtx, type Ctx } from "./context";
import { notFound } from "./errors";

/**
 * OAuth 2.1 authorization server for the MCP endpoint, as the MCP authorization spec asks of it
 * (and Claude / ChatGPT custom connectors use): RFC 8414 + RFC 9728 metadata, RFC 7591 dynamic
 * registration of public clients, authorization code with S256 PKCE, RFC 8707 resource binding,
 * RFC 9207 `iss` in the redirect, and rotating refresh tokens. Tokens are opaque; only sha256 is stored.
 */

export const SCOPE = "mcp";
export const ACCESS_PREFIX = "candat_";
export const REFRESH_PREFIX = "candrt_";
const CODE_TTL_MS = 60_000;
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_MS = 30 * 24 * 3600_000;
/** A rotated refresh token replayed later than this revokes the whole grant (theft signal). */
const REUSE_GRACE_MS = 60_000;
const TOUCH_MS = 5 * 60_000;

const random = (bytes = 32) => randomBytes(bytes).toString("base64url");

// ---------------------------------------------------------------- URLs and metadata

/** The public origin: APP_URL when set (production), else the request's own origin. */
export function baseUrl(req?: Request) {
  if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  return req ? new URL(req.url).origin : "http://localhost:3000";
}

export const urls = (base: string) => ({
  issuer: base,
  resource: `${base}/api/mcp`,
  resourceMetadata: `${base}/.well-known/oauth-protected-resource/api/mcp`,
  authorize: `${base}/oauth/authorize`,
  token: `${base}/oauth/token`,
  register: `${base}/oauth/register`,
});

export const protectedResourceMetadata = (base: string) => {
  const u = urls(base);
  return {
    resource: u.resource,
    authorization_servers: [u.issuer],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Candid",
  };
};

export const authorizationServerMetadata = (base: string) => {
  const u = urls(base);
  return {
    issuer: u.issuer,
    authorization_endpoint: u.authorize,
    token_endpoint: u.token,
    registration_endpoint: u.register,
    scopes_supported: [SCOPE],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
  };
};

/** The 401 challenge that sends MCP clients to the metadata (MCP authorization spec, RFC 9728 §5.1). */
export const wwwAuthenticate = (base: string, error?: string) =>
  `Bearer resource_metadata="${urls(base).resourceMetadata}", scope="${SCOPE}"${error ? `, error="${error}"` : ""}`;

// ---------------------------------------------------------------- errors

export class OAuthError extends Error {
  constructor(
    public error: string,
    public description: string,
    public status = 400,
  ) {
    super(description);
  }
  toJSON() {
    return { error: this.error, error_description: this.description };
  }
}

// ---------------------------------------------------------------- redirect URIs

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** https anywhere, or http on a loopback host (native clients such as Claude Code). */
export function validRedirectUri(raw: string) {
  if (raw.length > 2000 || /[\s"'<>`\\]/.test(raw)) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  return u.protocol === "https:" || (u.protocol === "http:" && LOOPBACK.has(u.hostname));
}

/** Exact match, except that a loopback redirect may use any port (RFC 8252 §7.3). */
export function redirectMatches(registered: string[], requested: string) {
  if (registered.includes(requested)) return true;
  let r: URL;
  try {
    r = new URL(requested);
  } catch {
    return false;
  }
  if (r.protocol !== "http:" || !LOOPBACK.has(r.hostname)) return false;
  return registered.some((reg) => {
    try {
      const g = new URL(reg);
      return g.protocol === "http:" && g.hostname === r.hostname && g.pathname === r.pathname && g.search === r.search;
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------- dynamic client registration

const registration = z.object({
  redirect_uris: z.array(z.string()).min(1).max(10),
  client_name: z.string().max(500).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
  scope: z.string().optional(),
});

/**
 * RFC 7591. Every client is public (`none`) whatever it asked for: the server may replace requested
 * metadata, and PKCE is what protects the code. Unauthenticated, so callers rate-limit it.
 */
export async function registerClient(raw: unknown) {
  const parsed = registration.safeParse(raw);
  if (!parsed.success) throw new OAuthError("invalid_client_metadata", "redirect_uris is required: 1 to 10 URLs");
  const m = parsed.data;
  const bad = m.redirect_uris.find((u) => !validRedirectUri(u));
  if (bad !== undefined) throw new OAuthError("invalid_redirect_uri", "Redirect URIs must be https, or http on localhost");
  if (m.grant_types && !m.grant_types.includes("authorization_code"))
    throw new OAuthError("invalid_client_metadata", "Only the authorization_code grant (with refresh_token) is supported");
  if (m.response_types && !m.response_types.includes("code")) throw new OAuthError("invalid_client_metadata", "Only response_type code is supported");
  // Control characters out; the consent page shows the name next to the redirect host.
  const name = (m.client_name ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) || "MCP client";
  const [row] = await db.insert(oauthClients).values({ name, redirectUris: m.redirect_uris }).returning();
  return {
    client_id: row.id,
    client_id_issued_at: Math.floor(row.createdAt.getTime() / 1000),
    client_name: row.name,
    redirect_uris: row.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    scope: SCOPE,
  };
}

export async function getClient(id: string | null | undefined) {
  if (!id || !z.uuid().safeParse(id).success) return null;
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.id, id));
  return row ?? null;
}

// ---------------------------------------------------------------- authorization request

/** RFC 8707: the token's audience. Only this MCP server (or the bare origin) is accepted. */
function canonicalResource(raw: string | null, base: string): string | null {
  const own = urls(base).resource;
  if (raw === null || raw === "") return own;
  try {
    const u = new URL(raw);
    if (u.hash || u.search) return null;
    const s = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    return s === own || s === base ? own : null;
  } catch {
    return null;
  }
}

export type AuthorizeRequest = {
  client: typeof oauthClients.$inferSelect;
  redirectUri: string;
  codeChallenge: string;
  state: string | null;
  scope: string;
  resource: string;
};

export type AuthorizeCheck =
  | { ok: true; request: AuthorizeRequest }
  /** Untrusted client or redirect URI: show the error, never redirect (RFC 6749 §4.1.2.1). */
  | { ok: false; redirect: null; message: string }
  | { ok: false; redirect: string; message: string };

export const callbackUrl = (redirectUri: string, base: string, params: Record<string, string | null>) => {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
  u.searchParams.set("iss", urls(base).issuer);
  return u.toString();
};

export async function checkAuthorizeRequest(p: URLSearchParams, base: string): Promise<AuthorizeCheck> {
  const client = await getClient(p.get("client_id"));
  if (!client) return { ok: false, redirect: null, message: "unknown_client" };
  const redirectUri = p.get("redirect_uri") ?? "";
  if (!redirectMatches(client.redirectUris, redirectUri)) return { ok: false, redirect: null, message: "bad_redirect" };

  const state = p.get("state");
  const fail = (error: string, description: string): AuthorizeCheck => ({
    ok: false,
    message: error,
    redirect: callbackUrl(redirectUri, base, { error, error_description: description, state }),
  });
  if (state && state.length > 2048) return fail("invalid_request", "state is too long");
  if (p.get("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported");
  const challenge = p.get("code_challenge") ?? "";
  if (p.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge))
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
  const resource = canonicalResource(p.get("resource"), base);
  if (!resource) return fail("invalid_target", "Unknown resource");
  return { ok: true, request: { client, redirectUri, codeChallenge: challenge, state, scope: SCOPE, resource } };
}

/** After consent: a single-use code valid for a minute, returned in the redirect. */
export async function issueCode(ctx: Ctx, r: AuthorizeRequest, base: string) {
  const code = random();
  await db.insert(oauthCodes).values({
    codeHash: hashToken(code),
    clientId: r.client.id,
    workspaceId: ctx.workspaceId,
    membershipId: ctx.membershipId,
    redirectUri: r.redirectUri,
    codeChallenge: r.codeChallenge,
    scope: r.scope,
    resource: r.resource,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  // Old codes are useless; keep the table small.
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date(Date.now() - 24 * 3600_000)));
  return callbackUrl(r.redirectUri, base, { code, state: r.state });
}

export const denyUrl = (r: AuthorizeRequest, base: string) =>
  callbackUrl(r.redirectUri, base, { error: "access_denied", error_description: "The user denied access", state: r.state });

// ---------------------------------------------------------------- token endpoint

const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");
const sameString = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** client_id from the form, or from HTTP Basic (some clients send it there with an empty secret). */
function clientIdOf(form: URLSearchParams, authorization: string | null) {
  const basic = /^Basic\s+(\S+)$/i.exec(authorization ?? "")?.[1];
  if (basic) {
    const decoded = Buffer.from(basic, "base64").toString();
    const id = decodeURIComponent(decoded.split(":")[0] ?? "");
    if (id) return id;
  }
  return form.get("client_id");
}

async function newTokens(grantId: string) {
  const access = ACCESS_PREFIX + random();
  await db.insert(oauthAccessTokens).values({ tokenHash: hashToken(access), grantId, expiresAt: new Date(Date.now() + ACCESS_TTL_S * 1000) });
  // Expired access tokens of this grant are dead weight.
  await db.delete(oauthAccessTokens).where(and(eq(oauthAccessTokens.grantId, grantId), lt(oauthAccessTokens.expiresAt, new Date())));
  return access;
}

const tokenResponse = (access: string, refresh: string, scope: string) => ({
  access_token: access,
  token_type: "Bearer",
  expires_in: ACCESS_TTL_S,
  refresh_token: refresh,
  scope,
});

async function activeMembership(workspaceId: string, membershipId: string) {
  const [m] = await db.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.workspaceId, workspaceId)));
  return m && m.status === "active" && m.userId ? m : null;
}

const revokeGrantById = (id: string) =>
  db.update(oauthGrants).set({ revokedAt: new Date() }).where(and(eq(oauthGrants.id, id), isNull(oauthGrants.revokedAt)));

/** POST /oauth/token (form-encoded). Throws OAuthError; returns the JSON body on success. */
export async function exchangeToken(form: URLSearchParams, authorization: string | null, base: string) {
  const grantType = form.get("grant_type");
  const clientId = clientIdOf(form, authorization);
  const client = await getClient(clientId);
  if (!client) throw new OAuthError("invalid_client", "Unknown client_id", 401);

  const resourceParam = form.get("resource");
  const resource = resourceParam === null ? null : canonicalResource(resourceParam, base);
  if (resourceParam !== null && !resource) throw new OAuthError("invalid_target", "Unknown resource");

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    if (!code || !verifier) throw new OAuthError("invalid_request", "code and code_verifier are required");
    const codeHash = hashToken(code);
    // Single use: whoever flips used_at first wins, even if the checks below then fail.
    const [row] = await db
      .update(oauthCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthCodes.codeHash, codeHash), isNull(oauthCodes.usedAt)))
      .returning();
    if (!row) {
      // A replayed code: revoke what the first exchange issued (RFC 6749 §4.1.2).
      const [used] = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, codeHash));
      if (used?.grantId) await revokeGrantById(used.grantId);
      throw new OAuthError("invalid_grant", "Invalid or already used authorization code");
    }
    if (row.expiresAt.getTime() < Date.now()) throw new OAuthError("invalid_grant", "Authorization code expired");
    if (row.clientId !== client.id) throw new OAuthError("invalid_grant", "Code was issued to another client");
    const redirectUri = form.get("redirect_uri");
    if (redirectUri !== null && redirectUri !== row.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri does not match");
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !sameString(s256(verifier), row.codeChallenge))
      throw new OAuthError("invalid_grant", "PKCE verification failed");
    if (resource && resource !== row.resource) throw new OAuthError("invalid_target", "resource does not match the authorization request");
    const m = await activeMembership(row.workspaceId, row.membershipId);
    if (!m) throw new OAuthError("invalid_grant", "The account no longer has access");

    const refresh = REFRESH_PREFIX + random();
    const [grant] = await db
      .insert(oauthGrants)
      .values({
        workspaceId: row.workspaceId,
        membershipId: row.membershipId,
        clientId: client.id,
        scope: row.scope,
        resource: row.resource,
        refreshHash: hashToken(refresh),
        refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      })
      .returning();
    await db.update(oauthCodes).set({ grantId: grant.id }).where(eq(oauthCodes.codeHash, codeHash));
    await logActivity(toCtx(m.userId!, m), { entityType: "integration", entityId: grant.id, action: "oauth_authorized", data: { client: client.name } });
    return tokenResponse(await newTokens(grant.id), refresh, grant.scope);
  }

  if (grantType === "refresh_token") {
    const presented = form.get("refresh_token") ?? "";
    if (!presented.startsWith(REFRESH_PREFIX)) throw new OAuthError("invalid_grant", "Invalid refresh token");
    const oldHash = hashToken(presented);
    const refresh = REFRESH_PREFIX + random();
    const now = new Date();
    // Rotation: the old token stops working in the same statement that issues the new one.
    const [grant] = await db
      .update(oauthGrants)
      .set({ refreshHash: hashToken(refresh), prevRefreshHash: oldHash, rotatedAt: now, refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS) })
      .where(
        and(
          eq(oauthGrants.refreshHash, oldHash),
          eq(oauthGrants.clientId, client.id),
          isNull(oauthGrants.revokedAt),
          gt(oauthGrants.refreshExpiresAt, now),
        ),
      )
      .returning();
    if (!grant) {
      const [replayed] = await db.select().from(oauthGrants).where(eq(oauthGrants.prevRefreshHash, oldHash));
      // A rotated token used again after a short grace (concurrent refreshes) means it leaked.
      if (replayed && replayed.rotatedAt && now.getTime() - replayed.rotatedAt.getTime() > REUSE_GRACE_MS) await revokeGrantById(replayed.id);
      throw new OAuthError("invalid_grant", "Invalid, expired or revoked refresh token");
    }
    if (resource && resource !== grant.resource) throw new OAuthError("invalid_target", "resource does not match the grant");
    if (!(await activeMembership(grant.workspaceId, grant.membershipId))) {
      await revokeGrantById(grant.id);
      throw new OAuthError("invalid_grant", "The account no longer has access");
    }
    return tokenResponse(await newTokens(grant.id), refresh, grant.scope);
  }

  throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token");
}

// ---------------------------------------------------------------- resource server side

/**
 * Resolves an OAuth access token to the member's Ctx. Null when unknown, expired, revoked, issued
 * for another resource (RFC 8707 audience), or the membership is no longer active.
 */
export async function ctxFromAccessToken(token: string, base: string): Promise<(Ctx & { tokenId: string }) | null> {
  if (!token.startsWith(ACCESS_PREFIX) || token.length > 200) return null;
  const now = new Date();
  const [row] = await db
    .select({ g: oauthGrants, m: memberships })
    .from(oauthAccessTokens)
    .innerJoin(oauthGrants, eq(oauthGrants.id, oauthAccessTokens.grantId))
    .innerJoin(memberships, and(eq(memberships.id, oauthGrants.membershipId), eq(memberships.workspaceId, oauthGrants.workspaceId)))
    .where(and(eq(oauthAccessTokens.tokenHash, hashToken(token)), gt(oauthAccessTokens.expiresAt, now), isNull(oauthGrants.revokedAt)));
  if (!row || row.g.resource !== urls(base).resource || row.m.status !== "active" || !row.m.userId) return null;
  if (!row.g.lastUsedAt || now.getTime() - row.g.lastUsedAt.getTime() > TOUCH_MS) {
    const cutoff = new Date(now.getTime() - TOUCH_MS);
    await db
      .update(oauthGrants)
      .set({ lastUsedAt: now })
      .where(and(eq(oauthGrants.id, row.g.id), or(isNull(oauthGrants.lastUsedAt), lt(oauthGrants.lastUsedAt, cutoff))));
  }
  return { ...toCtx(row.m.userId, row.m), tokenId: row.g.id };
}

// ---------------------------------------------------------------- settings: connected apps

export type OAuthGrantDto = { id: string; clientName: string; redirectHost: string; createdAt: string; lastUsedAt: string | null };

const hostOf = (uri: string | undefined) => {
  try {
    return uri ? new URL(uri).host : "";
  } catch {
    return "";
  }
};

/** The caller's own live grants (not revoked, refresh token not expired). */
export async function listGrants(ctx: Ctx): Promise<OAuthGrantDto[]> {
  const rows = await db
    .select({ g: oauthGrants, c: oauthClients })
    .from(oauthGrants)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthGrants.clientId))
    .where(
      and(
        eq(oauthGrants.workspaceId, ctx.workspaceId),
        eq(oauthGrants.membershipId, ctx.membershipId),
        isNull(oauthGrants.revokedAt),
        gt(oauthGrants.refreshExpiresAt, new Date()),
      ),
    )
    .orderBy(desc(oauthGrants.createdAt));
  return rows.map(({ g, c }) => ({
    id: g.id,
    clientName: c.name,
    redirectHost: hostOf(c.redirectUris[0]),
    createdAt: g.createdAt.toISOString(),
    lastUsedAt: g.lastUsedAt?.toISOString() ?? null,
  }));
}

export async function revokeGrant(ctx: Ctx, id: string) {
  const [row] = await db
    .update(oauthGrants)
    .set({ revokedAt: new Date() })
    .where(and(eq(oauthGrants.id, id), eq(oauthGrants.workspaceId, ctx.workspaceId), eq(oauthGrants.membershipId, ctx.membershipId), isNull(oauthGrants.revokedAt)))
    .returning();
  if (!row) throw notFound("Connection");
  await db.delete(oauthAccessTokens).where(eq(oauthAccessTokens.grantId, id));
  await logActivity(ctx, { entityType: "integration", entityId: id, action: "oauth_revoked" });
}

// ---------------------------------------------------------------- HTTP helpers for the public endpoints

/** Metadata, registration and token endpoints are called cross-origin by browser-based MCP clients. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export const oauthJson = (body: unknown, status = 200, cache: "no-store" | "public" = "no-store") =>
  Response.json(body, { status, headers: { ...CORS, ...(cache === "public" ? { "Cache-Control": "public, max-age=3600" } : NO_STORE) } });

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export function oauthErrorResponse(e: unknown) {
  if (e instanceof OAuthError) {
    const res = oauthJson(e.toJSON(), e.status);
    if (e.status === 401) res.headers.set("WWW-Authenticate", 'Basic realm="candid"');
    return res;
  }
  console.error(e);
  return oauthJson({ error: "server_error", error_description: "Something went wrong on the server" }, 500);
}

/** Client IP for best-effort per-instance limits (Vercel sets x-forwarded-for). */
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
