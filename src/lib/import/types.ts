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
