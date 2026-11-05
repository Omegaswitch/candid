import { describe, expect, it } from "vitest";
import { makeCtx } from "../../test/factory";
import { db } from "@/db";
import { documents, labels, projectLabels, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { highlight, parseQuery } from "@/lib/search-query";
import type { Ctx } from "./context";
import { createProject, setArchived } from "./projects";
import { search } from "./search";
import { createTask, setTaskRemoved, updateTask } from "./tasks";

async function label(ctx: Ctx, projectId: string, name: string) {
  let [l] = await db.select().from(labels).where(eq(labels.workspaceId, ctx.workspaceId)).then((r) => r.filter((x) => x.name === name));
  if (!l) [l] = await db.insert(labels).values({ workspaceId: ctx.workspaceId, name }).returning();
  await db.insert(projectLabels).values({ projectId, labelId: l.id });
}
const TODAY = "2026-11-05";

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
    expect(await search(b, "secret")).toMatchObject({ projects: [], tasks: [], documents: [], more: [] });
  });

  it("rejects empty and over-long queries", async () => {
    const ctx = await makeCtx();
    await expect(search(ctx, "  ")).rejects.toThrow();
    await expect(search(ctx, "x".repeat(101))).rejects.toThrow();
  });
});

describe("search query syntax", () => {
  it("parses Czech and English filters, accent-free keys and quoted values", () => {
    expect(parseQuery('klient:"Stavby Novák" štítek:Urgentní typ:úkol po termínu střecha')).toEqual({
      terms: ["střecha"],
      client: "Stavby Novák",
      label: "Urgentní",
      types: ["task"],
      overdue: true,
    });
    expect(parseQuery("client:acme label:vip type:project type:document overdue roof")).toEqual({
      terms: ["roof"],
      client: "acme",
      label: "vip",
      types: ["project", "document"],
      overdue: true,
    });
    expect(parseQuery("stitek:urgent Po Terminu")).toMatchObject({ label: "urgent", overdue: true, terms: [] });
    expect(parseQuery("KLIENT:x TYP:Dokument")).toMatchObject({ client: "x", types: ["document"] });
  });

  it("keeps unknown keys and type values as text", () => {
    expect(parseQuery("https://example.com typ:nic")).toMatchObject({ terms: ["https://example.com", "typ:nic"], types: [] });
    expect(parseQuery("po terminech")).toMatchObject({ terms: ["po", "terminech"], overdue: false });
  });

  it("highlights accent- and case-insensitively", () => {
    expect(highlight("Přihláška ke stavbě", ["prihlaska", "STAVBE"])).toEqual([
      { text: "Přihláška", match: true },
      { text: " ke ", match: false },
      { text: "stavbě", match: true },
    ]);
  });
});

