import { eq } from "drizzle-orm";
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
import { createProject, setArchived } from "./projects";

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
    const row = all.flat.rows.find((r) => r[9] === "'+420 call")!;
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
});
