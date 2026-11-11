import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { memberships, oauthGrants } from "@/db/schema";
import { POST as mcpPost } from "@/app/api/mcp/route";
import { GET as asMetadata } from "@/app/.well-known/oauth-authorization-server/[[...path]]/route";
import { GET as prMetadata } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { POST as registerPost } from "@/app/oauth/register/route";
import { POST as tokenPost } from "@/app/oauth/token/route";
import { makeCtx } from "../../test/factory";
import type { Ctx } from "./context";
import { baseUrl, checkAuthorizeRequest, issueCode, listGrants, redirectMatches, revokeGrant } from "./oauth";
import { createProject } from "./projects";

const BASE = baseUrl();
const RESOURCE = `${BASE}/api/mcp`;
const CLAUDE_CB = "https://claude.ai/api/mcp/auth_callback";
const ip = () => `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

const register = async (body: unknown) => {
  const res = await registerPost(
    new Request(`${BASE}/oauth/register`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip() }, body: JSON.stringify(body) }),
  );
  return { status: res.status, body: await res.json(), res };
};

const token = async (params: Record<string, string>) => {
  const res = await tokenPost(
    new Request(`${BASE}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() },
      body: new URLSearchParams(params).toString(),
    }),
  );
  return { status: res.status, body: await res.json(), res };
};

const mcpStatus = async (accessToken: string) =>
  (
    await mcpPost(
      new Request(`${BASE}/api/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    )
  ).status;

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

/** Registers a client and runs the consent step for `ctx`, returning the code and everything needed to redeem it. */
async function authorize(ctx: Ctx, opts: { redirectUri?: string; clientId?: string } = {}) {
  const redirectUri = opts.redirectUri ?? CLAUDE_CB;
  const clientId = opts.clientId ?? (await register({ client_name: "Claude", redirect_uris: [redirectUri] })).body.client_id;
  const { verifier, challenge } = pkce();
  const check = await checkAuthorizeRequest(
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "xyz",
      scope: "mcp",
      resource: RESOURCE,
    }),
    BASE,
  );
  if (!check.ok) throw new Error(check.message);
  const url = new URL(await issueCode(ctx, check.request, BASE));
  expect(url.searchParams.get("state")).toBe("xyz");
  expect(url.searchParams.get("iss")).toBe(BASE);
  return { clientId, verifier, redirectUri, code: url.searchParams.get("code")! };
}

async function connect(ctx: Ctx) {
  const a = await authorize(ctx);
  const t = await token({ grant_type: "authorization_code", code: a.code, code_verifier: a.verifier, client_id: a.clientId, redirect_uri: a.redirectUri, resource: RESOURCE });
  expect(t.status).toBe(200);
  return { ...a, access: t.body.access_token as string, refresh: t.body.refresh_token as string };
}

describe("oauth metadata", () => {
  it("serves protected resource and authorization server metadata with CORS", async () => {
    const root = await prMetadata(new Request(`${BASE}/.well-known/oauth-protected-resource`), { params: Promise.resolve({}) });
    const suffixed = await prMetadata(new Request(`${BASE}/.well-known/oauth-protected-resource/api/mcp`), { params: Promise.resolve({ path: ["api", "mcp"] }) });
    expect(root.headers.get("access-control-allow-origin")).toBe("*");
    const pr = await suffixed.json();
    expect(await root.json()).toEqual(pr);
    expect(pr).toMatchObject({ resource: RESOURCE, authorization_servers: [BASE], scopes_supported: ["mcp"], bearer_methods_supported: ["header"] });
    expect((await prMetadata(new Request(`${BASE}/x`), { params: Promise.resolve({ path: ["other"] }) })).status).toBe(404);

    const as = await (await asMetadata(new Request(`${BASE}/.well-known/oauth-authorization-server`), { params: Promise.resolve({}) })).json();
    expect(as).toMatchObject({
      issuer: BASE,
      authorization_endpoint: `${BASE}/oauth/authorize`,
      token_endpoint: `${BASE}/oauth/token`,
      registration_endpoint: `${BASE}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      authorization_response_iss_parameter_supported: true,
    });
  });

  it("challenges unauthenticated MCP requests with the resource metadata URL", async () => {
    const res = await mcpPost(new Request(`${BASE}/api/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp", scope="mcp"`);
  });
});

