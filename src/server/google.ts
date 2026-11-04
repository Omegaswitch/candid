import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { unescapeCell } from "@/lib/import/escape";
import type { Cell, ExportBundle, ExportTable, ParsedWorkbook } from "@/lib/import/types";
import { logActivity } from "./activity";
import type { Ctx } from "./context";
import { decrypt, encrypt, sign, verifySignature } from "./crypto";
import { AppError } from "./errors";

// Google OAuth (authorization code + PKCE) and the few Sheets REST calls we need, with plain fetch.
// Scopes: spreadsheets (read the sheet the user pastes, create/write export sheets), openid + email
// (to show which account is connected). No Drive scope: the user pastes the spreadsheet link.

export const PROVIDER = "google";
export const SCOPES = "https://www.googleapis.com/auth/spreadsheets openid email";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
export const STATE_COOKIE = "candid_google_oauth";
const STATE_TTL_MS = 10 * 60_000;
const EXPIRY_SKEW_MS = 60_000;
const MAX_CELLS = 500_000;

export const googleConfigured = () =>
  !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL && process.env.TOKEN_ENCRYPTION_KEY);

const redirectUri = () => `${process.env.APP_URL!.replace(/\/$/, "")}/api/google/callback`;

const reconnect = (message = "Your Google connection has expired or was revoked. Reconnect Google to continue.") =>
  new AppError("integration", message, { reconnect: true });

function requireConfigured() {
  if (!googleConfigured()) throw new AppError("integration", "Google is not set up for this workspace. An admin needs to add the Google credentials.", { notConfigured: true });
}

/** Only same-site paths, never `//host` or a full URL. */
export const safeReturnTo = (v: string | null | undefined) =>
  v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/settings/integrations";

// ---------------------------------------------------------------- OAuth state

type StatePayload = { m: string; n: string; r: string; exp: number };

