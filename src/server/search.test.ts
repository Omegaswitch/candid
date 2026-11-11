import { describe, expect, it } from "vitest";
import { makeCtx } from "../../test/factory";
import { db } from "@/db";
import { documents, labels, memberships, projectLabels, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { dateRange, hasCriteria, highlight, isMe, parseQuery } from "@/lib/search-query";
import { pushFront } from "@/lib/search-history";
import type { Ctx } from "./context";
import { createProject, setArchived } from "./projects";
import { recentProjects, search } from "./search";
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
    expect(parseQuery('klient:"Stavby Novák" štítek:Urgentní typ:úkol po termínu střecha')).toMatchObject({
      terms: ["střecha"],
      client: "Stavby Novák",
      label: "Urgentní",
      types: ["task"],
      overdue: true,
    });
    expect(parseQuery("client:acme label:vip type:project type:document overdue roof")).toMatchObject({
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

describe("exact phrase search", () => {
  it("parses a double-quoted phrase as one term, mixed with words and filters", () => {
    expect(parseQuery('"site visit" klient:"Stavby Novák" brick').terms).toEqual(["site visit", "brick"]);
    expect(parseQuery('"  Site   VISIT "').terms).toEqual(["Site VISIT"]);
    expect(parseQuery('""').terms).toEqual([]);
    expect(parseQuery('"open phrase').terms).toEqual(["open phrase"]);
  });

  it("matches the phrase only when the words are adjacent, accent- and case-insensitive", async () => {
    const ctx = await makeCtx();
    const a = await createProject(ctx, { name: "Alpha", notes: "Naplánovaná Schůzka s klientem v pondělí" });
    await createProject(ctx, { name: "Beta", notes: "schůzka a potom klient" });
    await createTask(ctx, a.id, { title: "Schuzka s klientem" });
    const r = await search(ctx, '"SCHUZKA S KLIENTEM"');
    expect(r.projects.map((x) => x.name)).toEqual(["Alpha"]);
    expect(r.tasks).toHaveLength(1);
    expect((await search(ctx, "schůzka klient")).projects).toHaveLength(2); // unquoted: words anywhere
    expect(highlight("Naplánovaná Schůzka s klientem", r.query.terms).filter((s) => s.match).map((s) => s.text)).toEqual(["Schůzka s klientem"]);
  });
});


async function member(ctx: Ctx, displayName: string, emailLocal: string) {
  const [m] = await db
    .insert(memberships)
    .values({ workspaceId: ctx.workspaceId, email: `${emailLocal}@test.local`, userId: `test:${emailLocal}${crypto.randomUUID()}`, displayName, status: "active" })
    .returning();
  return m;
}

describe("person and date filter parsing", () => {
  it("parses assignee and owner filters with Czech, accent-free and English keys", () => {
    expect(parseQuery("přiřazeno:Jana vede:Novák")).toMatchObject({ assignee: "Jana", owner: "Novák" });
    expect(parseQuery("prirazeno:ja vlastník:me")).toMatchObject({ assignee: "ja", owner: "me" });
    expect(parseQuery('assignee:"Jana Nováková" OWNER:x')).toMatchObject({ assignee: "Jana Nováková", owner: "x" });
    expect(parseQuery("vlastnik:x").owner).toBe("x");
    expect(isMe("Já")).toBe(true);
    expect(isMe("ME")).toBe(true);
    expect(isMe("Jana")).toBe(false);
  });

  it("parses date filters: today, Nd and an exact day", () => {
    expect(parseQuery("upraveno:dnes vytvořeno:7d termín:2026-11-30").dates).toEqual([
      { field: "updated", kind: "today", negated: false },
      { field: "created", kind: "days", n: 7, negated: false },
      { field: "due", kind: "day", day: "2026-11-30", negated: false },
    ]);
    expect(parseQuery("updated:TODAY created:vytvoreno due:3d").dates.map((d) => d.field + ":" + d.kind)).toEqual(["updated:today", "due:days"]);
    expect(parseQuery("vytvoreno:30d termin:dnes").dates.map((d) => d.field)).toEqual(["created", "due"]);
  });

  it("keeps invalid date values as text", () => {
    const q = parseQuery("upraveno:včera termín:2026-13-40 due:99999d");
    expect(q.dates).toEqual([]);
    expect(q.terms).toEqual(["upraveno:včera", "termín:2026-13-40", "due:99999d"]);
  });

  it("computes the day range relative to today", () => {
    const [upd] = parseQuery("upraveno:7d").dates;
    const [due] = parseQuery("termín:7d").dates;
    const [day] = parseQuery("termín:2026-11-30").dates;
    const [now] = parseQuery("created:dnes").dates;
    expect(dateRange(upd, "2026-11-05")).toEqual({ from: "2026-10-29" });
    expect(dateRange(due, "2026-11-05")).toEqual({ to: "2026-11-12" });
    expect(dateRange(due, "2026-12-28")).toEqual({ to: "2027-01-04" });
    expect(dateRange(day, "2026-11-05")).toEqual({ from: "2026-11-30", to: "2026-11-30" });
    expect(dateRange(now, "2026-11-05")).toEqual({ from: "2026-11-05", to: "2026-11-05" });
  });
});

describe("negation parsing", () => {
  it("negates words, phrases and filters", () => {
    const q = parseQuery('-smlouva střecha -"přesná fráze" -štítek:čekáme -klient:"Stavby X" -typ:dokument -po termínu -upraveno:7d -přiřazeno:já -vede:jan');
    expect(q).toMatchObject({
      terms: ["střecha"],
      notTerms: ["smlouva", "přesná fráze"],
      client: null,
      label: null,
      overdue: false,
      types: [],
      assignee: null,
      owner: null,
    });
    expect(q.not).toEqual({ client: ["Stavby X"], label: ["čekáme"], assignee: ["já"], owner: ["jan"], types: ["document"], overdue: true });
    expect(q.dates).toEqual([{ field: "updated", kind: "days", n: 7, negated: true }]);
    expect(parseQuery("-overdue").not.overdue).toBe(true);
    expect(parseQuery("-stitek:x").not.label).toEqual(["x"]);
  });

  it("treats a lone dash, inner dashes and invalid negated filters as text", () => {
    expect(parseQuery("- e-mail").terms).toEqual(["-", "e-mail"]);
    expect(parseQuery("-upraveno:včera").terms).toEqual(["-upraveno:včera"]);
    expect(parseQuery("-typ:nic").terms).toEqual(["-typ:nic"]);
  });

  it("counts negations as search criteria", () => {
    expect(hasCriteria(parseQuery("-smlouva"))).toBe(true);
    expect(hasCriteria(parseQuery("-label:x"))).toBe(true);
    expect(hasCriteria(parseQuery("upraveno:dnes"))).toBe(true);
    expect(hasCriteria(parseQuery("přiřazeno:já"))).toBe(true);
    expect(hasCriteria(parseQuery(""))).toBe(false);
  });
});

describe("search history helpers", () => {
  it("puts the newest first, removes duplicates and caps the list", () => {
    expect(pushFront(["a", "b", "c"], "b", 5)).toEqual(["b", "a", "c"]);
    expect(pushFront(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
    expect(pushFront(["Střecha"], "střecha", 5, (x, y) => x.toLowerCase() === y.toLowerCase())).toEqual(["střecha"]);
  });
});

describe("recent projects", () => {
  it("returns the workspace's live projects in the requested order and drops the rest", async () => {
    const ctx = await makeCtx();
    const other = await makeCtx();
    const a = await createProject(ctx, { name: "A" });
    const b = await createProject(ctx, { name: "B", client: "Klient" });
    const trashed = await createProject(ctx, { name: "Koš" });
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, trashed.id));
    const foreign = await createProject(other, { name: "Cizí" });
    const r = await recentProjects(ctx, [b.id, foreign.id, trashed.id, a.id, crypto.randomUUID()]);
    expect(r).toEqual([
      { id: b.id, name: "B", client: "Klient", archived: false },
      { id: a.id, name: "A", client: null, archived: false },
    ]);
    expect(await recentProjects(ctx, [])).toEqual([]);
    await expect(recentProjects(ctx, ["nope"])).rejects.toThrow();
  });
});

describe("person filters", () => {
  it("finds tasks by assignee name or e-mail prefix, accent-insensitively, and projects with open assigned tasks", async () => {
    const ctx = await makeCtx();
    const jana = await member(ctx, "Jana Nováková", "jana.n");
    const petr = await member(ctx, "Petr Dvořák", "pdvorak");
    const a = await createProject(ctx, { name: "Dům", ownerId: petr.id });
    const b = await createProject(ctx, { name: "Garáž" });
    const c = await createProject(ctx, { name: "Zahrada" });
    const t1 = await createTask(ctx, a.id, { title: "Okna", assigneeId: jana.id });
    await createTask(ctx, a.id, { title: "Dveře", assigneeId: petr.id });
    const done = await createTask(ctx, b.id, { title: "Vrata", assigneeId: jana.id });
    await updateTask(ctx, done.id, { done: true, version: done.version });
    await createTask(ctx, c.id, { title: "Plot" });

    const byName = await search(ctx, "přiřazeno:novakova", { today: TODAY });
    expect(byName.tasks.map((t) => t.id).sort()).toEqual([t1.id, done.id].sort());
    expect(byName.projects.map((p) => p.id)).toEqual([a.id]); // Garáž only has a finished task
    expect(byName.documents).toEqual([]);
    expect(byName.query.assignee).toBe("novakova");

    expect((await search(ctx, "assignee:JANA.N", { today: TODAY })).tasks).toHaveLength(2);
    expect((await search(ctx, "prirazeno:pdvor okna", { today: TODAY })).tasks).toEqual([]);
    expect((await search(ctx, "prirazeno:dvorak", { today: TODAY })).tasks.map((t) => t.title)).toEqual(["Dveře"]);
    expect((await search(ctx, "prirazeno:nikdo", { today: TODAY })).projects).toEqual([]);
  });

  it("resolves já / me to the current member", async () => {
    const ctx = await makeCtx();
    const other = await member(ctx, "Někdo Jiný", "jiny");
    const p = await createProject(ctx, { name: "Projekt", ownerId: ctx.membershipId });
    const mine = await createTask(ctx, p.id, { title: "Moje", assigneeId: ctx.membershipId });
    await createTask(ctx, p.id, { title: "Cizí", assigneeId: other.id });
    for (const q of ["přiřazeno:já", "prirazeno:ja", "assignee:me"]) {
      expect((await search(ctx, q, { today: TODAY })).tasks.map((t) => t.id)).toEqual([mine.id]);
    }
    expect((await search(ctx, "-assignee:me", { today: TODAY })).tasks.map((t) => t.title)).toEqual(["Cizí"]);
    expect((await search(ctx, "vede:já", { today: TODAY })).projects.map((x) => x.id)).toEqual([p.id]);
  });

  it("filters by project owner across projects, their tasks and documents", async () => {
    const ctx = await makeCtx();
    const ivana = await member(ctx, "Ivana Černá", "ivana");
    const a = await createProject(ctx, { name: "Střecha A", ownerId: ivana.id });
    const b = await createProject(ctx, { name: "Střecha B" });
    await createTask(ctx, a.id, { title: "Střecha úkol A" });
    await createTask(ctx, b.id, { title: "Střecha úkol B" });
    await db.insert(documents).values({ workspaceId: ctx.workspaceId, projectId: a.id, kind: "link", name: "Střecha výkres", url: "https://x.test" });
    await db.insert(documents).values({ workspaceId: ctx.workspaceId, kind: "link", name: "Střecha bez projektu", url: "https://x.test" });

    const r = await search(ctx, "vlastník:cerna strecha", { today: TODAY });
    expect(r.projects.map((x) => x.id)).toEqual([a.id]);
    expect(r.tasks.map((x) => x.title)).toEqual(["Střecha úkol A"]);
    expect(r.documents.map((x) => x.name)).toEqual(["Střecha výkres"]);
    expect((await search(ctx, "owner:test.local", { today: TODAY })).projects).toEqual([]); // e-mail prefix only, not any substring
    expect((await search(ctx, "owner:iva", { today: TODAY })).projects.map((x) => x.id)).toEqual([a.id]);

    const not = await search(ctx, "-vede:ivana strecha", { today: TODAY });
    expect(not.projects.map((x) => x.id)).toEqual([b.id]);
    expect(not.documents.map((x) => x.name)).toEqual(["Střecha bez projektu"]);
  });

  it("never matches members of another workspace", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    const jana = await member(a, "Jana Cizí", "jana.cizi");
    const p = await createProject(a, { name: "A projekt", ownerId: jana.id });
    await createTask(a, p.id, { title: "A úkol", assigneeId: jana.id });
    await createProject(b, { name: "B projekt" });
    expect(await search(b, "prirazeno:jana", { today: TODAY })).toMatchObject({ projects: [], tasks: [] });
    expect(await search(b, "vede:jana", { today: TODAY })).toMatchObject({ projects: [], tasks: [] });
    expect((await search(a, "vede:jana", { today: TODAY })).projects).toHaveLength(1);
  });
});

describe("date filters", () => {
  it("filters by due date: today, within N days (overdue included, open items only) and exact day", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Termíny", dueDate: "2026-11-20" });
    const late = await createTask(ctx, p.id, { title: "T pozdě", dueDate: "2026-11-01" });
    const now = await createTask(ctx, p.id, { title: "T dnes", dueDate: TODAY });
    const soon = await createTask(ctx, p.id, { title: "T brzy", dueDate: "2026-11-10" });
    await createTask(ctx, p.id, { title: "T později", dueDate: "2026-12-24" });
    await createTask(ctx, p.id, { title: "T bez" });
    const done = await createTask(ctx, p.id, { title: "T hotovo", dueDate: "2026-11-06" });
    await updateTask(ctx, done.id, { done: true, version: done.version });
    await db.insert(documents).values({ workspaceId: ctx.workspaceId, projectId: p.id, kind: "link", name: "T dokument", url: "https://x.test" });

    const ids = async (q: string) => (await search(ctx, q, { today: TODAY })).tasks.map((t) => t.id).sort();
    expect(await ids("termín:dnes")).toEqual([now.id]);
    expect(await ids("due:7d")).toEqual([late.id, now.id, soon.id].sort());
    expect(await ids("termin:2026-11-10")).toEqual([soon.id]);
    expect(await ids("-due:7d T")).toEqual((await ids("T")).filter((id) => ![late.id, now.id, soon.id].includes(id)));
    const r = await search(ctx, "termín:60d", { today: TODAY });
    expect(r.documents).toEqual([]);
    expect(r.projects.map((x) => x.id)).toEqual([p.id]);
    expect((await search(ctx, "termín:3d", { today: TODAY })).projects).toEqual([]); // project due 2026-11-20
  });

  it("filters by created and updated day in the viewer's time zone", async () => {
    const ctx = await makeCtx();
    const old = await createProject(ctx, { name: "Starý" });
    const fresh = await createProject(ctx, { name: "Nový" });
    await db.update(projects).set({ createdAt: new Date("2026-10-01T12:00:00Z"), updatedAt: new Date("2026-10-02T12:00:00Z") }).where(eq(projects.id, old.id));
    await db.update(projects).set({ createdAt: new Date("2026-11-05T09:00:00Z"), updatedAt: new Date("2026-11-04T23:30:00Z") }).where(eq(projects.id, fresh.id));
    await db.insert(documents).values({ workspaceId: ctx.workspaceId, kind: "link", name: "Doc nový", url: "https://x.test", createdAt: new Date("2026-11-05T10:00:00Z") });

    const names = async (q: string, tz?: string) => (await search(ctx, q, { today: TODAY, tz })).projects.map((x) => x.name);
    expect(await names("vytvořeno:dnes")).toEqual(["Nový"]);
    expect(await names("created:7d")).toEqual(["Nový"]);
    expect(await names("created:60d")).toEqual(["Nový", "Starý"]);
    expect(await names("vytvoreno:2026-10-01")).toEqual(["Starý"]);
    expect(await names("upraveno:dnes")).toEqual([]); // 23:30 UTC on the 4th
    expect(await names("upraveno:dnes", "Europe/Prague")).toEqual(["Nový"]); // already the 5th in Prague
    expect(await names("upraveno:dnes", "Not/AZone")).toEqual([]); // unknown zone falls back to UTC
    expect(await names("-created:dnes")).toEqual(["Starý"]);
    expect((await search(ctx, "typ:dokument vytvořeno:dnes", { today: TODAY })).documents.map((d) => d.name)).toEqual(["Doc nový"]);
  });
});

describe("negation in search", () => {
  it("excludes words, labels, clients and types, and keeps items missing the field", async () => {
    const ctx = await makeCtx();
    const a = await createProject(ctx, { name: "Dům smlouva", client: "Novák" });
    const b = await createProject(ctx, { name: "Dům plán" });
    const c = await createProject(ctx, { name: "Dům poznámka" });
    await db.update(projects).set({ notes: "Podepsaná smlouva" }).where(eq(projects.id, c.id));
    await label(ctx, b.id, "Čekáme");
    await createTask(ctx, a.id, { title: "Dům úkol smlouva" });
    await createTask(ctx, a.id, { title: "Dům úkol" });
    await db.insert(documents).values({ workspaceId: ctx.workspaceId, kind: "link", name: "Dům dokument", url: "https://x.test" });

    const names = async (q: string) => (await search(ctx, q, { today: TODAY })).projects.map((x) => x.name).sort();
    expect(await names("dum -smlouva")).toEqual(["Dům plán"]); // name and notes both count
    expect(await names("dum -štítek:čekáme")).toEqual(["Dům poznámka", "Dům smlouva"]);
    expect(await names("dum -klient:novak")).toEqual(["Dům plán", "Dům poznámka"]); // no client: not excluded
    expect(await names('dum -"podepsaná smlouva"')).toEqual(["Dům plán", "Dům smlouva"]);
    expect((await search(ctx, "dum -smlouva", { today: TODAY })).tasks.map((t) => t.title)).toEqual(["Dům úkol"]);
    const noDocs = await search(ctx, "dum -typ:dokument", { today: TODAY });
    expect(noDocs.documents).toEqual([]);
    expect(noDocs.projects).toHaveLength(3);
    expect((await search(ctx, "dum -typ:dokument -typ:úkol", { today: TODAY })).tasks).toEqual([]);
    expect((await search(ctx, "-dum", { today: TODAY })).projects).toEqual([]);
  });

  it("works with only negations, and excludes overdue", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Alfa", dueDate: "2026-10-01" });
    await createProject(ctx, { name: "Beta", dueDate: "2026-12-01" });
    await createProject(ctx, { name: "Gama" });
    await createTask(ctx, p.id, { title: "Pozdě", dueDate: "2026-10-01" });
    await createTask(ctx, p.id, { title: "Včas", dueDate: "2026-12-01" });
    expect((await search(ctx, "-alfa", { today: TODAY })).projects.map((x) => x.name).sort()).toEqual(["Beta", "Gama"]);
    const r = await search(ctx, "-po termínu", { today: TODAY });
    expect(r.projects.map((x) => x.name).sort()).toEqual(["Beta", "Gama"]);
    expect(r.tasks.map((x) => x.title)).toEqual(["Včas"]);
    expect((await search(ctx, "-overdue", { today: TODAY })).projects).toHaveLength(2);
  });

  it("keeps trash excluded and stays inside the workspace", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    const p = await createProject(a, { name: "Koš A" });
    await createProject(b, { name: "Jiný B" });
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, p.id));
    expect((await search(a, "-zzz", { today: TODAY })).projects).toEqual([]);
    expect((await search(b, "-zzz", { today: TODAY })).projects.map((x) => x.name)).toEqual(["Jiný B"]);
  });
});