describe("dynamic client registration", () => {
  it("registers public clients and validates redirect URIs", async () => {
    const ok = await register({ client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_method: "client_secret_post" });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ client_name: "ChatGPT", token_endpoint_auth_method: "none", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"] });
    expect(ok.body.client_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ok.body.client_secret).toBeUndefined();
    expect(ok.res.headers.get("cache-control")).toBe("no-store");

    expect((await register({ redirect_uris: ["http://localhost:3118/callback"] })).status).toBe(201);
    for (const bad of [["http://evil.example/cb"], ["javascript:alert(1)"], ["https://x.example/cb#frag"], [], ["https://a.example/\"x"]]) {
      const r = await register({ redirect_uris: bad });
      expect(r.status).toBe(400);
      expect(["invalid_redirect_uri", "invalid_client_metadata"]).toContain(r.body.error);
    }
    expect((await register({ redirect_uris: [CLAUDE_CB], grant_types: ["client_credentials"] })).status).toBe(400);
  });

  it("matches loopback redirects on any port, everything else exactly", () => {
    expect(redirectMatches(["http://localhost/callback"], "http://localhost:51234/callback")).toBe(true);
    expect(redirectMatches(["http://127.0.0.1:1/callback"], "http://127.0.0.1:2/callback")).toBe(true);
    expect(redirectMatches(["http://localhost/callback"], "http://localhost:5/other")).toBe(false);
    expect(redirectMatches([CLAUDE_CB], `${CLAUDE_CB}/`)).toBe(false);
    expect(redirectMatches([CLAUDE_CB], "https://claude.ai:444/api/mcp/auth_callback")).toBe(false);
  });
});

describe("authorization request", () => {
  it("never redirects to an unknown client or unregistered URI, and reports other errors to the client", async () => {
    const { body } = await register({ redirect_uris: [CLAUDE_CB] });
    const { challenge } = pkce();
    const p = (over: Record<string, string>) =>
      new URLSearchParams({ client_id: body.client_id, redirect_uri: CLAUDE_CB, response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "s", ...over });
    expect(await checkAuthorizeRequest(p({ client_id: crypto.randomUUID() }), BASE)).toMatchObject({ ok: false, redirect: null });
    expect(await checkAuthorizeRequest(p({ redirect_uri: "https://evil.example/cb" }), BASE)).toMatchObject({ ok: false, redirect: null });

    const errorOf = async (over: Record<string, string>) => {
      const r = await checkAuthorizeRequest(p(over), BASE);
      if (r.ok || !r.redirect) throw new Error("expected a redirect");
      const u = new URL(r.redirect);
      expect(u.origin + u.pathname).toBe(CLAUDE_CB);
      expect(u.searchParams.get("state")).toBe("s");
      expect(u.searchParams.get("iss")).toBe(BASE);
      return u.searchParams.get("error");
    };
    expect(await errorOf({ code_challenge_method: "plain" })).toBe("invalid_request");
    expect(await errorOf({ code_challenge: "" })).toBe("invalid_request");
    expect(await errorOf({ response_type: "token" })).toBe("unsupported_response_type");
    expect(await errorOf({ resource: "https://other.example/mcp" })).toBe("invalid_target");
    expect((await checkAuthorizeRequest(p({ resource: `${RESOURCE}/` }), BASE)).ok).toBe(true);
  });
});

