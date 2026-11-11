import "server-only";
import { and, asc, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import Papa from "papaparse";
import { z } from "zod";
import { db } from "@/db";
import { labels, memberships, projectLabels, projects, tasks } from "@/db/schema";
import { t } from "@/i18n";
import { BOOLEAN_FALSE, BOOLEAN_TRUE } from "@/lib/import/booleans";
import { escapeCell } from "@/lib/import/escape";
import { FIELD_HEADERS } from "@/lib/import/mapping";
import { IMPORT_FIELDS, type ExportBundle, type ExportScope, type ExportTable, type ImportField } from "@/lib/import/types";
import type { Ctx } from "./context";
import { notFound } from "./errors";

export const exportScope = z.object({
  scope: z.enum(["project", "selected", "view", "active", "workspace"]),
  ids: z.array(z.uuid()).max(5000).default([]),
  includeArchived: z.boolean().default(false),
});

const EXTRA = ["Completed at", "Completed by", "Archived", "Created at", "Updated at", "Project archived at"] as const;
const H = (f: ImportField) => FIELD_HEADERS[f];

type Value = string | number | boolean | null;
/** User text is always text: escaped against formula injection, never a number. */
const txt = (s: string | null | undefined): Value => (s === null || s === undefined || s === "" ? null : escapeCell(s));
const instant = (d: Date | null) => (d ? d.toISOString() : null);
const yesNo = (b: boolean) => (b ? "yes" : "no");

/**
 * Projects and tasks for a scope, as tables any target can write (CSV, XLSX, Google Sheets).
 * `scope` is an ExportScope ({ scope, ids?, includeArchived? }); it is validated here.
 * IDs are the records' stable UUIDs so an edited export can be imported back in update mode.
 */
export async function buildExportBundle(ctx: Ctx, scope: ExportScope | unknown): Promise<ExportBundle> {
  const s = exportScope.parse(typeof scope === "string" ? { scope } : scope);
  const where: SQL[] = [eq(projects.workspaceId, ctx.workspaceId)];
  if (s.scope === "project") {
    if (s.ids.length !== 1) throw notFound("Project");
    where.push(eq(projects.id, s.ids[0]));
  } else if (s.scope === "selected" || s.scope === "view") {
    where.push(inArray(projects.id, s.ids.length ? s.ids : ["00000000-0000-0000-0000-000000000000"]));
  } else if (s.scope === "active") {
    where.push(isNull(projects.archivedAt), ne(projects.status, "completed"));
  } else if (!s.includeArchived) {
    where.push(isNull(projects.archivedAt));
  }

  where.push(isNull(projects.deletedAt)); // never export what is in the trash
  const ps = await db
    .select()
    .from(projects)
    .where(and(...where))
    .orderBy(sql`${projects.archivedAt} is not null`, asc(projects.position), asc(projects.createdAt));
  if (s.scope === "project" && !ps.length) throw notFound("Project");

  const ts = ps.length
    ? await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.workspaceId, ctx.workspaceId), isNull(tasks.deletedAt), inArray(tasks.projectId, ps.map((p) => p.id))))
        .orderBy(asc(tasks.position), asc(tasks.createdAt))
    : [];
  // All memberships, removed ones included, so past assignees still show their address.
  const people = await db
    .select({ id: memberships.id, email: memberships.email })
    .from(memberships)
    .where(eq(memberships.workspaceId, ctx.workspaceId));
  const emails = new Map(people.map((m) => [m.id, m.email]));
  const email = (id: string | null) => (id ? txt(emails.get(id)) : null);

  const labelRows = ps.length
    ? await db
        .select({ projectId: projectLabels.projectId, name: labels.name })
        .from(projectLabels)
        .innerJoin(labels, eq(labels.id, projectLabels.labelId))
        .where(and(eq(labels.workspaceId, ctx.workspaceId), inArray(projectLabels.projectId, ps.map((p) => p.id))))
        .orderBy(asc(labels.name))
    : [];
  const labelsOf = new Map<string, string[]>();
  for (const r of labelRows) labelsOf.set(r.projectId, [...(labelsOf.get(r.projectId) ?? []), r.name]);

  const byProject = new Map<string, typeof ts>();
  for (const task of ts) {
    const list = byProject.get(task.projectId) ?? [];
    list.push(task);
    byProject.set(task.projectId, list);
  }

  const flatHeader = [...IMPORT_FIELDS.map(H), ...EXTRA];
  const flat: Value[][] = [];
  const projectRows: Value[][] = [];
  const taskRows: Value[][] = [];

  for (const p of ps) {
    const projectCells: Record<ImportField, Value> = {
      projectId: p.id,
      taskId: null,
      project: txt(p.name),
      client: txt(p.client),
      projectStatus: p.status,
      projectOwnerEmail: email(p.ownerId),
      projectDueDate: p.dueDate,
      priority: p.priority,
      projectNote: txt(p.notes),
      labels: txt((labelsOf.get(p.id) ?? []).join(", ")),
      contactName: txt(p.contactName),
      contactEmail: txt(p.contactEmail),
      contactPhone: txt(p.contactPhone),
      task: null,
      completed: null,
      assigneeEmail: null,
      taskDueDate: null,
      taskNote: null,
    };
    projectRows.push([
      ...PROJECT_FIELDS.map((f) => projectCells[f]),
      yesNo(!!p.archivedAt),
      instant(p.archivedAt),
      instant(p.createdAt),
      instant(p.updatedAt),
    ]);

    const list = byProject.get(p.id) ?? [];
    // A project with no tasks keeps one row, so it survives a round trip.
    const rows = list.length ? list : [null];
    rows.forEach((task, i) => {
      const cells: Record<ImportField, Value> = {
        ...projectCells,
        // Long notes once per project, not on every task row (the import reads the first value).
        projectNote: i === 0 ? projectCells.projectNote : null,
        taskId: task?.id ?? null,
        task: task ? txt(task.title) : null,
        completed: task ? yesNo(task.done) : null,
        assigneeEmail: task ? email(task.assigneeId) : null,
        taskDueDate: task?.dueDate ?? null,
        taskNote: task ? txt(task.note) : null,
      };
      flat.push([
        ...IMPORT_FIELDS.map((f) => cells[f]),
        instant(task?.completedAt ?? null),
        task ? email(task.completedBy) : null,
        yesNo(!!p.archivedAt),
        instant(task?.createdAt ?? p.createdAt),
        instant(task?.updatedAt ?? p.updatedAt),
        instant(p.archivedAt),
      ]);
      if (task) {
        taskRows.push([
          ...TASK_FIELDS.map((f) => cells[f]),
          instant(task.completedAt),
          email(task.completedBy),
          instant(task.createdAt),
          instant(task.updatedAt),
        ]);
      }
    });
  }

  return {
    flat: { name: "Projects and tasks", header: flatHeader, rows: flat },
    projects: { name: "Projects", header: [...PROJECT_FIELDS.map(H), "Archived", "Project archived at", "Created at", "Updated at"], rows: projectRows },
    tasks: { name: "Tasks", header: [...TASK_FIELDS.map(H), "Completed at", "Completed by", "Created at", "Updated at"], rows: taskRows },
  };
}

