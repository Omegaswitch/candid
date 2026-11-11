// Contract between import sources (CSV, XLSX, paste, Google Sheets) and the import pipeline,
// and between the export builder and export targets (CSV, XLSX, Google Sheets).

/** One evaluated cell. Formulas are never executed: we read the cached result, or flag the cell. */
export type Cell = string | number | boolean | null | { formula: string; unsupported: true };

export type ParsedSheet = { name: string; rows: Cell[][] };
export type ParsedWorkbook = {
  source: "csv" | "xlsx" | "paste" | "google";
  /** e.g. file name or spreadsheet title, for the run summary */
  label: string;
  sheets: ParsedSheet[];
};

/** Columns of the template / export, in order. Header text is the English label below. */
export const IMPORT_FIELDS = [
  "projectId",
  "taskId",
  "project",
  "client",
  "projectStatus",
  "projectOwnerEmail",
  "projectDueDate",
  "priority",
  "projectNote",
  "labels",
  "contactName",
  "contactEmail",
  "contactPhone",
  "task",
  "completed",
  "assigneeEmail",
  "taskDueDate",
  "taskNote",
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

/** Tabular export, built once and written by any target. Values are already safe text/number. */
export type ExportTable = { name: string; header: string[]; rows: (string | number | boolean | null)[][] };
export type ExportBundle = {
  /** CSV: one row per task (projects with no tasks get one row with empty task columns). */
  flat: ExportTable;
  /** XLSX / Google: separate worksheets. */
  projects: ExportTable;
  tasks: ExportTable;
};

// ---------------------------------------------------------------------------------------------
// Import pipeline: request (built by the wizard or any source) and the plan returned by preview.

export type ImportMode = "create" | "update";
/** How to read slash dates such as 03/04/2026 in one column. */
export type DateOrder = "dmy" | "mdy";

export type ImportOptions = {
  mode: ImportMode;
  /** Chosen interpretation for ambiguous date columns. */
  dateOrders?: Partial<Record<"projectDueDate" | "taskDueDate", DateOrder>>;
  /** Unknown assignee/owner email is a row error (skipped) instead of a warning (left unassigned). */
  strictEmails?: boolean;
  /** Update mode: rows without IDs are created as new records. */
  createMissing?: boolean;
  /** Sheet row numbers (header = 1) the user chose to skip. */
  skipRows?: number[];
  /** Sheet row numbers flagged as possible duplicates that the user wants created anyway. */
  acceptDuplicates?: number[];
};

/** What POST /api/import/preview and /commit take. `mapping[i]` is the field for column i (or null). */
export type ImportRequest = {
  source: ParsedWorkbook["source"];
  label: string;
  header: string[];
  rows: Cell[][];
  /** Sheet row number of rows[0] (default 2: one header row). Issues are reported by sheet row. */
  firstRow?: number;
  mapping: (ImportField | null)[];
  options: ImportOptions;
};
export type ImportCommitRequest = ImportRequest & { idempotencyKey: string };

export type IssueSeverity = "error" | "warning" | "duplicate";
export type IssueCode =
  | "missingProject"
  | "missingId"
  | "unknownProjectId"
  | "unknownTaskId"
  | "taskInOtherProject"
  | "invalidStatus"
  | "invalidPriority"
  | "invalidDate"
  | "ambiguousDate"
  | "invalidBoolean"
  | "unknownEmail"
  | "unknownEmailKept"
  | "formula"
  | "tooLong"
  | "invalidContactEmail"
  | "invalidPhone"
  | "duplicateProject"
  | "duplicateTask"
  | "conflictingValue"
  | "skippedByUser";

export type RowIssue = {
  /** Sheet row number (header row = 1). */
  row: number;
  severity: IssueSeverity;
  code: IssueCode;
  field?: ImportField;
  value?: string;
  message: string;
  /** True when this issue means the row (or its project) will not be imported. */
  skipped: boolean;
};

export type FieldDiff = { field: ImportField; from: string | null; to: string | null };
export type PlanAction = "create" | "update" | "unchanged" | "skip";

export type PlannedTask = {
  row: number;
  action: PlanAction;
  id?: string;
  title: string;
  diffs: FieldDiff[];
};
export type PlannedProject = {
  key: string;
  firstRow: number;
  action: PlanAction;
  id?: string;
  name: string;
  client: string | null;
  diffs: FieldDiff[];
  tasks: PlannedTask[];
};

export type PlanCounts = {
  rows: number;
  projectsCreate: number;
  projectsUpdate: number;
  tasksCreate: number;
  tasksUpdate: number;
  unchanged: number;
  skipped: number;
  errors: number;
  warnings: number;
  duplicates: number;
};
export type ImportPlan = { projects: PlannedProject[]; issues: RowIssue[]; counts: PlanCounts };

export type ImportResult = {
  runId: string;
  /** True when this idempotency key was already used: the earlier run's summary is returned. */
  replayed: boolean;
  created: { projects: number; tasks: number };
  updated: { projects: number; tasks: number };
  /** Rows not imported by choice (duplicates, user skips, rows without IDs in update mode). */
  skipped: number;
  /** Rows not imported because of an error. */
  failed: number;
  rowErrors: { row: number; message: string }[];
};

/** Export scope, shared by CSV/XLSX download and Google Sheets export. */
export type ExportScope = {
  scope: "project" | "selected" | "view" | "active" | "workspace";
  /** project: one id; selected/view: the ids the client sends. */
  ids?: string[];
  /** workspace scope: also archived projects. */
  includeArchived?: boolean;
};