describe("token endpoint", () => {
  it("runs the full code + PKCE flow and the access token reaches MCP as the member", async () => {
    const ctx = await makeCtx("member");
    const c = await connect(ctx);
    expect(c.access).toMatch(/^candat_/);
    expect(c.refresh).toMatch(/^candrt_/);
    expect(await mcpStatus(c.access)).toBe(200);
    const grants = await listGrants(ctx);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ clientName: "Claude", redirectHost: "claude.ai" });
    const [row] = await db.select().from(oauthGrants).where(eq(oauthGrants.id, grants[0].id));
    expect(row.refreshHash).not.toContain(c.refresh);
  });

  it("rejects a wrong verifier, and the code is spent afterwards", async () => {
    const ctx = await makeCtx();
    const a = await authorize(ctx);
    const wrong = await token({ grant_type: "authorization_code", code: a.code, code_verifier: pkce().verifier, client_id: a.clientId });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe("invalid_grant");
    const retry = await token({ grant_type: "authorization_code", code: a.code, code_verifier: a.verifier, client_id: a.clientId });
    expect(retry.body.error).toBe("invalid_grant");
  });

  it("refuses a reused code and revokes what the first exchange issued", async () => {
    const ctx = await makeCtx();
    const c = await connect(ctx);
    const again = await token({ grant_type: "authorization_code", code: c.code, code_verifier: c.verifier, client_id: c.clientId });
    expect(again.body.error).toBe("invalid_grant");
    expect(await mcpStatus(c.access)).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token: c.refresh, client_id: c.clientId })).body.error).toBe("invalid_grant");
  });

  it("refuses a code redeemed by another client, after expiry or for another resource", async () => {
    const ctx = await makeCtx();
    const a = await authorize(ctx);
    const other = (await register({ redirect_uris: [CLAUDE_CB] })).body.client_id;
    expect((await token({ grant_type: "authorization_code", code: a.code, code_verifier: a.verifier, client_id: other })).body.error).toBe("invalid_grant");

    const b = await authorize(ctx);
    expect((await token({ grant_type: "authorization_code", code: b.code, code_verifier: b.verifier, client_id: b.clientId, resource: "https://x.example" })).body.error).toBe(
      "invalid_target",
    );
    const missingClient = await token({ grant_type: "authorization_code", code: "x", code_verifier: "y" });
    expect(missingClient.status).toBe(401);
    expect(missingClient.body.error).toBe("invalid_client");
    expect((await token({ grant_type: "password", client_id: b.clientId })).body.error).toBe("unsupported_grant_type");
  });

  it("rotates refresh tokens and revokes the grant when a rotated token is replayed later", async () => {
    const ctx = await makeCtx();
    const c = await connect(ctx);
    const r1 = await token({ grant_type: "refresh_token", refresh_token: c.refresh, client_id: c.clientId, resource: RESOURCE });
    expect(r1.status).toBe(200);
    expect(r1.body.refresh_token).not.toBe(c.refresh);
    expect(await mcpStatus(r1.body.access_token)).toBe(200);
    // The old access token stays valid until it expires; the old refresh token is dead at once.
    expect(await mcpStatus(c.access)).toBe(200);
    expect((await token({ grant_type: "refresh_token", refresh_token: c.refresh, client_id: c.clientId })).body.error).toBe("invalid_grant");
    // Another client cannot use it either.
    const other = (await register({ redirect_uris: [CLAUDE_CB] })).body.client_id;
    expect((await token({ grant_type: "refresh_token", refresh_token: r1.body.refresh_token, client_id: other })).body.error).toBe("invalid_grant");

    const r2 = await token({ grant_type: "refresh_token", refresh_token: r1.body.refresh_token, client_id: c.clientId });
    expect(r2.status).toBe(200);
    // Replay of r1 well after the rotation: treat as theft, kill the grant.
    const [g] = await listGrants(ctx);
    await db.update(oauthGrants).set({ rotatedAt: new Date(Date.now() - 5 * 60_000) }).where(eq(oauthGrants.id, g.id));
    expect((await token({ grant_type: "refresh_token", refresh_token: r1.body.refresh_token, client_id: c.clientId })).body.error).toBe("invalid_grant");
    expect(await mcpStatus(r2.body.access_token)).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token: r2.body.refresh_token, client_id: c.clientId })).body.error).toBe("invalid_grant");
  });

  it("stops working once the grant is revoked in settings, and only its owner can revoke it", async () => {
    const ctx = await makeCtx();
    const stranger = await makeCtx();
    const c = await connect(ctx);
    const [g] = await listGrants(ctx);
    await expect(revokeGrant(stranger, g.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await mcpStatus(c.access)).toBe(200);
    await revokeGrant(ctx, g.id);
    expect(await listGrants(ctx)).toHaveLength(0);
    expect(await mcpStatus(c.access)).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token: c.refresh, client_id: c.clientId })).body.error).toBe("invalid_grant");
  });

  it("refuses tokens of removed members and tokens bound to another resource", async () => {
    const ctx = await makeCtx();
    const c = await connect(ctx);
    const [g] = await listGrants(ctx);
    await db.update(oauthGrants).set({ resource: "https://elsewhere.example/api/mcp" }).where(eq(oauthGrants.id, g.id));
    expect(await mcpStatus(c.access)).toBe(401);
    await db.update(oauthGrants).set({ resource: RESOURCE }).where(eq(oauthGrants.id, g.id));
    expect(await mcpStatus(c.access)).toBe(200);
    await db.update(memberships).set({ status: "removed" }).where(eq(memberships.id, ctx.membershipId));
    expect(await mcpStatus(c.access)).toBe(401);
    expect((await token({ grant_type: "refresh_token", refresh_token: c.refresh, client_id: c.clientId })).body.error).toBe("invalid_grant");
  });

  it("an access token from one workspace never reaches another workspace's data", async () => {
    const mine = await makeCtx();
    const theirs = await makeCtx();
    const foreign = await createProject(theirs, { name: "Secret" });
    const c = await connect(mine);
    const call = async (name: string, args: Record<string, unknown>) => {
      const res = await mcpPost(
        new Request(`${BASE}/api/mcp`, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${c.access}` },
          body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }),
        }),
      );
      return (await res.json()).result;
    };
    expect((await call("get_project", { projectId: foreign.id })).isError).toBe(true);
    expect(JSON.parse((await call("list_projects", {})).content[0].text)).toHaveLength(0);
    expect(await listGrants(theirs)).toHaveLength(0);
  });
});