export function createState(p: StatePayload): string {
  const data = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${data}.${sign(data)}`;
}

/** Verifies signature and expiry. Returns null for anything that does not check out. */
export function verifyState(state: string | null, now = Date.now()): StatePayload | null {
  if (!state) return null;
  const [data, sig] = state.split(".");
  if (!data || !sig || !verifySignature(data, sig)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as StatePayload;
    return typeof p.exp === "number" && p.exp > now ? p : null;
  } catch {
    return null;
  }
}

/**
 * Builds the Google consent URL. The state (signed) names the membership and a nonce; the cookie
 * (encrypted, httpOnly) carries the same nonce and the PKCE verifier, so a callback only succeeds
 * in the browser that started it, for the member who started it.
 */
export function startConnect(ctx: Ctx, returnTo: string | null) {
  requireConfigured();
  const nonce = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = createState({ m: ctx.membershipId, n: nonce, r: safeReturnTo(returnTo), exp: Date.now() + STATE_TTL_MS });
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    login_hint: ctx.email,
  }).toString();
  return { url: url.toString(), cookie: encrypt(JSON.stringify({ n: nonce, v: verifier })), maxAgeSec: STATE_TTL_MS / 1000 };
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string };

async function tokenRequest(params: Record<string, string>): Promise<{ ok: true; data: TokenResponse } | { ok: false; status: number; error: string }> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
    });
  } catch {
    throw new AppError("integration", "Could not reach Google. Try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: String(data?.error ?? "unknown") };
  return { ok: true, data };
}

/** The id_token comes straight from Google's token endpoint over TLS, so reading its claims is enough. */
function emailFromIdToken(idToken: string | undefined): string | null {
  const part = idToken?.split(".")[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return typeof claims.email === "string" ? claims.email : null;
  } catch {
    return null;
  }
}

export type CallbackError = "state" | "denied" | "exchange" | "scope" | "not_configured";

/** Verifies state + cookie, exchanges the code, stores encrypted tokens. Returns where to send the browser. */
export async function completeConnect(
  ctx: Ctx,
  q: { code: string | null; state: string | null; error: string | null; cookie: string | undefined },
): Promise<{ returnTo: string; error?: CallbackError }> {
  const state = verifyState(q.state);
  const returnTo = state?.r ?? "/settings/integrations";
  if (!googleConfigured()) return { returnTo, error: "not_configured" };
  if (!state || state.m !== ctx.membershipId || !q.cookie) return { returnTo, error: "state" };
  let saved: { n: string; v: string };
  try {
    saved = JSON.parse(decrypt(q.cookie));
  } catch {
    return { returnTo, error: "state" };
  }
  if (saved.n !== state.n) return { returnTo, error: "state" };
  if (q.error || !q.code) return { returnTo, error: "denied" };

  const r = await tokenRequest({ grant_type: "authorization_code", code: q.code, redirect_uri: redirectUri(), code_verifier: saved.v });
  if (!r.ok) return { returnTo, error: "exchange" };
  const scopes = r.data.scope ?? "";
  // Google lets people untick scopes on the consent screen.
  if (!scopes.split(" ").includes(SHEETS_SCOPE)) {
    await revoke(r.data.access_token);
    return { returnTo, error: "scope" };
  }
  const values = {
    workspaceId: ctx.workspaceId,
    membershipId: ctx.membershipId,
    provider: PROVIDER,
    accountEmail: emailFromIdToken(r.data.id_token),
    scopes,
    accessTokenEnc: encrypt(r.data.access_token),
    refreshTokenEnc: r.data.refresh_token ? encrypt(r.data.refresh_token) : null,
    expiresAt: new Date(Date.now() + r.data.expires_in * 1000),
    status: "active" as const,
    updatedAt: new Date(),
  };
  await db
    .insert(integrationConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [integrationConnections.membershipId, integrationConnections.provider],
      set: {
        ...values,
        // prompt=consent normally returns a new refresh token; keep the old one if it did not.
        refreshTokenEnc: sql`coalesce(excluded.refresh_token_enc, ${integrationConnections.refreshTokenEnc})`,
      },
    });
  await logActivity(ctx, { entityType: "integration", action: "connected", data: { provider: PROVIDER } });
  return { returnTo };
}

async function revoke(token: string) {
  try {
    await fetch(REVOKE_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
  } catch {
    // best effort
  }
}

async function loadConnection(ctx: Ctx) {
  const [c] = await db
    .select()
    .from(integrationConnections)
    .where(and(eq(integrationConnections.membershipId, ctx.membershipId), eq(integrationConnections.provider, PROVIDER), eq(integrationConnections.workspaceId, ctx.workspaceId)));
  return c ?? null;
}

/** Revokes at Google (best effort) and deletes the stored tokens. */
export async function disconnect(ctx: Ctx) {
  const c = await loadConnection(ctx);
  if (!c) return;
  const token = c.refreshTokenEnc ?? c.accessTokenEnc;
  if (token) {
    try {
      await revoke(decrypt(token));
    } catch {
      // undecryptable (key rotated): nothing to revoke with
    }
  }
  await db.delete(integrationConnections).where(eq(integrationConnections.id, c.id));
  await logActivity(ctx, { entityType: "integration", action: "disconnected", data: { provider: PROVIDER } });
}

export type GoogleStatus = { connected: boolean; email: string | null; status: "active" | "revoked" | null; configured: boolean };

export async function getStatus(ctx: Ctx): Promise<GoogleStatus> {
  const c = await loadConnection(ctx);
  return {
    connected: !!c && c.status === "active",
    email: c?.accountEmail ?? null,
    status: c?.status ?? null,
    configured: googleConfigured(),
  };
}

async function markRevoked(id: string) {
  await db.update(integrationConnections).set({ status: "revoked", accessTokenEnc: null, updatedAt: new Date() }).where(eq(integrationConnections.id, id));
}

/**
 * A valid access token for the caller's Google connection, refreshed when it expires within 60 s
 * (or when `force`). A refused refresh (`invalid_grant`: revoked, expired, password change) marks
 * the connection revoked and throws the reconnect error.
 */
export async function getAccessToken(ctx: Ctx, opts: { force?: boolean } = {}): Promise<string> {
  requireConfigured();
  const c = await loadConnection(ctx);
  if (!c) throw reconnect("Connect your Google account first.");
  if (c.status === "revoked") throw reconnect();
  if (!opts.force && c.accessTokenEnc && c.expiresAt && c.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now()) {
    return decrypt(c.accessTokenEnc);
  }
  if (!c.refreshTokenEnc) {
    await markRevoked(c.id);
    throw reconnect();
  }
  const r = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(c.refreshTokenEnc) });
  if (!r.ok) {
    if (r.error === "invalid_grant" || r.status === 401) {
      await markRevoked(c.id);
      throw reconnect();
    }
    throw new AppError("integration", "Google did not refresh the connection. Try again in a moment.");
  }
  await db
    .update(integrationConnections)
    .set({
      accessTokenEnc: encrypt(r.data.access_token),
      expiresAt: new Date(Date.now() + r.data.expires_in * 1000),
      ...(r.data.refresh_token ? { refreshTokenEnc: encrypt(r.data.refresh_token) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(integrationConnections.id, c.id));
  return r.data.access_token;
}

// ---------------------------------------------------------------- Sheets

export const NO_ACCESS = "You don't have access to this spreadsheet with the connected Google account.";
const RETRY_DELAYS_MS = [500, 1500];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Calls the Sheets API with the caller's token. 401 → one forced refresh, then reconnect.
 * 429 → retried twice with backoff. 403/404 → "no access" (or a precise reason when Google gives one).
 */
export async function sheetsFetch<T>(ctx: Ctx, url: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  let token = await getAccessToken(ctx);
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: init.method ?? "GET",
        headers: { authorization: `Bearer ${token}`, ...(init.json !== undefined ? { "content-type": "application/json" } : {}) },
        body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      });
    } catch {
      throw new AppError("integration", "Could not reach Google Sheets. Try again.");
    }
    if (res.ok) return (await res.json()) as T;

    const err = await res.json().catch(() => null);
    const reasons: string[] = (err?.error?.details ?? []).map((d: { reason?: string }) => d.reason).filter(Boolean);
    if (res.status === 401) {
      const c = await loadConnection(ctx);
      if (refreshed) {
        if (c) await markRevoked(c.id);
        throw reconnect();
      }
      token = await getAccessToken(ctx, { force: true });
      refreshed = true;
      continue;
    }
    if (res.status === 429 && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    if (res.status === 429) throw new AppError("integration", "Google Sheets is rate-limiting requests. Wait a minute and try again.");
    if (res.status === 403 && reasons.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")) {
      throw reconnect("The connected Google account did not grant access to Google Sheets. Reconnect Google and allow Sheets.");
    }
    if (res.status === 403 && reasons.includes("SERVICE_DISABLED")) {
      throw new AppError("integration", "The Google Sheets API is not enabled in this app's Google Cloud project. Ask an admin to enable it.");
    }
    if (res.status === 403 || res.status === 404) throw new AppError("integration", NO_ACCESS, { reason: "no_access" });
    if (res.status === 400) throw new AppError("invalid", `Google Sheets rejected the request: ${err?.error?.message ?? "bad request"}`);
    throw new AppError("integration", `Google Sheets returned an error (${res.status}). Try again.`);
  }
}

/** Accepts a full Google Sheets URL or a bare spreadsheet ID. */
export function parseSpreadsheetId(input: string): string {
  const s = input.trim();
  const fromUrl = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (fromUrl) return fromUrl;
  if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) return s;
  throw new AppError("invalid", "Paste a Google Sheets link or a spreadsheet ID.");
}

/** A1 notation for a whole worksheet: quoted, with single quotes doubled. */
const sheetRange = (title: string) => `'${title.replace(/'/g, "''")}'`;

