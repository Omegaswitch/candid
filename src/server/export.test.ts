import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { autoMap } from "@/lib/import/mapping";
import { parseCsv, parseXlsx, splitHeader } from "@/lib/import/parse";
import type { ParsedWorkbook } from "@/lib/import/types";
import { makeCtx } from "../../test/factory";
import type { Ctx } from "./context";
import { buildExportBundle, templateXlsx, toCsv, toXlsx } from "./export";
import { commitImport, previewImport } from "./import";
import { createLabel, listLabels, setProjectLabels } from "./labels";
import { createProject, getProject, setArchived, updateProject } from "./projects";

const counts = async (ctx: Ctx) => ({
  projects: (await db.select().from(projects).where(eq(projects.workspaceId, ctx.workspaceId))).length,
  tasks: (await db.select().from(tasks).where(eq(tasks.workspaceId, ctx.workspaceId))).length,
});

function reimport(wb: ParsedWorkbook, mode: "create" | "update" = "update") {
  const { header, rows, firstRow } = splitHeader(wb.sheets[0].rows);
  return { source: wb.source, label: wb.label, header, rows, firstRow, mapping: autoMap(header), options: { mode } };
}

async function seed() {
  const ctx = await makeCtx();
  const a = await createProject(ctx, { name: "Příliš žluťoučký kůň", client: "=HYPERLINK(\"x\")", tasks: [{ title: "+420 call" }, { title: "Úkol dva" }] });
  const empty = await createProject(ctx, { name: "No tasks yet" });
  const old = await createProject(ctx, { name: "Old one" });
  await setArchived(ctx, old.id, true);
  return { ctx, a, empty, old };
}

