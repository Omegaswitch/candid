import { addDaysIso } from "./dates";

// Calendar maths on "YYYY-MM-DD" strings. Everything is UTC so a day never shifts with the viewer's zone.

export type CalendarDay = { iso: string; inMonth: boolean };
export type MonthGrid = { from: string; to: string; weeks: CalendarDay[][] };

const pad = (n: number) => String(n).padStart(2, "0");
/** `month` is 1-12. */
export const monthStart = (year: number, month: number) => `${year}-${pad(month)}-01`;
/** Monday = 0 … Sunday = 6. */
const mondayIndex = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The weeks (Monday first) that cover a month, including the spill-over days of its neighbours. */
export function monthGrid(year: number, month: number): MonthGrid {
  const first = monthStart(year, month);
  const lead = mondayIndex(first);
  const weekCount = Math.ceil((lead + daysInMonth(year, month)) / 7);
  const from = addDaysIso(first, -lead);
  const weeks: CalendarDay[][] = [];
  for (let w = 0; w < weekCount; w++) {
    weeks.push(Array.from({ length: 7 }, (_, d) => {
      const iso = addDaysIso(from, w * 7 + d);
      return { iso, inMonth: iso.slice(0, 7) === first.slice(0, 7) };
    }));
  }
  return { from, to: addDaysIso(from, weekCount * 7 - 1), weeks };
}

/** Previous / next month of a (year, month) pair, rolling the year. */
export function shiftMonth(year: number, month: number, delta: number) {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Groups items by their ISO day, keeping the input order. */
export function groupByDay<T>(items: T[], dayOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = dayOf(it);
    const list = map.get(k);
    if (list) list.push(it);
    else map.set(k, [it]);
  }
  return map;
}
