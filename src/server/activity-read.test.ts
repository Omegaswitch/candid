import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { activityEvents } from "@/db/schema";
import { makeCtx } from "../../test/factory";
import { listProjectActivity } from "./activity-read";
import { createProject, getProject } from "./projects";
import { createTask, updateTask } from "./tasks";

describe("project activity", () => {
  it("lists the project's events newest first with the actor's name", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Invoices" });
    await createTask(ctx, p.id, { title: "Invoicing" });
    const { tasks } = await getProject(ctx, p.id);
    await updateTask(ctx, tasks[0].id, { done: true, version: tasks[0].version });

    const events = await listProjectActivity(ctx, p.id);
    expect(events.map((e) => e.action)).toEqual(["completed", "created", "created"]);
    expect(events[0]).toMatchObject({ entityType: "task", actorName: "Test Person", data: { title: "Invoicing" } });
  });

  it("only returns events of this project", async () => {
    const ctx = await makeCtx();
    const a = await createProject(ctx, { name: "A" });
    const b = await createProject(ctx, { name: "B" });
    await createTask(ctx, b.id, { title: "Only in B" });
    expect((await listProjectActivity(ctx, a.id)).map((e) => e.action)).toEqual(["created"]);
  });

  it("another workspace cannot read a project's history", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    const p = await createProject(a, { name: "Private" });
    await expect(listProjectActivity(b, p.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("ignores events filed under another workspace even if they name the project", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    const p = await createProject(a, { name: "Mine" });
    // A stray row in workspace B pointing at A's project must never surface in A's history.
    await db.insert(activityEvents).values({ workspaceId: b.workspaceId, actorId: b.membershipId, projectId: p.id, entityType: "project", action: "renamed" });
    const events = await listProjectActivity(a, p.id);
    expect(events.map((e) => e.action)).toEqual(["created"]);
  });

  it("does not show a name for an actor from another workspace", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    const p = await createProject(a, { name: "Mine" });
    await db.insert(activityEvents).values({ workspaceId: a.workspaceId, actorId: b.membershipId, projectId: p.id, entityType: "project", action: "edited" });
    const [latest] = await listProjectActivity(a, p.id);
    expect(latest).toMatchObject({ action: "edited", actorName: null });
  });
});
