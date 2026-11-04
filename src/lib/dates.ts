// Deadlines are date-only strings ("2026-11-04"). They are compared as strings and formatted
// without a timezone conversion, so a deadline never shifts by a day.

/** Today's date in the viewer's own timezone. */
export function todayLocal(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDaysIso(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const dayYearFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "4 Nov", or "4 Nov 2027" outside the current year. */
export function formatDay(iso: string | null | undefined, today = todayLocal()) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return (iso.slice(0, 4) === today.slice(0, 4) ? dayFmt : dayYearFmt).format(d);
}

export type DueState = "overdue" | "today" | "soon" | "later" | null;
export function dueState(iso: string | null | undefined, today = todayLocal(), soonDays = 7): DueState {
  if (!iso) return null;
  if (iso < today) return "overdue";
  if (iso === today) return "today";
  return daysBetween(today, iso) <= soonDays ? "soon" : "later";
}

/** Timestamps (instants) shown in the viewer's timezone. */
export function formatInstant(iso: string | Date) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatRelative(iso: string | Date, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(s, "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}