const PROJECT_FIELDS: ImportField[] = ["projectId", "project", "client", "projectStatus", "projectOwnerEmail", "projectDueDate", "priority", "projectNote", "labels", "contactName", "contactEmail", "contactPhone"];
const TASK_FIELDS: ImportField[] = ["projectId", "taskId", "project", "client", "task", "completed", "assigneeEmail", "taskDueDate", "taskNote"];

// ------------------------------------------------------------------------------------- writers

/** CSV with a UTF-8 BOM (so Excel reads Czech correctly) and CRLF line ends. */
export function toCsv(table: ExportTable): string {
  return `﻿${Papa.unparse({ fields: table.header, data: table.rows.map((r) => r.map((v) => v ?? "")) }, { newline: "\r\n" })}\r\n`;
}

async function workbook() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Candid";
  return wb;
}

function addTable(wb: Awaited<ReturnType<typeof workbook>>, table: ExportTable) {
  const ws = wb.addWorksheet(table.name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = table.header.map((h) => ({ header: h, width: Math.min(48, Math.max(12, h.length + 4)), style: { numFmt: "@" } }));
  ws.getRow(1).font = { bold: true };
  for (const r of table.rows) {
    // Strings only (and the few literal values we produce): exceljs writes a JS string as a
    // string cell, never as a formula; the leading quote from escapeCell stays visible text.
    ws.addRow(r.map((v) => (v === null ? null : typeof v === "string" ? v : String(v))));
  }
  return ws;
}

/** XLSX: the flat sheet first (what the importer reads by default), then Projects and Tasks. */
export async function toXlsx(bundle: ExportBundle): Promise<Uint8Array> {
  const wb = await workbook();
  for (const table of [bundle.flat, bundle.projects, bundle.tasks]) addTable(wb, table);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** Import template: header + two example rows (Czech text, ISO dates) and an Instructions sheet. */
function templateTable(email = "jana.novakova@example.com"): ExportTable {
  const example = (o: Partial<Record<ImportField, string>>) => IMPORT_FIELDS.map((f) => o[f] ?? null);
  const project = {
    project: "Rekonstrukce kanceláře Žižkov",
    client: "Novák a syn s.r.o.",
    projectStatus: "active",
    projectOwnerEmail: email,
    projectDueDate: "2026-12-15",
    priority: "high",
    projectNote: "Příliš žluťoučký kůň úpěl ďábelské ódy.",
    labels: "Interiér, Rekonstrukce",
    contactName: "Petr Novák",
    contactEmail: "petr.novak@example.com",
    contactPhone: "+420 777 123 456",
  };
  return {
    name: "Import",
    header: IMPORT_FIELDS.map(H),
    rows: [
      example({ ...project, task: "Objednat materiál", completed: "no", assigneeEmail: email, taskDueDate: "2026-11-20", taskNote: "Dodavatel: Stavebniny Říčany" }),
      example({ project: project.project, client: project.client, task: "Schůzka s klientem", completed: "yes", taskDueDate: "2026-11-10" }),
    ],
  };
}

export async function templateXlsx(email?: string): Promise<Uint8Array> {
  const wb = await workbook();
  addTable(wb, templateTable(email));
  const tt = t.importExport.template;
  const ws = wb.addWorksheet(tt.sheet);
  ws.columns = [
    { header: tt.column, width: 24 },
    { header: tt.required, width: 12 },
    { header: tt.meaning, width: 90 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const f of IMPORT_FIELDS) {
    const c = tt.fields[f];
    ws.addRow([H(f), c.required ?? "", c.text]);
  }
  ws.addRow([]);
  for (const line of [
    tt.rows,
    tt.dates,
    fmtList(tt.booleans, BOOLEAN_TRUE, BOOLEAN_FALSE),
    tt.people,
    tt.modes,
    tt.formulas,
  ]) {
    const row = ws.addRow([line]);
    ws.mergeCells(row.number, 1, row.number, 3);
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
  }
  ws.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const fmtList = (s: string, yes: string[], no: string[]) => s.replace("{yes}", yes.join(", ")).replace("{no}", no.join(", "));

/** Download headers: attachment with an ASCII fallback name and the UTF-8 name. */
export function downloadHeaders(filename: string, type: string): HeadersInit {
  const ascii = filename.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "");
  return {
    "content-type": type,
    "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  };
}

export const CSV_TYPE = "text/csv; charset=utf-8";
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
