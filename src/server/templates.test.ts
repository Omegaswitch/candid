import { describe, expect, it } from "vitest";
import { makeCtx } from "../../test/factory";
import { createProject, getProject } from "./projects";
import { createTemplate, deleteTemplate, ensureDefaultTemplates, listTemplates, updateTemplate } from "./templates";

describe("templates", () => {
  it("seeds the Recruitment template once, with its tasks in order", async () => {
    const ctx = await makeCtx("member");
    await ensureDefaultTemplates(ctx);
    await ensureDefaultTemplates(ctx);
    const list = await listTemplates(ctx);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Recruitment");
    expect(list[0].tasks.map((t) => t.title)).toEqual(["Candidate outreach", "Write email", "Invoicing", "Presentation"]);
  });

  it("does not bring the default back after an admin deletes it", async () => {
    const ctx = await makeCtx();
    await ensureDefaultTemplates(ctx);
    const [tpl] = await listTemplates(ctx);
    await deleteTemplate(ctx, tpl.id);
    await ensureDefaultTemplates(ctx);
    expect(await listTemplates(ctx)).toHaveLength(0);
    // and the name can be reused
    await createTemplate(ctx, { name: "Recruitment", tasks: [] });
    expect((await listTemplates(ctx)).map((t) => t.name)).toEqual(["Recruitment"]);
  });

  it("members cannot create, edit or delete templates", async () => {
    const admin = await makeCtx();
    const member = await makeCtx("member", admin.workspaceId);
    const tpl = await createTemplate(admin, { name: "Sourcing", tasks: [{ title: "Brief" }] });
    await expect(createTemplate(member, { name: "X", tasks: [] })).rejects.toMatchObject({ code: "forbidden" });
    await expect(updateTemplate(member, tpl.id, { name: "Y", tasks: [], version: tpl.version })).rejects.toMatchObject({ code: "forbidden" });
    await expect(deleteTemplate(member, tpl.id)).rejects.toMatchObject({ code: "forbidden" });
    expect(await listTemplates(member)).toHaveLength(1); // members can read
  });

  it("update replaces the task list in order and rejects a stale version", async () => {
    const ctx = await makeCtx();
    const tpl = await createTemplate(ctx, { name: "Sourcing", tasks: [{ title: "A" }, { title: "B" }] });
    const next = await updateTemplate(ctx, tpl.id, { name: "Sourcing v2", description: "d", tasks: [{ title: "B" }, { title: "C", note: "n" }, { title: "A" }], version: tpl.version });
    expect(next.version).toBe(tpl.version + 1);
    expect(next.tasks.map((t) => [t.title, t.note])).toEqual([["B", ""], ["C", "n"], ["A", ""]]);
    const err = await updateTemplate(ctx, tpl.id, { name: "Late", tasks: [], version: tpl.version }).catch((e) => e);
    expect(err.code).toBe("conflict");
    expect(err.details.current.name).toBe("Sourcing v2");
  });

  it("rejects a duplicate name and another workspace's template", async () => {
    const ctx = await makeCtx();
    const other = await makeCtx();
    const tpl = await createTemplate(ctx, { name: "Sourcing", tasks: [] });
    await expect(createTemplate(ctx, { name: "Sourcing", tasks: [] })).rejects.toMatchObject({ code: "invalid" });
    await expect(updateTemplate(other, tpl.id, { name: "Mine", tasks: [], version: 1 })).rejects.toMatchObject({ code: "not_found" });
  });

  it("editing or deleting a template never changes projects already created from it", async () => {
    const ctx = await makeCtx();
    const tpl = await createTemplate(ctx, { name: "Recruitment", tasks: [{ title: "Candidate outreach" }, { title: "Write email" }] });
    const p = await createProject(ctx, { name: "Bricklayers", templateId: tpl.id });
    await updateTemplate(ctx, tpl.id, { name: "Recruitment", tasks: [{ title: "Something else" }], version: tpl.version });
    expect((await getProject(ctx, p.id)).tasks.map((t) => t.title)).toEqual(["Candidate outreach", "Write email"]);
    await deleteTemplate(ctx, tpl.id);
    expect((await getProject(ctx, p.id)).tasks.map((t) => t.title)).toEqual(["Candidate outreach", "Write email"]);
  });
});
