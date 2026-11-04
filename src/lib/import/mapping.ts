import { IMPORT_FIELDS, type ImportField } from "./types";

/** Header text of the template and export, per field. Part of the file format, so not translated. */
export const FIELD_HEADERS: Record<ImportField, string> = {
  projectId: "Project ID",
  taskId: "Task ID",
  project: "Project",
  client: "Client",
  projectStatus: "Project status",
  projectOwnerEmail: "Project owner email",
  projectDueDate: "Project due date",
  priority: "Priority",
  projectNote: "Project note",
  task: "Task",
  completed: "Completed",
  assigneeEmail: "Assignee email",
  taskDueDate: "Task due date",
  taskNote: "Task note",
};

/** Obvious synonyms, already normalised (see `normaliseHeader`). */
const SYNONYMS: Record<ImportField, string[]> = {
  projectId: ["project id", "project uuid"],
  taskId: ["task id", "task uuid"],
  project: ["project", "project name", "projects", "name"],
  client: ["client", "customer", "client name", "company"],
  projectStatus: ["project status", "status"],
  projectOwnerEmail: ["project owner email", "project owner", "owner email", "owner"],
  projectDueDate: ["project due date", "project deadline", "project due", "deadline"],
  priority: ["priority", "project priority"],
  projectNote: ["project note", "project notes", "notes"],
  task: ["task", "task title", "task name", "tasks", "title"],
  completed: ["completed", "done", "complete", "task completed", "task done"],
  assigneeEmail: ["assignee email", "assignee", "assigned to", "task assignee", "task owner"],
  taskDueDate: ["task due date", "task deadline", "due date", "due"],
  taskNote: ["task note", "task notes", "note"],
};

/** "Project  due-date " → "project due date" (case, accents, punctuation and spacing ignored). */
export function normaliseHeader(h: string) {
  return h
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[_\-./:()#*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LOOKUP = new Map<string, ImportField>();
for (const f of IMPORT_FIELDS) for (const s of SYNONYMS[f]) if (!LOOKUP.has(s)) LOOKUP.set(s, f);

/** One field per column at most; each field used once (first matching column wins). */
export function autoMap(header: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>();
  return header.map((h) => {
    const f = LOOKUP.get(normaliseHeader(h ?? ""));
    if (!f || used.has(f)) return null;
    used.add(f);
    return f;
  });
}

/** Mapping is usable when it names the project (by name or ID). */
export function mappingIsUsable(mapping: (ImportField | null)[]) {
  return mapping.includes("project") || mapping.includes("projectId");
}
