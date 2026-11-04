import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { integrationConnections } from "@/db/schema";
import { makeCtx } from "../../test/factory";
import type { Ctx } from "./context";
import { decrypt, encrypt } from "./crypto";
import {
  completeConnect,
  createState,
  exportToSheets,
  getAccessToken,
  getStatus,
  NO_ACCESS,
  parseSpreadsheetId,
  readSpreadsheet,
  startConnect,
  uniqueTitles,
  verifyState,
} from "./google";

// Google cannot be reached from tests: every call below goes to a mocked fetch.
type Call = { url: string; init?: RequestInit };
let calls: Call[];
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }));
}
const form = (c: Call) => new URLSearchParams(String(c.init?.body));
const idToken = (claims: object) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("APP_URL", "http://localhost:3100");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function connect(ctx: Ctx, opts: { expiresInMs?: number; refresh?: string | null } = {}) {
  await db.insert(integrationConnections).values({
    workspaceId: ctx.workspaceId,
    membershipId: ctx.membershipId,
    provider: "google",
    accountEmail: "jana@gmail.com",
    scopes: "https://www.googleapis.com/auth/spreadsheets openid email",
    accessTokenEnc: encrypt("old-access"),
    refreshTokenEnc: opts.refresh === null ? null : encrypt(opts.refresh ?? "refresh-1"),
    expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 3600_000)),
  });
}
const row = async (ctx: Ctx) =>
  (await db.select().from(integrationConnections).where(eq(integrationConnections.membershipId, ctx.membershipId)))[0];

describe("OAuth state", () => {
  it("verifies its own signature and rejects tampering or expiry", () => {
    const s = createState({ m: "m1", n: "n1", r: "/x", exp: Date.now() + 60_000 });
    expect(verifyState(s)).toMatchObject({ m: "m1", n: "n1", r: "/x" });
    const [data, sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ m: "m2", n: "n1", r: "/x", exp: Date.now() + 60_000 })).toString("base64url");
    expect(verifyState(`${forged}.${sig}`)).toBeNull();
    expect(verifyState(`${data}.x${sig.slice(1)}`)).toBeNull();
    expect(verifyState(createState({ m: "m1", n: "n1", r: "/x", exp: Date.now() - 1 }))).toBeNull();
    expect(verifyState(null)).toBeNull();
  });

  it("builds the consent URL with the narrow scopes, offline access and PKCE S256", async () => {
    const ctx = await makeCtx("member");
    const { url, cookie } = startConnect(ctx, "//evil.example");
    const u = new URL(url);
    const p = u.searchParams;
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(p.get("scope")).toBe("https://www.googleapis.com/auth/spreadsheets openid email");
    expect(p.get("access_type")).toBe("offline");
    expect(p.get("prompt")).toBe("consent");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("redirect_uri")).toBe("http://localhost:3100/api/google/callback");
    const state = verifyState(p.get("state"))!;
    expect(state.m).toBe(ctx.membershipId);
    expect(state.r).toBe("/settings/integrations"); // open redirect refused
    const saved = JSON.parse(decrypt(cookie));
    expect(saved.n).toBe(state.n);
    expect(url).not.toContain(saved.v); // the verifier never leaves the server/cookie
  });

  it("refuses to start when Google is not configured", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    const ctx = await makeCtx();
    expect(() => startConnect(ctx, null)).toThrow(/not set up/);
    expect((await getStatus(ctx)).configured).toBe(false);
  });
});

describe("callback", () => {
  const begin = async () => {
    const ctx = await makeCtx("member");
    const { url, cookie } = startConnect(ctx, "/import");
    return { ctx, state: new URL(url).searchParams.get("state"), cookie };
  };

  it("exchanges the code with the PKCE verifier and stores tokens encrypted", async () => {
    const { ctx, state, cookie } = await begin();
    mockFetch(() =>
      json(200, {
        access_token: "acc-1",
        refresh_token: "ref-1",
        expires_in: 3599,
        scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/spreadsheets",
        id_token: idToken({ email: "jana@gmail.com" }),
      }),
    );
    const out = await completeConnect(ctx, { code: "code-1", state, error: null, cookie });
    expect(out).toEqual({ returnTo: "/import" });
    const body = form(calls[0]);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe(JSON.parse(decrypt(cookie)).v);
    const r = await row(ctx);
    expect(r.accountEmail).toBe("jana@gmail.com");
    expect(r.accessTokenEnc).not.toContain("acc-1");
    expect(decrypt(r.refreshTokenEnc!)).toBe("ref-1");
    expect(await getStatus(ctx)).toEqual({ connected: true, email: "jana@gmail.com", status: "active", configured: true });
  });

  it("rejects a state from another member, a missing cookie, or a nonce mismatch", async () => {
    const { ctx, state, cookie } = await begin();
    const other = await makeCtx("member", ctx.workspaceId);
    mockFetch(() => json(500, {}));
    expect((await completeConnect(other, { code: "c", state, error: null, cookie })).error).toBe("state");
    expect((await completeConnect(ctx, { code: "c", state, error: null, cookie: undefined })).error).toBe("state");
    const another = startConnect(ctx, null).cookie;
    expect((await completeConnect(ctx, { code: "c", state, error: null, cookie: another })).error).toBe("state");
    expect(calls).toHaveLength(0);
  });

  it("reports a denied consent and an unticked Sheets scope", async () => {
    const { ctx, state, cookie } = await begin();
    mockFetch(() => json(200, { access_token: "a", expires_in: 3600, scope: "openid email" }));
    expect((await completeConnect(ctx, { code: null, state, error: "access_denied", cookie })).error).toBe("denied");
    expect((await completeConnect(ctx, { code: "c", state, error: null, cookie })).error).toBe("scope");
    expect(await row(ctx)).toBeUndefined();
  });
});

