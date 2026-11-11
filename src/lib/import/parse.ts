import Papa from "papaparse";
import type { Cell, ParsedSheet, ParsedWorkbook } from "./types";

// Every source ends up as ParsedWorkbook: sheets of rows of evaluated values. Nothing here ever
// evaluates a formula or runs a macro.

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export class ParseError extends Error {
  constructor(public code: "macro" | "unsupported" | "tooLarge" | "unreadable" | "empty") {
    super(code);
  }
}

const emptyToNull = (v: string): Cell => (v === "" ? null : v);

function trimRows(rows: Cell[][]): Cell[][] {
  const isEmpty = (r: Cell[]) => r.every((c) => c === null || (typeof c === "string" && c.trim() === ""));
  // Leading and inner empty rows stay so row numbers match the sheet.
  const out = rows.slice();
  while (out.length && isEmpty(out[out.length - 1])) out.pop();
  // Trailing empty columns (common in Excel exports).
  let width = 0;
  for (const r of out) for (let i = r.length - 1; i >= width; i--) if (r[i] !== null && r[i] !== "") width = i + 1;
  return out.map((r) => {
    const c = r.slice(0, width);
    while (c.length < width) c.push(null);
    return c;
  });
}

/** Bytes → text. UTF-8 (BOM optional); falls back to Windows-1250, which Czech Excel uses for CSV. */
export function decodeText(bytes: Uint8Array): string {
  try {
    return stripBom(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return stripBom(new TextDecoder("windows-1250").decode(bytes));
  }
}

const stripBom = (s: string) => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/** , ; or tab: the one that splits the first lines into the same number (> 1) of columns. */
function detectDelimiter(text: string): string {
  let best = ",";
  let bestScore = 0;
  for (const d of [",", ";", "\t"]) {
    const rows = Papa.parse<string[]>(text, { delimiter: d, preview: 20, skipEmptyLines: true }).data;
    const width = rows[0]?.length ?? 0;
    if (width < 2) continue;
    const score = rows.filter((r) => r.length === width).length * 1000 + width;
    if (score > bestScore) [best, bestScore] = [d, score];
  }
  return best;
}

function parseDelimited(text: string, delimiter?: string): Cell[][] {
  const clean = stripBom(text);
  const res = Papa.parse<string[]>(clean, { delimiter: delimiter ?? detectDelimiter(clean), skipEmptyLines: false });
  return trimRows(res.data.map((r) => r.map(emptyToNull)));
}

/** CSV text; the delimiter (, ; or tab) is detected. */
export function parseCsv(text: string, label = "CSV"): ParsedWorkbook {
  return { source: "csv", label, sheets: [{ name: label, rows: parseDelimited(text) }] };
}

/** Rows copied from Excel or Google Sheets: tab-separated, multiline cells quoted. */
export function parsePaste(text: string): ParsedWorkbook {
  const t = text.replace(/\r\n?/g, "\n");
  const rows = parseDelimited(t, t.includes("\t") ? "\t" : undefined);
  return { source: "paste", label: "Pasted rows", sheets: [{ name: "Pasted rows", rows }] };
}

type XCell = { value: unknown; formula?: string };

function isoDay(d: Date) {
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function richToText(v: { richText: { text: string }[] }) {
  return v.richText.map((r) => r.text).join("");
}

/** One exceljs cell → Cell. Formula cells give their cached result, or are flagged. */
export function xlsxCell(cell: XCell): Cell {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v === "" ? null : v;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (v instanceof Date) return isoDay(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("formula" in o || "sharedFormula" in o) {
      const formula = String(cell.formula ?? o.formula ?? o.sharedFormula ?? "");
      const r = o.result;
      if (r === undefined || r === null || (typeof r === "object" && !(r instanceof Date))) {
        // No cached result (or an error such as #N/A): we never evaluate it ourselves.
        return { formula, unsupported: true };
      }
      return xlsxCell({ value: r });
    }
    if (Array.isArray(o.richText)) return richToText(o as { richText: { text: string }[] }) || null;
    if ("hyperlink" in o) {
      const text = o.text;
      if (text && typeof text === "object" && Array.isArray((text as Record<string, unknown>).richText)) {
        return richToText(text as { richText: { text: string }[] });
      }
      return typeof text === "string" ? text : String(o.hyperlink ?? "") || null;
    }
    if ("error" in o) return null;
  }
  return null;
}

/** True when the zip holds a VBA project (.xlsm saved as .xlsx). */
function hasMacros(bytes: Uint8Array) {
  const needle = "vbaProject.bin";
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    return true;
  }
  return false;
}

/** XLSX bytes → every worksheet's evaluated values. Works in the browser and on the server. */
export async function parseXlsx(data: ArrayBuffer | Uint8Array, label = "Workbook"): Promise<ParsedWorkbook> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (hasMacros(bytes)) throw new ParseError("macro");
  const mod = await import("exceljs");
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new ParseError("unreadable");
  }
  const sheets: ParsedSheet[] = [];
  wb.eachSheet((ws) => {
    const rows: Cell[][] = [];
    const width = ws.columnCount;
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const out: Cell[] = [];
      for (let c = 1; c <= width; c++) out.push(xlsxCell(row.getCell(c) as unknown as XCell));
      rows.push(out);
    }
    sheets.push({ name: ws.name, rows: trimRows(rows) });
  });
  return { source: "xlsx", label, sheets };
}

/** A user-picked file → workbook. .xlsm and other macro files are refused. */
export async function parseFile(file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<ParsedWorkbook> {
  const name = file.name.toLowerCase();
  if (/\.(xlsm|xltm|xlsb|xls)$/.test(name)) throw new ParseError(name.endsWith(".xls") ? "unsupported" : "macro");
  if (file.size > MAX_FILE_BYTES) throw new ParseError("tooLarge");
  const buf = await file.arrayBuffer();
  if (name.endsWith(".xlsx")) return parseXlsx(buf, file.name);
  if (/\.(csv|tsv|txt)$/.test(name)) {
    const wb = parseCsv(decodeText(new Uint8Array(buf)), file.name);
    if (!wb.sheets[0].rows.length) throw new ParseError("empty");
    return wb;
  }
  throw new ParseError("unsupported");
}

const cellText = (c: Cell) => (c === null || typeof c === "object" ? "" : String(c).trim());

/** First non-empty row is the header. `firstRow` is the sheet row number of `rows[0]`. */
export function splitHeader(rows: Cell[][]): { header: string[]; rows: Cell[][]; firstRow: number } {
  const h = rows.findIndex((r) => r.some((c) => cellText(c) !== ""));
  if (h < 0) return { header: [], rows: [], firstRow: 2 };
  return { header: rows[h].map(cellText), rows: rows.slice(h + 1), firstRow: h + 2 };
}
