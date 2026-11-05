import { describe, expect, it } from "vitest";
import { makeCtx } from "../../test/factory";
import { createLabel, deleteLabel, listLabels, setProjectLabels } from "./labels";
import { createProject, getProject, listProjectSummaries, updateProject } from "./projects";

describe("labels", () => {
  it("assigns labels to a project and lists them in summaries", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Hiring" });
    const a = await createLabel(ctx, { name: "Urgent", color: "negative" });
    const b = await createLabel(ctx, { name: "Construction" });
    await setProjectLabels(ctx, p.id, [a.id, b.id]);
    const [s] = await listProjectSummaries(ctx);
    expect(s.labels.map((l) => l.name)).toEqual(["Construction", "Urgent"]);
    expect((await getProject(ctx, p.id)).labelIds.sort()).toEqual([a.id, b.id].sort());
    await deleteLabel(ctx, a.id);
    expect((await listProjectSummaries(ctx))[0].labels).toHaveLength(1);
  });

  it("rejects duplicate names and labels of another workspace", async () => {
    const a = await makeCtx();
    const other = await makeCtx();
    await createLabel(a, { name: "X" });
    await expect(createLabel(a, { name: "X" })).rejects.toMatchObject({ code: "invalid" });
    const foreign = await createLabel(other, { name: "Theirs" });
    const p = await createProject(a, { name: "P" });
    await expect(setProjectLabels(a, p.id, [foreign.id])).rejects.toMatchObject({ code: "not_found" });
    expect(await listLabels(a)).toHaveLength(1);
  });

  it("saves the client contact and validates the email", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "C" });
    const u = await updateProject(ctx, p.id, { contactName: "Jana", contactEmail: "jana@example.cz", contactPhone: "+420 777 123 456", version: 1 });
    expect(u).toMatchObject({ contactName: "Jana", contactEmail: "jana@example.cz" });
    await expect(updateProject(ctx, p.id, { contactEmail: "nope", version: u.version })).rejects.toThrow();
  });
});
