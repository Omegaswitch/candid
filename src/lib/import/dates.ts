import type { Cell, DateOrder } from "./types";

// Dates arrive as text (CSV, paste) or as ISO strings (XLSX dates are converted by the parser).
// ISO is always accepted. "3.4.2026" is Czech D.M.Y. Slash/dash dates such as 03/04/2026 are
// ambiguous unless a value in the column proves the order (a part greater than 12).

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/;
const DOTTED = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/;
const SLASHED = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

const pad = (n: number) => String(n).padStart(2, "0");

function toIso(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > days) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export type DateParse = { ok: true; value: string | null } | { ok: false; ambiguous: boolean };

/** Empty → `{ ok: true, value: null }`. Ambiguous without an `order` → `{ ok: false, ambiguous: true }`. */
export function parseDate(cell: Cell, order?: DateOrder): DateParse {
  if (cell === null || cell === "") return { ok: true, value: null };
  if (typeof cell !== "string") return { ok: false, ambiguous: false };
  const s = cell.trim();
  if (!s) return { ok: true, value: null };
  let m = ISO.exec(s);
  if (m) return wrap(toIso(+m[1], +m[2], +m[3]));
  m = DOTTED.exec(s);
  if (m) return wrap(toIso(+m[3], +m[2], +m[1]));
  m = SLASHED.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    const y = +m[3];
    if (a > 12) return wrap(toIso(y, b, a));
    if (b > 12) return wrap(toIso(y, a, b));
    if (a === b) return wrap(toIso(y, a, b));
    if (!order) return { ok: false, ambiguous: true };
    return wrap(order === "dmy" ? toIso(y, b, a) : toIso(y, a, b));
  }
  return { ok: false, ambiguous: false };
}

const wrap = (v: string | null): DateParse => (v ? { ok: true, value: v } : { ok: false, ambiguous: false });

export type DateColumnInfo = {
  /** At least one value can be read either way and nothing in the column decides it. */
  ambiguous: boolean;
  /** The order the column proves (a part > 12), if any. */
  detected?: DateOrder;
  /** Values prove both orders: the column mixes formats. */
  mixed: boolean;
  /** Example value for the question in the UI. */
  example?: string;
};

export function detectDateColumn(values: Cell[]): DateColumnInfo {
  let dmy = false;
  let mdy = false;
  let example: string | undefined;
  let unclear = false;
  for (const v of values) {
    if (typeof v !== "string") continue;
    const m = SLASHED.exec(v.trim());
    if (!m) continue;
    const a = +m[1];
    const b = +m[2];
    if (a > 12) dmy = true;
    else if (b > 12) mdy = true;
    else if (a !== b) {
      unclear = true;
      example ??= v.trim();
    }
  }
  const detected = dmy && !mdy ? "dmy" : mdy && !dmy ? "mdy" : undefined;
  return { ambiguous: unclear && !detected, detected, mixed: dmy && mdy, example };
}
