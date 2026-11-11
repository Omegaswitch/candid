import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { currentLocale, intlLocale } from "@/i18n";

// Deadlines are date-only strings ("2026-11-04"). They are compared as strings and formatted
// without a timezone conversion, so a deadline never shifts by a day.

/** The browser's IANA timezone, stored in this cookie so server renders know the viewer's "today". */
export const TZ_COOKIE = "candid_tz";

const validZone = (tz: string | undefined) => {
  if (!tz || tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
};

/**
 * Server only: the viewer's timezone from the request's cookie (Next's per-request store, the same
 * one `currentLocale` reads), or null when it is not known yet. In the browser the store is a stub.
 */
export function viewerTimeZone(): string | null {
  if (typeof window !== "undefined") return null;
  const store = workUnitAsyncStorage.getStore();
  if (store?.type !== "request" && store?.type !== "private-cache") return null;
  return validZone(store.cookies.get(TZ_COOKIE)?.value);
}

/** Server only: today in the viewer's timezone, or null when it is unknown (no cookie yet). */
export function viewerToday(now = new Date()): string | null {
  const tz = viewerTimeZone();
  return tz ? new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now) : null;
}

/** Browser: keeps the timezone cookie current (a traveller's next page load uses the new zone). */
export function rememberTimeZone() {
  const tz = validZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const current = new RegExp(`(?:^|;\\s*)${TZ_COOKIE}=([^;]*)`).exec(document.cookie)?.[1];
  if (!tz || current === encodeURIComponent(tz)) return;
  document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Today's date in the viewer's own timezone. In a server render that is the zone from the cookie
 * (so server HTML and the browser agree); without one, the server's own clock as before.
 */
export function todayLocal(now = new Date()) {
  const viewer = typeof window === "undefined" ? viewerToday(now) : null;
  if (viewer) return viewer;
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

// Formatters follow the active locale (en-GB or cs-CZ) and are built once per locale.
const dayFmts = new Map<string, Intl.DateTimeFormat>();
function dayFormat(withYear: boolean) {
  const tag = intlLocale();
  const key = `${tag}|${withYear}`;
  let f = dayFmts.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: withYear ? "numeric" : undefined, timeZone: "UTC" });
    dayFmts.set(key, f);
  }
  return f;
}

/** "4 Nov" / "4. 11.", or "4 Nov 2027" / "4. 11. 2027" outside the current year. */
export function formatDay(iso: string | null | undefined, today = todayLocal()) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return dayFormat(iso.slice(0, 4) !== today.slice(0, 4)).format(d);
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
  // English keeps the browser's own conventions, as before; Czech is always cs-CZ.
  const tag = currentLocale() === "cs" ? "cs-CZ" : undefined;
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function formatRelative(iso: string | Date, now = Date.now()) {
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(currentLocale(), { numeric: "auto" }); // "před 5 minutami"
  const a = Math.abs(s);
  if (a < 60) return rtf.format(s, "second");
  if (a < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (a < 86400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86400), "day");
}