describe("export", () => {
  it("builds every scope; projects without tasks keep a row; text is escaped", async () => {
    const { ctx, a, empty, old } = await seed();
    const all = await buildExportBundle(ctx, { scope: "workspace" });
    expect(all.flat.header.slice(0, 3)).toEqual(["Project ID", "Task ID", "Project"]);
    expect(all.flat.header.slice(-6)).toEqual(["Completed at", "Completed by", "Archived", "Created at", "Updated at", "Project archived at"]);
    expect(all.flat.rows).toHaveLength(3); // 2 tasks + 1 empty project
    expect(all.projects.rows.map((r) => r[0])).toEqual(expect.arrayContaining([a.id, empty.id]));
    expect(all.flat.rows.find((r) => r[0] === empty.id)?.[1]).toBeNull();
    const row = all.flat.rows.find((r) => r[13] === "'+420 call")!;
    expect(row[3]).toBe("'=HYPERLINK(\"x\")");

    expect((await buildExportBundle(ctx, { scope: "workspace", includeArchived: true })).projects.rows).toHaveLength(3);
    expect((await buildExportBundle(ctx, { scope: "project", ids: [a.id] })).tasks.rows).toHaveLength(2);
    expect((await buildExportBundle(ctx, { scope: "selected", ids: [empty.id, old.id] })).projects.rows).toHaveLength(2);
    expect((await buildExportBundle(ctx, "active")).projects.rows).toHaveLength(2);
    const other = await makeCtx();
    expect((await buildExportBundle(other, { scope: "view", ids: [a.id] })).projects.rows).toHaveLength(0);
    await expect(buildExportBundle(other, { scope: "project", ids: [a.id] })).rejects.toMatchObject({ code: "not_found" });
  });

  it("CSV has a BOM and keeps Czech text", async () => {
    const { ctx } = await seed();
    const csv = toCsv((await buildExportBundle(ctx, { scope: "workspace" })).flat);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Příliš žluťoučký kůň");
  });

  it("CSV export → re-import in update mode creates no duplicates and changes nothing", async () => {
    const { ctx } = await seed();
    const before = await counts(ctx);
    const csv = toCsv((await buildExportBundle(ctx, { scope: "workspace" })).flat);
    const req = reimport(parseCsv(csv, "export.csv"));
    const plan = await previewImport(ctx, req);
    expect(plan.counts).toMatchObject({ projectsCreate: 0, tasksCreate: 0, projectsUpdate: 0, tasksUpdate: 0, errors: 0 });
    const res = await commitImport(ctx, { ...req, idempotencyKey: crypto.randomUUID() });
    expect(res).toMatchObject({ created: { projects: 0, tasks: 0 }, updated: { projects: 0, tasks: 0 } });
    expect(await counts(ctx)).toEqual(before);
  });

  it("XLSX export → edit → re-import updates by ID; the empty project survives", async () => {
    const { ctx, a, empty } = await seed();
    const bytes = await toXlsx(await buildExportBundle(ctx, { scope: "workspace" }));
    const wb = await parseXlsx(bytes, "export.xlsx");
    expect(wb.sheets.map((s) => s.name)).toEqual(["Projects and tasks", "Projects", "Tasks"]);
    const req = reimport(wb);
    const ti = req.header.indexOf("Task");
    const ci = req.header.indexOf("Completed");
    const target = req.rows.find((r) => r[ti] === "'+420 call")!;
    target[ci] = "yes";
    const res = await commitImport(ctx, { ...req, idempotencyKey: crypto.randomUUID() });
    expect(res).toMatchObject({ created: { projects: 0, tasks: 0 }, updated: { projects: 0, tasks: 1 }, failed: 0 });
    const list = await db.select().from(tasks).where(eq(tasks.projectId, a.id));
    expect(list.find((x) => x.title === "+420 call")).toMatchObject({ done: true });
    expect(await counts(ctx)).toMatchObject({ tasks: 2 });
    expect(req.rows.some((r) => r[0] === empty.id)).toBe(true);
  });

  it("template has two example rows and an Instructions sheet", async () => {
    const wb = await parseXlsx(await templateXlsx("me@example.com"));
    expect(wb.sheets.map((s) => s.name)).toEqual(["Import", "Instructions"]);
    expect(wb.sheets[0].rows).toHaveLength(3);
    expect(wb.sheets[0].rows[1]).toContain("Rekonstrukce kanceláře Žižkov");
  });

  it("labels and contact round-trip: export, import into a fresh workspace creates labels, update mode is a no-op", async () => {
    const { ctx, a } = await seed();
    const l1 = await createLabel(ctx, { name: "Interiér", color: "hue" });
    const l2 = await createLabel(ctx, { name: "Urgent" });
    await setProjectLabels(ctx, a.id, [l1.id, l2.id]);
    const cur = await getProject(ctx, a.id);
    await updateProject(ctx, a.id, { contactName: "Jana Nováková", contactEmail: "jana@example.com", contactPhone: "+420 777 123 456", version: cur.project.version });

    const bundle = await buildExportBundle(ctx, { scope: "workspace" });
    expect(bundle.flat.header).toEqual(expect.arrayContaining(["Labels", "Contact name", "Contact email", "Contact phone"]));
    const csv = toCsv(bundle.flat);

    // Same workspace, update mode: nothing changes.
    const req = reimport(parseCsv(csv, "export.csv"));
    const plan = await previewImport(ctx, req);
    expect(plan.counts).toMatchObject({ projectsUpdate: 0, errors: 0 });

    // Fresh workspace, create mode: labels are created, contact copied.
    const other = await makeCtx();
    const fresh = reimport(parseCsv(csv, "export.csv"), "create");
    fresh.rows = fresh.rows.map((r) => r.map((c, i) => (i < 2 ? null : c))); // IDs belong to the other workspace
    const res = await commitImport(other, { ...fresh, idempotencyKey: crypto.randomUUID() });
    expect(res.rowErrors).toEqual([]);
    expect((await listLabels(other)).map((l) => l.name)).toEqual(["Interiér", "Urgent"]);
    const [copy] = await db.select().from(projects).where(and(eq(projects.workspaceId, other.workspaceId), eq(projects.name, "Příliš žluťoučký kůň")));
    expect(copy).toMatchObject({ contactName: "Jana Nováková", contactEmail: "jana@example.com", contactPhone: "+420 777 123 456" });
    expect((await getProject(other, copy.id)).labelIds).toHaveLength(2);

    // Update mode: editing the Labels cell replaces the set (case/accent-insensitive match to existing labels).
    const edit = reimport(parseCsv(csv, "export.csv"));
    const li = edit.header.indexOf("Labels");
    for (const r of edit.rows) if (r[0] === a.id) r[li] = "interier, Nový";
    await commitImport(ctx, { ...edit, idempotencyKey: crypto.randomUUID() });
    const names = new Map((await listLabels(ctx)).map((l) => [l.id, l.name]));
    expect((await getProject(ctx, a.id)).labelIds.map((id) => names.get(id)).sort()).toEqual(["Interiér", "Nový"]);
    expect([...names.values()].sort()).toEqual(["Interiér", "Nový", "Urgent"]);
  });

  it("old files without label/contact columns still import and leave them alone", async () => {
    const { ctx, a } = await seed();
    const cur = await getProject(ctx, a.id);
    await updateProject(ctx, a.id, { contactName: "Keep", version: cur.project.version });
    const res = await commitImport(ctx, { ...reimport({ source: "csv", label: "old", sheets: [{ name: "s", rows: [["Project ID", "Project", "Client"], [a.id, "Příliš žluťoučký kůň", "New client"]] }] }), idempotencyKey: crypto.randomUUID() });
    expect(res.updated.projects).toBe(1);
    expect((await getProject(ctx, a.id)).project).toMatchObject({ contactName: "Keep", client: "New client" });
  });

  it("rejects an invalid contact email or phone per row", async () => {
    const ctx = await makeCtx();
    const plan = await previewImport(ctx, reimport({ source: "csv", label: "x", sheets: [{ name: "s", rows: [["Project", "Contact email", "Phone"], ["A", "nope", ""], ["B", "", "abc"]] }] }, "create"));
    expect(plan.issues.map((i) => i.code).sort()).toEqual(["invalidContactEmail", "invalidPhone"]);
  });
});
