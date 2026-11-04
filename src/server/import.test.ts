import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { activityEvents, importRuns, memberships, projects, tasks } from "@/db/schema";
import { autoMap } from "@/lib/import/mapping";
import type { Cell, ImportOptions, ImportRequest } from "@/lib/import/types";
import { makeCtx } from "../../test/factory";
import type { Ctx } from "./context";
import { commitImport, previewImport } from "./import";
import { createProject, getProject } from "./projects";

function request(table: Cell[][], options: Partial<ImportOptions> = {}): ImportRequest {
  const [header, ...rows] = table as string[][];
  return { source: "csv", label: "test.csv", header, rows, mapping: autoMap(header), options: { mode: "create", ...options } };
}
const commit = (ctx: Ctx, req: ImportRequest, key: string = crypto.randomUUID()) => commitImport(ctx, { ...req, idempotencyKey: key });
const projectsOf = (ctx: Ctx) => db.select().from(projects).where(eq(projects.workspaceId, ctx.workspaceId));
const tasksOf = (ctx: Ctx) => db.select().from(tasks).where(eq(tasks.workspaceId, ctx.workspaceId));

const SHEET: Cell[][] = [
  ["Project", "Client", "Task", "Completed", "Task due date"],
  ["Nábor zedníků", "Stavby Brno", "Inzerát", "yes", "2026-12-01"],
  ["Nábor zedníků", "Stavby Brno", "Pohovory", "no", ""],
  ["Bez úkolů", "", "", "", ""],
  ["Broken", "", "x", "maybe", ""],
];

describe("import commit", () => {
  it("imports valid rows atomically, reports invalid ones, and logs one event per project", async () => {
    const ctx = await makeCtx();
    const res = await commit(ctx, request(SHEET));
    expect(res).toMatchObject({ replayed: false, created: { projects: 2, tasks: 2 }, failed: 1, rowErrors: [{ row: 5 }] });
    const ps = await projectsOf(ctx);
    expect(ps.map((p) => p.name).sort()).toEqual(["Bez úkolů", "Nábor zedníků"]);
    const ts = await tasksOf(ctx);
    expect(ts.find((x) => x.title === "Inzerát")).toMatchObject({ done: true, dueDate: "2026-12-01", completedBy: ctx.membershipId });
    const events = await db.select().from(activityEvents).where(and(eq(activityEvents.workspaceId, ctx.workspaceId), eq(activityEvents.entityType, "import")));
    expect(events).toHaveLength(2);
  });

  it("is idempotent: the same key twice imports once and returns the first result", async () => {
    const ctx = await makeCtx();
    const key = crypto.randomUUID();
    const first = await commit(ctx, request(SHEET), key);
    const [second, third] = await Promise.all([commit(ctx, request(SHEET), key), commit(ctx, request(SHEET), key)]);
    expect(second).toMatchObject({ replayed: true, runId: first.runId, created: first.created });
    expect(third.replayed).toBe(true);
    expect(await projectsOf(ctx)).toHaveLength(2);
    const runs = await db.select().from(importRuns).where(eq(importRuns.workspaceId, ctx.workspaceId));
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("completed");
  });

  it("refuses more than 5,000 rows with 413", async () => {
    const ctx = await makeCtx();
    const rows = Array.from({ length: 5001 }, (_, i) => ["P", `t${i}`]);
    await expect(previewImport(ctx, request([["Project", "Task"], ...rows]))).rejects.toMatchObject({ code: "too_large", status: 413 });
  });
});

describe("update mode", () => {
  it("matches by ID only: a same-named project without an ID is not touched", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Website", client: "Acme", tasks: [{ title: "Copy" }] });
    const { tasks: [task] } = await getProject(ctx, p.id);
    const res = await commit(
      ctx,
      request(
        [
          ["Project ID", "Task ID", "Project", "Client", "Task", "Completed"],
          [p.id, task.id, "Website", "Acme", "Copy final", "yes"],
          ["", "", "Website", "Acme", "Should not appear", "no"],
        ],
        { mode: "update" },
      ),
    );
    expect(res).toMatchObject({ updated: { projects: 0, tasks: 1 }, created: { projects: 0, tasks: 0 }, skipped: 1 });
    const after = await getProject(ctx, p.id);
    expect(after.tasks).toHaveLength(1);
    expect(after.tasks[0]).toMatchObject({ title: "Copy final", done: true, version: task.version + 1 });
    expect(await projectsOf(ctx)).toHaveLength(1);
  });

  it("rejects an ID from another workspace and changes nothing there", async () => {
    const mine = await makeCtx();
    const other = await makeCtx();
    const foreign = await createProject(other, { name: "Theirs", tasks: [{ title: "Secret" }] });
    const { tasks: [ft] } = await getProject(other, foreign.id);
    const req = request([["Project ID", "Task ID", "Project", "Task"], [foreign.id, ft.id, "Mine now", "Hacked"]], { mode: "update", createMissing: true });
    const plan = await previewImport(mine, req);
    expect(plan.issues.map((i) => i.code)).toEqual(["unknownProjectId", "unknownTaskId"]);
    const res = await commit(mine, req);
    expect(res).toMatchObject({ failed: 1, created: { projects: 0, tasks: 0 }, updated: { projects: 0, tasks: 0 } });
    expect((await getProject(other, foreign.id)).tasks[0].title).toBe("Secret");
  });

  it("never creates a person for an unknown assignee email", async () => {
    const ctx = await makeCtx();
    const before = await db.select().from(memberships).where(eq(memberships.workspaceId, ctx.workspaceId));
    const res = await commit(ctx, request([["Project", "Task", "Assignee email"], ["P", "T", "stranger@example.com"]]));
    expect(res.created.tasks).toBe(1);
    const after = await db.select().from(memberships).where(eq(memberships.workspaceId, ctx.workspaceId));
    expect(after).toHaveLength(before.length);
    expect((await tasksOf(ctx))[0].assigneeId).toBeNull();
  });
});