describe("search coverage and filters", () => {
  it("finds projects by notes and labels, tasks by notes, with snippets", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Rekonstrukce", client: "Novák s.r.o." });
    await db.update(projects).set({ notes: "Domluvit s panem Novákem termín. Přihláška ke stavebnímu povolení podána." }).where(eq(projects.id, p.id));
    await label(ctx, p.id, "Urgentní");
    const t = await createTask(ctx, p.id, { title: "Objednat materiál" });
    await updateTask(ctx, t.id, { note: "Cihly Porotherm, dodání na stavbu v pátek", version: t.version });

    const byNotes = await search(ctx, "prihlaska");
    expect(byNotes.projects).toHaveLength(1);
    expect(byNotes.projects[0].snippet?.text).toContain("Přihláška ke stavebnímu povolení");
    expect(byNotes.projects[0].labels).toEqual([{ name: "Urgentní", color: "neutral" }]);

    const byLabel = await search(ctx, "urgentni");
    expect(byLabel.projects.map((x) => x.id)).toEqual([p.id]);
    expect(byLabel.projects[0].snippet).toBeNull(); // the label explains the match

    const byTaskNote = await search(ctx, "porotherm");
    expect(byTaskNote.tasks).toMatchObject([{ id: t.id, title: "Objednat materiál" }]);
    expect(byTaskNote.tasks[0].snippet?.text).toContain("Porotherm");
    expect((await search(ctx, "objednat")).tasks[0].snippet).toBeNull();
  });

  it("requires every word to match somewhere in the item", async () => {
    const ctx = await makeCtx();
    await createProject(ctx, { name: "Střecha", client: "Brno" });
    await createProject(ctx, { name: "Střecha", client: "Praha" });
    expect((await search(ctx, "strecha brno")).projects.map((x) => x.client)).toEqual(["Brno"]);
  });

  it("filters by client, label, type and overdue", async () => {
    const ctx = await makeCtx();
    const a = await createProject(ctx, { name: "Fasáda", client: "Stavby Novák" });
    const b = await createProject(ctx, { name: "Fasáda", client: "Dvořák" });
    await label(ctx, a.id, "Urgentní");
    await label(ctx, b.id, "Klidné");
    const late = await createTask(ctx, a.id, { title: "Fasáda – lešení", dueDate: "2026-11-01" });
    await createTask(ctx, a.id, { title: "Fasáda – barva", dueDate: "2026-12-01" });
    const lateDone = await createTask(ctx, a.id, { title: "Fasáda – hotovo", dueDate: "2026-10-01" });
    await updateTask(ctx, lateDone.id, { done: true, version: lateDone.version });
    await createTask(ctx, b.id, { title: "Fasáda – Dvořák", dueDate: "2026-10-01" });
    await db.insert(documents).values({ workspaceId: ctx.workspaceId, projectId: b.id, kind: "link", name: "Fasáda výkres", url: "https://x.test" });

    const byClient = await search(ctx, "klient:novak fasada", { today: TODAY });
    expect(byClient.projects.map((x) => x.id)).toEqual([a.id]);
    expect(byClient.tasks).toHaveLength(3);
    expect(byClient.documents).toEqual([]);
    expect(byClient.query).toMatchObject({ client: "novak", terms: ["fasada"] });

    expect((await search(ctx, "stitek:klidne", { today: TODAY })).projects.map((x) => x.id)).toEqual([b.id]);
    expect((await search(ctx, "label:URGENTNÍ", { today: TODAY })).tasks).toHaveLength(3);

    const onlyDocs = await search(ctx, "typ:dokument fasada", { today: TODAY });
    expect(onlyDocs.projects).toEqual([]);
    expect(onlyDocs.tasks).toEqual([]);
    expect(onlyDocs.documents.map((d) => d.name)).toEqual(["Fasáda výkres"]);

    const overdue = await search(ctx, "po termínu štítek:urgentní", { today: TODAY });
    expect(overdue.tasks.map((x) => x.id)).toEqual([late.id]); // done and future tasks excluded
    expect(overdue.documents).toEqual([]);
    expect((await search(ctx, "overdue", { today: TODAY })).tasks.map((x) => x.title).sort()).toEqual(["Fasáda – Dvořák", "Fasáda – lešení"]);
  });

  it("excludes trashed projects and their tasks, and escapes wildcards in filters", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Koš projekt", client: "50%_firma" });
    await createTask(ctx, p.id, { title: "Koš úkol" });
    await createProject(ctx, { name: "Jiný", client: "500 firma" });
    expect((await search(ctx, "klient:50%_")).projects.map((x) => x.name)).toEqual(["Koš projekt"]);
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, p.id));
    const r = await search(ctx, "kos");
    expect(r.projects).toEqual([]);
    expect(r.tasks).toEqual([]);
  });

  it("isolates workspaces for labels and filters", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    const p = await createProject(a, { name: "A projekt", client: "Sdílený klient" });
    await label(a, p.id, "Tajné");
    await createProject(b, { name: "B projekt" });
    expect((await search(b, "stitek:tajne")).projects).toEqual([]);
    expect((await search(b, "klient:sdileny")).projects).toEqual([]);
    expect((await search(b, "tajne")).projects).toEqual([]);
  });

  it("caps each group and reports that more exist", async () => {
    const ctx = await makeCtx();
    for (let i = 0; i < 10; i++) await createProject(ctx, { name: `Dům ${i}` });
    const r = await search(ctx, "dum");
    expect(r.projects).toHaveLength(8);
    expect(r.more).toEqual(["project"]);
    expect((await search(ctx, "typ:projekt dum")).projects).toHaveLength(10);
  });
});
