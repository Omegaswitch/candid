import { fmt, t } from "@/i18n";
import { parseBoolean } from "./booleans";
import { parseDate } from "./dates";
import { unescapeCell } from "./escape";
import { FIELD_HEADERS, normaliseHeader } from "./mapping";
import type {
  Cell,
  FieldDiff,
  ImportField,
  ImportPlan,
  ImportRequest,
  IssueCode,
  IssueSeverity,
  PlanAction,
  PlannedProject,
  PlannedTask,
  RowIssue,
} from "./types";

// Pure: rows + mapping + options + a snapshot of the workspace → what an import would do.
// The server builds the snapshot (filtered by workspace) and applies `apply` in one transaction.

export const MAX_IMPORT_ROWS = 5000;
const LIMITS = { name: 200, client: 200, title: 500, taskNote: 20_000, projectNote: 100_000 };

export type ProjectStatus = "active" | "waiting" | "completed";
export type Priority = "normal" | "high";

export type SnapshotProject = {
  id: string;
  name: string;
  client: string | null;
  status: ProjectStatus;
  priority: Priority;
  ownerId: string | null;
  dueDate: string | null;
  /** Only needed for projects the file references by ID. */
  notes: string;
  version: number;
  archived: boolean;
};
export type SnapshotTask = {
  id: string;
  projectId: string;
  title: string;
  done: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  note: string;
  version: number;
};
export type WorkspaceSnapshot = {
  /** Every project of the workspace (name/client for duplicate checks; full fields for referenced ones). */
  projects: SnapshotProject[];
  /** Tasks of referenced projects and tasks referenced by ID. */
  tasks: SnapshotTask[];
  members: { id: string; email: string }[];
};

export type ProjectValues = {
  name: string;
  client: string | null;
  status: ProjectStatus;
  priority: Priority;
  ownerId: string | null;
  dueDate: string | null;
  notes: string;
};
export type TaskValues = { title: string; done: boolean; assigneeId: string | null; dueDate: string | null; note: string };

export type ApplyTask =
  | { action: "create"; row: number; values: Partial<TaskValues> & { title: string } }
  | { action: "update"; row: number; id: string; version: number; values: Partial<TaskValues> };
export type ApplyProject = {
  action: "create" | "update" | "unchanged";
  firstRow: number;
  id?: string;
  version?: number;
  values: Partial<ProjectValues>;
  tasks: ApplyTask[];
};
export type BuiltPlan = { plan: ImportPlan; apply: ApplyProject[] };

