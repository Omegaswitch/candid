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

describe("permanent delete", () => {
  it("is refused until the project is archived, then removes it and its tasks", async () => {
    const { deleteArchivedProject, setArchived } = await import("./projects");
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Delete me", tasks: [{ title: "a" }] });
    await expect(deleteArchivedProject(ctx, p.id)).rejects.toMatchObject({ code: "invalid" });
    await setArchived(ctx, p.id, true);
    await deleteArchivedProject(ctx, p.id);
    await expect(getProject(ctx, p.id)).rejects.toMatchObject({ code: "not_found" });
  });
  it("another workspace cannot delete it", async () => {
    const { deleteArchivedProject, setArchived } = await import("./projects");
    const a = await makeCtx();
    const b = await makeCtx();
    const p = await createProject(a, { name: "Mine" });
    await setArchived(a, p.id, true);
    await expect(deleteArchivedProject(b, p.id)).rejects.toMatchObject({ code: "not_found" });
  });
  it("new projects start with the default checklist", async () => {
    const { ensureDefaultTemplates } = await import("./templates");
    const ctx = await makeCtx();
    await ensureDefaultTemplates(ctx);
    const p = await createProject(ctx, { name: "Defaulted" });
    const { tasks } = await getProject(ctx, p.id);
    expect(tasks.map((x) => x.title)).toEqual(["Candidate outreach", "Write email", "Invoicing", "Presentation"]);
  });
});

describe("duplicateProject", () => {
  it("copies labels and the client contact", async () => {
    const { duplicateProject } = await import("./projects");
    const { createLabel, setProjectLabels } = await import("./labels");
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Src", tasks: [{ title: "a" }] });
    await updateProject(ctx, p.id, { contactName: "Jana", contactEmail: "jana@example.com", contactPhone: "+420 123", version: p.version });
    const l = await createLabel(ctx, { name: "IT" });
    await setProjectLabels(ctx, p.id, [l.id]);
    const copy = await duplicateProject(ctx, p.id, { includeNotes: false, includeDates: false });
    const got = await getProject(ctx, copy.id);
    expect(got.labelIds).toEqual([l.id]);
    expect(got.project).toMatchObject({ contactName: "Jana", contactEmail: "jana@example.com", contactPhone: "+420 123" });
  });
});

describe("batched writes and reads", () => {
  it("reorders projects and tasks in one statement, scoped to the workspace", async () => {
    const { reorderProjects } = await import("./projects");
    const { reorderTasks } = await import("./tasks");
    const ctx = await makeCtx();
    const other = await makeCtx();
    const [a, b, c] = [await createProject(ctx, { name: "A" }), await createProject(ctx, { name: "B" }), await createProject(ctx, { name: "C" })];
    await reorderProjects(ctx, [c.id, a.id, b.id]);
    expect((await listProjectSummaries(ctx)).map((s) => [s.name, s.position])).toEqual([["C", 0], ["A", 1], ["B", 2]]);
    await expect(reorderProjects(other, [a.id])).rejects.toMatchObject({ code: "not_found" });

    const p = await createProject(ctx, { name: "Steps", tasks: [{ title: "one" }, { title: "two" }, { title: "three" }] });
    const ids = (await getProject(ctx, p.id)).tasks.map((t) => t.id);
    await reorderTasks(ctx, p.id, [ids[2], ids[0], ids[1]]);
    expect((await getProject(ctx, p.id)).tasks.map((t) => [t.title, t.position])).toEqual([["three", 0], ["one", 1], ["two", 2]]);
  });

  it("project detail carries the caller's pin and the project's labels", async () => {
    const { setPinned } = await import("./favorites");
    const { createLabel, setProjectLabels } = await import("./labels");
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Detail" });
    expect(await getProject(ctx, p.id)).toMatchObject({ pinned: false, labelIds: [] });
    const l = await createLabel(ctx, { name: "Pinned" });
    await setProjectLabels(ctx, p.id, [l.id]);
    await setPinned(ctx, "project", p.id, true);
    expect(await getProject(ctx, p.id)).toMatchObject({ pinned: true, labelIds: [l.id] });
  });
});
