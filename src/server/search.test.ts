import { describe, expect, it } from "vitest";
import { makeCtx } from "../../test/factory";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { createProject, setArchived } from "./projects";
import { search } from "./search";
import { createTask, setTaskRemoved } from "./tasks";

describe("search", () => {
  it("matches regardless of case and Czech accents, across all groups", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Žluťoučký kůň", client: "Ďábelské ódy" });
    await createTask(ctx, p.id, { title: "PŘÍLIŠ žluťoučký" });
    await db.insert(documents).values({ workspaceId: ctx.workspaceId, projectId: p.id, kind: "link", name: "Žluťoučký brief", url: "https://example.com" });

    const r = await search(ctx, "zlutoucky");
    expect(r.projects.map((x) => x.name)).toEqual(["Žluťoučký kůň"]);
    expect(r.tasks).toMatchObject([{ title: "PŘÍLIŠ žluťoučký", projectId: p.id, projectName: "Žluťoučký kůň", done: false }]);
    expect(r.documents).toMatchObject([{ name: "Žluťoučký brief", projectId: p.id }]);

    expect((await search(ctx, "DABELSKE")).projects).toHaveLength(1); // client name
    expect((await search(ctx, "příliš")).tasks).toHaveLength(1); // accented query
  });

  it("treats % and _ literally", async () => {
    const ctx = await makeCtx();
    await createProject(ctx, { name: "Plain" });
    await createProject(ctx, { name: "Margin 20% up" });
    await createProject(ctx, { name: "snake_case" });
    expect((await search(ctx, "%")).projects.map((x) => x.name)).toEqual(["Margin 20% up"]);
    expect((await search(ctx, "_")).projects.map((x) => x.name)).toEqual(["snake_case"]);
  });

  it("marks archived projects and hides removed tasks and documents", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Old brick" });
    await setArchived(ctx, p.id, true);
    const t = await createTask(ctx, p.id, { title: "Brick order" });
    await setTaskRemoved(ctx, t.id, true);
    await db.insert(documents).values({ workspaceId: ctx.workspaceId, kind: "link", name: "Brick gone", url: "https://x.test", deletedAt: new Date() });
    const r = await search(ctx, "brick");
    expect(r.projects).toMatchObject([{ name: "Old brick", archived: true }]);
    expect(r.tasks).toHaveLength(0);
    expect(r.documents).toHaveLength(0);
  });

  it("never returns another workspace's records", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    const p = await createProject(a, { name: "Secret tender" });
    await createTask(a, p.id, { title: "Secret task" });
    await db.insert(documents).values({ workspaceId: a.workspaceId, kind: "link", name: "Secret doc", url: "https://x.test" });
    expect(await search(b, "secret")).toEqual({ projects: [], tasks: [], documents: [] });
  });

  it("rejects empty and over-long queries", async () => {
    const ctx = await makeCtx();
    await expect(search(ctx, "  ")).rejects.toThrow();
    await expect(search(ctx, "x".repeat(101))).rejects.toThrow();
  });
});