type SheetProps = { sheetId: number; title: string; sheetType?: string; gridProperties?: { rowCount?: number; columnCount?: number } };

export async function inspectSpreadsheet(ctx: Ctx, spreadsheet: string) {
  const id = parseSpreadsheetId(spreadsheet);
  const meta = await sheetsFetch<{ properties: { title: string }; sheets?: { properties: SheetProps }[] }>(
    ctx,
    `${SHEETS}/${encodeURIComponent(id)}?fields=${encodeURIComponent("properties.title,sheets.properties")}`,
  );
  const sheets = (meta.sheets ?? [])
    .map((s) => s.properties)
    .filter((p) => (p.sheetType ?? "GRID") === "GRID")
    .map((p) => ({ title: p.title, rowCount: p.gridProperties?.rowCount ?? 0, sheetId: p.sheetId }));
  return { id, title: meta.properties.title, sheets };
}

/**
 * Reads the chosen worksheets' evaluated values (UNFORMATTED_VALUE; dates as their formatted text).
 * We never execute formulas: Google returns the values it already computed.
 */
export async function readSpreadsheet(ctx: Ctx, spreadsheet: string, sheetTitles?: string[]): Promise<ParsedWorkbook> {
  const meta = await inspectSpreadsheet(ctx, spreadsheet);
  const titles = sheetTitles?.length ? sheetTitles : meta.sheets.map((s) => s.title);
  const missing = titles.filter((t) => !meta.sheets.some((s) => s.title === t));
  if (missing.length) throw new AppError("invalid", `Worksheet not found: ${missing.join(", ")}`);

  const sheets: ParsedWorkbook["sheets"] = [];
  let cells = 0;
  // Batched reads; 40 ranges per call keeps the URL well under Google's limit.
  for (let i = 0; i < titles.length; i += 40) {
    const chunk = titles.slice(i, i + 40);
    const qs = new URLSearchParams({ valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "FORMATTED_STRING", majorDimension: "ROWS" });
    for (const t of chunk) qs.append("ranges", sheetRange(t));
    const res = await sheetsFetch<{ valueRanges?: { values?: unknown[][] }[] }>(ctx, `${SHEETS}/${encodeURIComponent(meta.id)}/values:batchGet?${qs}`);
    chunk.forEach((name, j) => {
      const rows = (res.valueRanges?.[j]?.values ?? []).map((r) => r.map(toCell));
      cells += rows.reduce((n, r) => n + r.length, 0);
      sheets.push({ name, rows });
    });
    if (cells > MAX_CELLS) throw new AppError("too_large", "This spreadsheet is too large to import. Pick fewer worksheets or split it.");
  }
  return { source: "google", label: meta.title, sheets };
}