/** The IDs a request refers to, so the server can load just those records. */
export function referencedIds(req: Pick<ImportRequest, "rows" | "mapping">) {
  const pi = req.mapping.indexOf("projectId");
  const ti = req.mapping.indexOf("taskId");
  const pick = (i: number) =>
    i < 0 ? [] : [...new Set(req.rows.map((r) => r[i]).filter((c): c is string => typeof c === "string" && UUID.test(c.trim())).map((c) => c.trim().toLowerCase()))];
  return { projectIds: pick(pi), taskIds: pick(ti) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS: Record<string, ProjectStatus> = {
  active: "active",
  open: "active",
  "in progress": "active",
  waiting: "waiting",
  "on hold": "waiting",
  completed: "completed",
  complete: "completed",
  done: "completed",
  closed: "completed",
};
const PRIORITY: Record<string, Priority> = { normal: "normal", high: "high" };

const key = (s: string | null | undefined) => normaliseHeader(s ?? "");

type RowData = {
  row: number;
  projectId?: string;
  name?: string | null;
  client?: string | null;
  status?: ProjectStatus | null;
  ownerId?: string | null;
  dueDate?: string | null;
  priority?: Priority | null;
  notes?: string | null;
  taskId?: string;
  title?: string | null;
  done?: boolean;
  assigneeId?: string | null;
  taskDue?: string | null;
  taskNote?: string | null;
  failed: boolean;
};

type Group = { key: string; existing?: SnapshotProject; rows: RowData[] };

export function buildPlan(req: ImportRequest, snap: WorkspaceSnapshot): BuiltPlan {
  const { mode } = req.options;
  const update = mode === "update";
  const createMissing = update ? !!req.options.createMissing : true;
  const skipRows = new Set(req.options.skipRows ?? []);
  const accept = new Set(req.options.acceptDuplicates ?? []);
  const firstRow = req.firstRow ?? 2;

  const col = {} as Partial<Record<ImportField, number>>;
  req.mapping.forEach((f, i) => {
    if (f && col[f] === undefined) col[f] = i;
  });

  const projectsById = new Map(snap.projects.map((p) => [p.id, p]));
  const tasksById = new Map(snap.tasks.map((x) => [x.id, x]));
  const memberByEmail = new Map(snap.members.map((m) => [m.email.toLowerCase(), m.id]));
  const emailById = new Map(snap.members.map((m) => [m.id, m.email]));

  const issues: RowIssue[] = [];
  const failedRows = new Set<number>();
  const skippedRows = new Set<number>();

  const issue = (row: number, severity: IssueSeverity, code: IssueCode, skipped: boolean, field?: ImportField, value?: string) => {
    const message = fmt(t.importExport.issues[code], { value: value ?? "", field: field ? FIELD_HEADERS[field] : "" });
    issues.push({ row, severity, code, field, value, message, skipped });
    if (severity === "error") failedRows.add(row);
    else if (skipped) skippedRows.add(row);
  };

  // 1. Read every row into typed values, collecting row-level errors.
  const rows: RowData[] = [];
  let rowCount = 0;
  req.rows.forEach((cells, i) => {
    const row = firstRow + i;
    const raw = (f: ImportField): Cell | undefined => (col[f] === undefined ? undefined : (cells[col[f]!] ?? null));
    if (Object.values(col).every((c) => isBlank(cells[c!] ?? null))) return;
    rowCount++;
    if (skipRows.has(row)) {
      issue(row, "warning", "skippedByUser", true);
      return;
    }
    const d: RowData = { row, failed: false };
    const fail = (code: IssueCode, field?: ImportField, value?: string) => {
      issue(row, "error", code, true, field, value);
      d.failed = true;
    };

    const text = (f: ImportField, max?: number): string | null | undefined => {
      const c = raw(f);
      if (c === undefined) return undefined;
      if (c !== null && typeof c === "object") {
        fail("formula", f, `=${c.formula}`);
        return undefined;
      }
      const s = c === null ? "" : unescapeCell(String(c)).trim();
      if (max && s.length > max) {
        fail("tooLong", f, s.slice(0, 40));
        return undefined;
      }
      return s === "" ? null : s;
    };
    const date = (f: "projectDueDate" | "taskDueDate") => {
      const s = text(f);
      if (s === undefined) return undefined;
      const r = parseDate(s, req.options.dateOrders?.[f]);
      if (r.ok) return r.value;
      fail(r.ambiguous ? "ambiguousDate" : "invalidDate", f, s ?? "");
      return undefined;
    };
    const person = (f: "projectOwnerEmail" | "assigneeEmail") => {
      const s = text(f);
      if (s === undefined) return undefined;
      if (s === null) return null;
      const id = EMAIL.test(s) ? memberByEmail.get(s.toLowerCase()) : undefined;
      if (id) return id;
      if (req.options.strictEmails) fail("unknownEmail", f, s);
      else if (update) {
        // Never overwrite an existing assignment because of an unknown address.
        issue(row, "warning", "unknownEmailKept", false, f, s);
        return undefined;
      } else issue(row, "warning", "unknownEmail", false, f, s);
      return null;
    };
    const choice = <T,>(f: ImportField, table: Record<string, T>, code: IssueCode) => {
      const s = text(f);
      if (s === undefined || s === null) return s;
      const v = table[key(s)];
      if (v === undefined) fail(code, f, s);
      return v;
    };

    const pid = text("projectId");
    if (pid) {
      const p = UUID.test(pid) ? projectsById.get(pid.toLowerCase()) : undefined;
      if (!p) fail("unknownProjectId", "projectId", pid);
      else d.projectId = p.id;
    }
    const tid = text("taskId");
    if (tid) {
      const tk = UUID.test(tid) ? tasksById.get(tid.toLowerCase()) : undefined;
      if (!tk) fail("unknownTaskId", "taskId", tid);
      else if (d.projectId && tk.projectId !== d.projectId) fail("taskInOtherProject", "taskId", tid);
      else d.taskId = tk.id;
    }
    d.name = text("project", LIMITS.name);
    d.client = text("client", LIMITS.client);
    d.status = choice("projectStatus", STATUS, "invalidStatus");
    d.ownerId = person("projectOwnerEmail");
    d.dueDate = date("projectDueDate");
    d.priority = choice("priority", PRIORITY, "invalidPriority");
    d.notes = text("projectNote", LIMITS.projectNote);
    d.title = text("task", LIMITS.title);
    const c = raw("completed");
    if (c !== undefined) {
      const b = parseBoolean(c);
      if (b === undefined) fail(c !== null && typeof c === "object" ? "formula" : "invalidBoolean", "completed", typeof c === "object" && c ? `=${c.formula}` : String(c));
      else d.done = b;
    }
    d.assigneeId = person("assigneeEmail");
    d.taskDue = date("taskDueDate");
    d.taskNote = text("taskNote", LIMITS.taskNote);

    if (!d.failed && !d.projectId && !d.name && !(d.taskId && tasksById.get(d.taskId))) fail("missingProject", "project");
    if (!d.failed) rows.push(d);
  });

  // 2. Group rows into projects: by Project ID, else by the task's project, else by name + client.
  const groups = new Map<string, Group>();
  for (const d of rows) {
    const pid = d.projectId ?? (d.taskId ? tasksById.get(d.taskId)!.projectId : undefined);
    const k = pid ? `id:${pid}` : `name:${key(d.name)}|${key(d.client)}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { key: k, existing: pid ? projectsById.get(pid) : undefined, rows: [] }));
    g.rows.push(d);
  }

  const existingByName = new Map<string, SnapshotProject>();
  for (const p of snap.projects) {
    const k = `${key(p.name)}|${key(p.client)}`;
    if (!existingByName.has(k)) existingByName.set(k, p);
  }

  const planned: PlannedProject[] = [];
  const apply: ApplyProject[] = [];
  const counts = { projectsCreate: 0, projectsUpdate: 0, tasksCreate: 0, tasksUpdate: 0, unchanged: 0 };
  const show = (f: ImportField, v: unknown): string | null => {
    if (v === null || v === undefined || v === "") return null;
    if (f === "projectOwnerEmail" || f === "assigneeEmail") return emailById.get(String(v)) ?? null;
    if (f === "completed") return v ? "yes" : "no";
    return String(v);
  };

  for (const g of groups.values()) {
    const first = g.rows[0].row;
    const skipGroup = (code: IssueCode, severity: IssueSeverity, value?: string) => {
      issue(first, severity, code, true, "project", value);
      for (const d of g.rows.slice(1)) skippedRows.add(d.row);
    };

    // Project values: the first non-empty value of each column across the group's rows.
    const pick = <K extends keyof RowData>(k: K, field: ImportField): RowData[K] | undefined => {
      let v: RowData[K] | undefined;
      for (const d of g.rows) {
        const x = d[k];
        if (x === undefined) continue;
        if (v === undefined || v === null) v = x;
        else if (x !== null && x !== v) issue(d.row, "warning", "conflictingValue", false, field, String(show(field, x) ?? x));
      }
      return v;
    };
    const target = {
      name: pick("name", "project"),
      client: pick("client", "client"),
      status: pick("status", "projectStatus"),
      ownerId: pick("ownerId", "projectOwnerEmail"),
      dueDate: pick("dueDate", "projectDueDate"),
      priority: pick("priority", "priority"),
      notes: pick("notes", "projectNote"),
    };
    const name = target.name ?? g.existing?.name ?? null;
    const client = target.client === undefined ? (g.existing?.client ?? null) : target.client;
    const pp: PlannedProject = { key: g.key, firstRow: first, action: "skip", id: g.existing?.id, name: name ?? "", client, diffs: [], tasks: [] };
    planned.push(pp);

    const existing = update ? g.existing : undefined;
    if (!existing) {
      if (update && !createMissing) {
        for (const d of g.rows) issue(d.row, "warning", "missingId", true);
        markTasksSkipped(pp, g);
        continue;
      }
      if (!name) {
        for (const d of g.rows) issue(d.row, "error", "missingProject", true, "project");
        markTasksSkipped(pp, g);
        continue;
      }
      const dup = existingByName.get(`${key(name)}|${key(client)}`);
      if (dup && !accept.has(first)) {
        skipGroup("duplicateProject", "duplicate", client ? `${name} (${client})` : name);
        markTasksSkipped(pp, g);
        continue;
      }
      if (dup) issue(first, "duplicate", "duplicateProject", false, "project", client ? `${name} (${client})` : name);
    }

    const ap: ApplyProject = { action: "unchanged", firstRow: first, values: {}, tasks: [] };
    if (!existing) {
      const values: Partial<ProjectValues> = { name: name! };
      for (const [k, v] of Object.entries(target) as [keyof ProjectValues, unknown][]) {
        if (k === "name" || v === undefined || v === null) continue;
        (values as Record<string, unknown>)[k] = v;
      }
      ap.action = "create";
      ap.values = values;
      pp.action = "create";
      pp.diffs = diffList(projectFieldOf, values, {}, show);
      counts.projectsCreate++;
    } else {
      const values: Partial<ProjectValues> = {};
      const cur: ProjectValues = existing;
      for (const [k, v] of Object.entries(target) as [keyof ProjectValues, unknown][]) {
        if (v === undefined) continue;
        // Name, status and priority cannot be cleared; an empty cell leaves them as they are.
        if (v === null && (k === "name" || k === "status" || k === "priority")) continue;
        const next = k === "notes" ? (v ?? "") : v;
        if ((cur[k] ?? null) !== (next ?? null)) (values as Record<string, unknown>)[k] = next;
      }
      ap.id = existing.id;
      ap.version = existing.version;
      ap.values = values;
      const changed = Object.keys(values).length > 0;
      ap.action = changed ? "update" : "unchanged";
      pp.action = ap.action;
      pp.id = existing.id;
      pp.diffs = diffList(projectFieldOf, values, cur, show);
      if (changed) counts.projectsUpdate++;
      else counts.unchanged++;
    }

    // Tasks.
    const seen = new Set<string>(
      existing ? snap.tasks.filter((x) => x.projectId === existing.id).map((x) => key(x.title)) : [],
    );
    for (const d of g.rows) {
      const tk = update && d.taskId ? tasksById.get(d.taskId) : undefined;
      if (!d.title && !tk) continue; // project-only row
      const pt: PlannedTask = { row: d.row, action: "skip", id: tk?.id, title: d.title ?? tk?.title ?? "", diffs: [] };
      pp.tasks.push(pt);
      if (tk) {
        const values: Partial<TaskValues> = {};
        const cur: TaskValues = tk;
        const next: Partial<TaskValues> = {
          title: d.title ?? undefined,
          done: d.done,
          assigneeId: d.assigneeId,
          dueDate: d.taskDue,
          note: d.taskNote === undefined ? undefined : (d.taskNote ?? ""),
        };
        for (const [k, v] of Object.entries(next) as [keyof TaskValues, unknown][]) {
          if (v === undefined) continue;
          if ((cur[k] ?? null) !== (v ?? null)) (values as Record<string, unknown>)[k] = v;
        }
        if (Object.keys(values).length) {
          ap.tasks.push({ action: "update", row: d.row, id: tk.id, version: tk.version, values });
          pt.action = "update";
          pt.diffs = diffList(taskFieldOf, values, cur, show);
          counts.tasksUpdate++;
        } else {
          pt.action = "unchanged";
          counts.unchanged++;
        }
        seen.add(key(tk.title));
        continue;
      }
      if (!d.title) continue;
      if (update && !createMissing) {
        issue(d.row, "warning", "missingId", true);
        continue;
      }
      const k = key(d.title);
      if (seen.has(k)) {
        if (!accept.has(d.row)) {
          issue(d.row, "duplicate", "duplicateTask", true, "task", d.title);
          continue;
        }
        issue(d.row, "duplicate", "duplicateTask", false, "task", d.title);
      }
      seen.add(k);
      const values: Partial<TaskValues> & { title: string } = { title: d.title };
      if (d.done !== undefined) values.done = d.done;
      if (d.assigneeId) values.assigneeId = d.assigneeId;
      if (d.taskDue) values.dueDate = d.taskDue;
      if (d.taskNote) values.note = d.taskNote;
      ap.tasks.push({ action: "create", row: d.row, values });
      pt.action = "create";
      pt.diffs = diffList(taskFieldOf, values, {}, show).filter((x) => x.field !== "task");
      counts.tasksCreate++;
    }
    apply.push(ap);
  }

  for (const i of issues) if (i.severity !== "error" && i.skipped) skippedRows.add(i.row);
  for (const r of failedRows) skippedRows.delete(r);
  const warnings = issues.filter((i) => i.severity === "warning" && !i.skipped).length;
  const duplicates = issues.filter((i) => i.severity === "duplicate").length;
  issues.sort((a, b) => a.row - b.row);

  return {
    plan: {
      projects: planned,
      issues,
      counts: { rows: rowCount, ...counts, skipped: skippedRows.size, errors: failedRows.size, warnings, duplicates },
    },
    apply,
  };
}

function markTasksSkipped(pp: PlannedProject, g: Group) {
  for (const d of g.rows) if (d.title) pp.tasks.push({ row: d.row, action: "skip" as PlanAction, title: d.title, diffs: [] });
}

const projectFieldOf: Record<keyof ProjectValues, ImportField> = {
  name: "project",
  client: "client",
  status: "projectStatus",
  priority: "priority",
  ownerId: "projectOwnerEmail",
  dueDate: "projectDueDate",
  notes: "projectNote",
};
const taskFieldOf: Record<keyof TaskValues, ImportField> = {
  title: "task",
  done: "completed",
  assigneeId: "assigneeEmail",
  dueDate: "taskDueDate",
  note: "taskNote",
};

function diffList<V extends object>(
  fields: Record<keyof V, ImportField>,
  values: Partial<V>,
  cur: Partial<V>,
  show: (f: ImportField, v: unknown) => string | null,
): FieldDiff[] {
  return (Object.keys(values) as (keyof V)[]).map((k) => {
    const field = fields[k];
    const trim = (s: string | null) => (s && s.length > 120 ? `${s.slice(0, 117)}…` : s);
    return { field, from: trim(show(field, cur[k])), to: trim(show(field, values[k])) };
  });
}

function isBlank(c: Cell) {
  return c === null || (typeof c === "string" && c.trim() === "");
}
