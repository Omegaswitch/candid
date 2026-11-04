import { describe, expect, it } from "vitest";
import { makeCtx } from "../../test/factory";
import { AppError } from "./errors";
import { createProject, getProject, listProjectSummaries, updateProject, updateProjectNotes } from "./projects";
import { createTask, updateTask } from "./tasks";

describe("projects", () => {
  it("summaries count tasks and pick the next open task", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Bricklayer recruitment", tasks: [{ title: "Candidate outreach" }, { title: "Write email" }] });
    const { tasks } = await getProject(ctx, p.id);
    await updateTask(ctx, tasks[0].id, { done: true, version: tasks[0].version });
    const [s] = await listProjectSummaries(ctx);
    expect(s).toMatchObject({ taskCount: 2, doneCount: 1, nextTask: { title: "Write email" } });
  });

  it("rejects a stale version instead of overwriting", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "A" });
    await updateProject(ctx, p.id, { name: "B", version: 1 });
    await expect(updateProject(ctx, p.id, { name: "C", version: 1 })).rejects.toMatchObject({ code: "conflict" });
  });

  it("never silently overwrites notes: a stale notesVersion returns the server copy", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Notes" });
    await updateProjectNotes(ctx, p.id, "theirs", 1);
    const err = await updateProjectNotes(ctx, p.id, "mine", 1).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.details.current.notes).toBe("theirs");
  });

  it("another workspace cannot read or change a project", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    const p = await createProject(a, { name: "Private" });
    await expect(getProject(b, p.id)).rejects.toMatchObject({ code: "not_found" });
    await expect(createTask(b, p.id, { title: "x" })).rejects.toMatchObject({ code: "not_found" });
    expect(await listProjectSummaries(b)).toHaveLength(0);
  });
});

describe("partial updates", () => {
  it("leave omitted fields untouched", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Keep", client: "Client", status: "waiting", priority: "high" });
    const after = await updateProject(ctx, p.id, { name: "Kept", version: p.version });
    expect(after).toMatchObject({ client: "Client", status: "waiting", priority: "high" });
    const t = await createTask(ctx, p.id, { title: "x", note: "keep me", waiting: true });
    const done = await updateTask(ctx, t.id, { done: true, version: t.version });
    expect(done).toMatchObject({ note: "keep me", waiting: true, done: true });
  });
});