const toCell = (v: unknown): Cell => (typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : v == null ? null : String(v));

// ---------------------------------------------------------------- Export

export type ExportTarget = { target: "new" } | { target: "existing"; spreadsheet: string; sheetTitle?: string };

// The bundle prefixes risky text with ' for CSV/XLSX. RAW already stores text as text, and would keep
// that quote visibly, so it is removed here: the sheet shows exactly what the user typed.
const tableValues = (t: ExportTable) => [t.header, ...t.rows.map((r) => r.map((v) => (typeof v === "string" ? unescapeCell(v) : (v ?? ""))))];
const grid = (t: ExportTable) => ({ rowCount: Math.max(t.rows.length + 1, 2), columnCount: Math.max(t.header.length, 1) });

/** Picks titles not already used in the spreadsheet: "Projects 2026-11-04", then "… (2)". */
export function uniqueTitles(bases: string[], taken: string[], date: string) {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  return bases.map((b) => {
    let title = `${b} ${date}`;
    for (let n = 2; used.has(title.toLowerCase()); n++) title = `${b} ${date} (${n})`;
    used.add(title.toLowerCase());
    return title;
  });
}

/**
 * Writes the export as two worksheets, either in a new spreadsheet or added to an existing one.
 * valueInputOption=RAW: Google stores every value as given, so text that starts with "=" stays text.
 */
export async function exportToSheets(ctx: Ctx, bundle: ExportBundle, target: ExportTarget, today: string): Promise<{ url: string }> {
  let id: string;
  let url: string;
  let titles: [string, string];

  if (target.target === "new") {
    titles = ["Projects", "Tasks"];
    const created = await sheetsFetch<{ spreadsheetId: string; spreadsheetUrl: string }>(ctx, SHEETS, {
      method: "POST",
      json: {
        properties: { title: `Candid export ${today}` },
        sheets: [
          { properties: { title: titles[0], gridProperties: grid(bundle.projects) } },
          { properties: { title: titles[1], gridProperties: grid(bundle.tasks) } },
        ],
      },
    });
    id = created.spreadsheetId;
    url = created.spreadsheetUrl;
  } else {
    const meta = await inspectSpreadsheet(ctx, target.spreadsheet);
    id = meta.id;
    const base = target.sheetTitle?.trim();
    titles = uniqueTitles(base ? [`${base} projects`, `${base} tasks`] : ["Projects", "Tasks"], meta.sheets.map((s) => s.title), today) as [string, string];
    const res = await sheetsFetch<{ replies: { addSheet: { properties: { sheetId: number } } }[] }>(ctx, `${SHEETS}/${encodeURIComponent(id)}:batchUpdate`, {
      method: "POST",
      json: {
        requests: [
          { addSheet: { properties: { title: titles[0], gridProperties: grid(bundle.projects) } } },
          { addSheet: { properties: { title: titles[1], gridProperties: grid(bundle.tasks) } } },
        ],
      },
    });
    url = `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${res.replies[0].addSheet.properties.sheetId}`;
  }

  await sheetsFetch(ctx, `${SHEETS}/${encodeURIComponent(id)}/values:batchUpdate`, {
    method: "POST",
    json: {
      valueInputOption: "RAW",
      data: [
        { range: `${sheetRange(titles[0])}!A1`, majorDimension: "ROWS", values: tableValues(bundle.projects) },
        { range: `${sheetRange(titles[1])}!A1`, majorDimension: "ROWS", values: tableValues(bundle.tasks) },
      ],
    },
  });
  await logActivity(ctx, {
    entityType: "export",
    action: "google_sheets",
    data: { target: target.target, projects: bundle.projects.rows.length, tasks: bundle.tasks.rows.length },
  });
  return { url };
}