describe("access tokens", () => {
  it("uses the stored token while it is valid", async () => {
    const ctx = await makeCtx();
    await connect(ctx);
    mockFetch(() => json(500, {}));
    expect(await getAccessToken(ctx)).toBe("old-access");
    expect(calls).toHaveLength(0);
  });

  it("refreshes within 60 s of expiry and stores the new token", async () => {
    const ctx = await makeCtx();
    await connect(ctx, { expiresInMs: 30_000 });
    mockFetch(() => json(200, { access_token: "new-access", expires_in: 3600 }));
    expect(await getAccessToken(ctx)).toBe("new-access");
    expect(form(calls[0]).get("grant_type")).toBe("refresh_token");
    expect(form(calls[0]).get("refresh_token")).toBe("refresh-1");
    const r = await row(ctx);
    expect(decrypt(r.accessTokenEnc!)).toBe("new-access");
    expect(decrypt(r.refreshTokenEnc!)).toBe("refresh-1");
    expect(r.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 3000_000);
  });

  it("marks the connection revoked on invalid_grant and asks to reconnect", async () => {
    const ctx = await makeCtx();
    await connect(ctx, { expiresInMs: -1000 });
    mockFetch(() => json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." }));
    await expect(getAccessToken(ctx)).rejects.toMatchObject({ code: "integration", details: { reconnect: true } });
    expect((await row(ctx)).status).toBe("revoked");
    expect(await getStatus(ctx)).toMatchObject({ connected: false, status: "revoked" });
    // Later calls fail fast without asking Google again.
    await expect(getAccessToken(ctx)).rejects.toMatchObject({ details: { reconnect: true } });
    expect(calls).toHaveLength(1);
  });

  it("asks to connect when there is no connection", async () => {
    const ctx = await makeCtx();
    await expect(getAccessToken(ctx)).rejects.toMatchObject({ details: { reconnect: true } });
  });
});

describe("Sheets", () => {
  const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
  const META = {
    properties: { title: "Q4 pipeline" },
    sheets: [
      { properties: { sheetId: 0, title: "Projects", gridProperties: { rowCount: 1000 } } },
      { properties: { sheetId: 7, title: "Bob's tasks", gridProperties: { rowCount: 50 } } },
      { properties: { sheetId: 9, title: "Chart", sheetType: "OBJECT" } },
    ],
  };

  it("parses links and IDs", () => {
    expect(parseSpreadsheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toBe(ID);
    expect(parseSpreadsheetId(` ${ID} `)).toBe(ID);
    expect(() => parseSpreadsheetId("https://example.com/foo")).toThrow(/Paste a Google Sheets link/);
  });

  it("reads evaluated values for the chosen worksheets in one batch", async () => {
    const ctx = await makeCtx();
    await connect(ctx);
    mockFetch((url) =>
      url.includes("values:batchGet")
        ? json(200, { valueRanges: [{ values: [["Project", "Due"], ["Alpha", "2026-11-30"], ["=1+1 typed as text", 42, true]] }] })
        : json(200, META),
    );
    const wb = await readSpreadsheet(ctx, ID, ["Bob's tasks"]);
    expect(wb).toEqual({
      source: "google",
      label: "Q4 pipeline",
      sheets: [{ name: "Bob's tasks", rows: [["Project", "Due"], ["Alpha", "2026-11-30"], ["=1+1 typed as text", 42, true]] }],
    });
    const u = new URL(calls[1].url);
    expect(u.searchParams.get("valueRenderOption")).toBe("UNFORMATTED_VALUE");
    expect(u.searchParams.get("dateTimeRenderOption")).toBe("FORMATTED_STRING");
    expect(u.searchParams.getAll("ranges")).toEqual(["'Bob''s tasks'"]);
    expect(calls[0].init?.headers).toMatchObject({ authorization: "Bearer old-access" });
  });

  it("maps 403 and 404 to a plain no-access message", async () => {
    const ctx = await makeCtx();
    await connect(ctx);
    mockFetch(() => json(403, { error: { code: 403, status: "PERMISSION_DENIED" } }));
    await expect(readSpreadsheet(ctx, ID)).rejects.toMatchObject({ message: NO_ACCESS });
    mockFetch(() => json(404, { error: { code: 404 } }));
    await expect(readSpreadsheet(ctx, ID)).rejects.toMatchObject({ message: NO_ACCESS });
  });

  it("on 401 refreshes once and retries; a second 401 marks the connection revoked", async () => {
    const ctx = await makeCtx();
    await connect(ctx);
    mockFetch((url) => (url.includes("oauth2.googleapis.com/token") ? json(200, { access_token: "fresh", expires_in: 3600 }) : json(401, {})));
    await expect(readSpreadsheet(ctx, ID)).rejects.toMatchObject({ code: "integration", details: { reconnect: true } });
    expect(calls.map((c) => (c.url.includes("token") ? "token" : "sheets"))).toEqual(["sheets", "token", "sheets"]);
    expect(calls[2].init?.headers).toMatchObject({ authorization: "Bearer fresh" });
    expect((await row(ctx)).status).toBe("revoked");
  });

  it("retries 429 with backoff, then gives up after two retries", async () => {
    const ctx = await makeCtx();
    await connect(ctx);
    let n = 0;
    mockFetch(() => (n++ < 2 ? json(429, {}) : json(200, META)));
    const wb = await readSpreadsheet(ctx, ID, ["Projects"]);
    expect(wb.sheets).toEqual([{ name: "Projects", rows: [] }]);
    expect(n).toBe(4); // two 429s, then metadata and values
    mockFetch(() => json(429, {}));
    await expect(readSpreadsheet(ctx, ID)).rejects.toMatchObject({ message: /rate-limiting/ });
    expect(calls).toHaveLength(3);
  }, 15_000);

  it("exports to a new spreadsheet with RAW values so text is never a formula", async () => {
    const ctx = await makeCtx();
    await connect(ctx);
    mockFetch((url) =>
      url.endsWith("/spreadsheets")
        ? json(200, { spreadsheetId: "new-id", spreadsheetUrl: "https://docs.google.com/spreadsheets/d/new-id/edit" })
        : json(200, {}),
    );
    const bundle = {
      flat: { name: "flat", header: [], rows: [] },
      projects: { name: "Projects", header: ["Project", "Client"], rows: [["'=HYPERLINK(\"x\")", null]] },
      tasks: { name: "Tasks", header: ["Task"], rows: [["Write email"]] },
    };
    const out = await exportToSheets(ctx, bundle, { target: "new" }, "2026-11-04");
    expect(out.url).toBe("https://docs.google.com/spreadsheets/d/new-id/edit");
    const created = JSON.parse(String(calls[0].init?.body));
    expect(created.sheets.map((s: { properties: { title: string } }) => s.properties.title)).toEqual(["Projects", "Tasks"]);
    const write = JSON.parse(String(calls[1].init?.body));
    expect(calls[1].url).toContain("new-id/values:batchUpdate");
    expect(write.valueInputOption).toBe("RAW");
    expect(write.data[0]).toMatchObject({ range: "'Projects'!A1", values: [["Project", "Client"], ["=HYPERLINK(\"x\")", ""]] });
  });

  it("adds uniquely named worksheets to an existing spreadsheet", async () => {
    expect(uniqueTitles(["Projects", "Tasks"], ["Projects 2026-11-04", "tasks 2026-11-04", "Tasks 2026-11-04 (2)"], "2026-11-04")).toEqual([
      "Projects 2026-11-04 (2)",
      "Tasks 2026-11-04 (3)",
    ]);
    const ctx = await makeCtx();
    await connect(ctx);
    mockFetch((url) =>
      url.includes("values:batchUpdate")
        ? json(200, {})
        : url.includes(":batchUpdate")
          ? json(200, { replies: [{ addSheet: { properties: { sheetId: 11 } } }, { addSheet: { properties: { sheetId: 12 } } }] })
          : json(200, META),
    );
    const bundle = { flat: { name: "", header: [], rows: [] }, projects: { name: "", header: ["P"], rows: [] }, tasks: { name: "", header: ["T"], rows: [] } };
    const out = await exportToSheets(ctx, bundle, { target: "existing", spreadsheet: ID }, "2026-11-04");
    expect(out.url).toBe(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=11`);
    const add = JSON.parse(String(calls[1].init?.body));
    expect(add.requests[0].addSheet.properties.title).toBe("Projects 2026-11-04");
  });
});
