import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { activityEvents, apiTokens, memberships } from "@/db/schema";
import { POST } from "@/app/api/mcp/route";
import { makeCtx } from "../../test/factory";
import { createApiToken, ctxFromToken, listApiTokens, revokeApiToken } from "./api-tokens";
import { createProject, getProject } from "./projects";

let rpcId = 0;
const rpc = (token: string | null, method: string, params: unknown = {}) =>
  POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
const callTool = async (token: string, name: string, args: Record<string, unknown>) => {
  const res = await rpc(token, "tools/call", { name, arguments: args });
  expect(res.status).toBe(200);
  const body = await res.json();
  const text = body.result.content[0].text as string;
  return { isError: !!body.result.isError, text, data: body.result.isError ? null : JSON.parse(text) };
};

describe("api tokens", () => {
  it("resolves a valid token to the member's ctx and stores only the hash", async () => {
    const ctx = await makeCtx("member");
    const t = await createApiToken(ctx, { name: "Claude" });
    expect(t.token).toMatch(/^cand_[A-Za-z0-9_-]{43}$/);
    const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, t.id));
    expect(row.tokenHash).not.toContain(t.token);
    expect(await ctxFromToken(t.token)).toMatchObject({ membershipId: ctx.membershipId, workspaceId: ctx.workspaceId, role: "member" });
    expect((await listApiTokens(ctx))[0].lastUsedAt).not.toBeNull();
    expect(await ctxFromToken("cand_nope")).toBeNull();
    expect(await ctxFromToken(null)).toBeNull();
  });

  it("rejects revoked tokens and tokens of removed members", async () => {
    const ctx = await makeCtx();
    const a = await createApiToken(ctx, { name: "A" });
    const b = await createApiToken(ctx, { name: "B" });
    await revokeApiToken(ctx, a.id);
    expect(await ctxFromToken(a.token)).toBeNull();
    expect((await rpc(a.token, "tools/list")).status).toBe(401);
    await db.update(memberships).set({ status: "removed" }).where(eq(memberships.id, ctx.membershipId));
    expect(await ctxFromToken(b.token)).toBeNull();
  });

  it("cannot be listed or revoked by someone in another workspace", async () => {
    const ctx = await makeCtx();
    const other = await makeCtx();
    const t = await createApiToken(ctx, { name: "Mine" });
    expect(await listApiTokens(other)).toHaveLength(0);
    await expect(revokeApiToken(other, t.id)).rejects.toMatchObject({ code: "not_found" });
    expect(await ctxFromToken(t.token)).not.toBeNull();
  });

  it("answers 401 without a token", async () => {
    expect((await rpc(null, "tools/list")).status).toBe(401);
  });
});

describe("mcp endpoint", () => {
  it("initializes, lists tools and round-trips writes with activity", async () => {
    const ctx = await makeCtx();
    const { token } = await createApiToken(ctx, { name: "T" });
    const init = await rpc(token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.status).toBe(200);
    expect((await init.json()).result.serverInfo.name).toBe("candid");

    const tools = (await (await rpc(token, "tools/list")).json()).result.tools.map((t: { name: string }) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["search", "get_project", "create_project", "update_task", "add_label_to_project"]));

    const p = (await callTool(token, "create_project", { name: "Fasáda Novák", client: "Stavby Novák", tasks: ["Zaměření"] })).data;
    await callTool(token, "update_project", { projectId: p.id, status: "waiting", notes: "Hello", dueDate: "2026-12-01" });
    const task = (await callTool(token, "add_task", { projectId: p.id, title: "Rozpočet", assignee: ctx.email })).data;
    await callTool(token, "update_task", { taskId: task.id, done: true });
    await callTool(token, "add_label_to_project", { projectId: p.id, label: "Urgent", create: true });

    const got = (await callTool(token, "get_project", { projectId: p.id })).data;
    expect(got).toMatchObject({ status: "waiting", notes: "Hello", dueDate: "2026-12-01", labels: ["Urgent"] });
    expect(got.tasks.map((t: { title: string; done: boolean }) => [t.title, t.done])).toEqual([["Zaměření", false], ["Rozpočet", true]]);
    expect((await callTool(token, "search", { query: "klient:Novák" })).data.projects[0].id).toBe(p.id);
    expect((await callTool(token, "list_projects", { label: "urg" })).data).toHaveLength(1);

    await callTool(token, "remove_label_from_project", { projectId: p.id, label: "Urgent" });
    expect((await getProject(ctx, p.id)).labelIds).toHaveLength(0);

    const events = await db.select().from(activityEvents).where(eq(activityEvents.projectId, p.id));
    expect(new Set(events.map((e) => e.actorId))).toEqual(new Set([ctx.membershipId]));
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["created", "status_changed", "notes_edited", "completed"]));
  });

  it("never reaches another workspace's data", async () => {
    const mine = await makeCtx();
    const theirs = await makeCtx();
    const foreign = await createProject(theirs, { name: "Secret", tasks: [{ title: "Hidden" }] });
    const { token } = await createApiToken(mine, { name: "T" });

    const get = await callTool(token, "get_project", { projectId: foreign.id });
    expect(get.isError).toBe(true);
    expect(get.text).toMatch(/not_found/);
    expect((await callTool(token, "update_project", { projectId: foreign.id, status: "completed" })).isError).toBe(true);
    expect((await callTool(token, "add_task", { projectId: foreign.id, title: "x" })).isError).toBe(true);
    const taskId = (await getProject(theirs, foreign.id)).tasks[0].id;
    expect((await callTool(token, "update_task", { taskId, done: true })).isError).toBe(true);
    expect((await callTool(token, "list_projects", {})).data).toHaveLength(0);
    expect((await callTool(token, "search", { query: "Secret" })).data.projects).toHaveLength(0);
    expect((await getProject(theirs, foreign.id)).project.status).toBe("active");
  });
});
