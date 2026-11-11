import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";

// Kept apart from dates.ts (which pulls in every dictionary through i18n) so the root providers can
// set the cookie without adding the strings to pages that do not need them.

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
