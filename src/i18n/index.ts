import { help } from "./en/help";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { cs } from "./cs";
import type { Localized } from "./cs/types";
import { common } from "./en/common";
import { documents } from "./en/documents";
import { google } from "./en/google";
import { importExport } from "./en/importExport";
import { legal } from "./en/legal";
import { nav } from "./en/nav";
import { projects } from "./en/projects";
import { search } from "./en/search";
import { settings } from "./en/settings";
import { tasks } from "./en/tasks";
import { views } from "./en/views";

/**
 * Every user-facing string lives under src/i18n/en/<namespace>.ts, and its Czech translation
 * under src/i18n/cs/<namespace>.ts (typed `Localized<…>` of the English one, so a missing or
 * extra key fails typecheck). `t` resolves to the viewer's locale, chosen per person with the
 * `candid_locale` cookie (see `setLocale`). Czech is the default; English is opt-in.
 */
export const en = { common, nav, projects, tasks, documents, importExport, google, settings, views, search, legal, help };
export type Strings = typeof en;

export type Locale = "en" | "cs";
export const LOCALE_COOKIE = "candid_locale";
// Czech is the default; English only when someone picks it in the language switch.
export const parseLocale = (v: string | null | undefined): Locale => (v === "en" ? "en" : "cs");

const dictionaries: { en: Strings; cs: Localized<Strings> } = { en, cs };

// Browser: read once at module load, before React renders, so the first client render (and
// hydration) uses the same locale the server used for this page. Switching reloads the page.
const clientLocale: Locale | null =
  typeof document === "undefined" ? null : parseLocale(/(?:^|;\s*)candid_locale=([^;]*)/.exec(document.cookie)?.[1]);

/**
 * The active locale. On the server it comes from the request's own cookie. Next 16 has no
 * synchronous `cookies()`, and `t` is read synchronously during render, so this reads Next's
 * per-request store (the AsyncLocalStorage behind `cookies()`). Unlike a module variable or React
 * `cache()`, that store is set for the whole request — server components, the SSR pass of client
 * components and route handlers alike — so concurrent requests never see each other's locale and
 * the server HTML matches what the browser renders from `document.cookie`. Outside a request
 * (build, tests, scripts) it is English, so tests and logs stay readable. In the browser the store is a no-op stub.
 */
export function currentLocale(): Locale {
  if (clientLocale) return clientLocale;
  const store = workUnitAsyncStorage.getStore();
  if (store?.type === "request" || store?.type === "private-cache") return parseLocale(store.cookies.get(LOCALE_COOKIE)?.value);
  return "en";
}

/** BCP 47 tag for Intl formatters. */
export const intlLocale = (l: Locale = currentLocale()) => (l === "cs" ? "cs-CZ" : "en-GB");

/** Writes the cookie (1 year) and reloads, so every string, date and Clerk re-renders in the new language. */
export function setLocale(l: Locale) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${l}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  window.location.reload();
}

// `t` is a lazy view over the dictionaries: every property read resolves against the locale
// active *at that moment*. Components keep `import { t }` and even module-level aliases such as
// `const s = t.documents` stay correct per request, because `s` is a proxy too, not a snapshot.
// Only a captured leaf string (`const label = t.nav.myTasks` at module level) is frozen; read
// leaves at render time. Proxies are cached per path, so `t.documents === t.documents`.
type Node = Record<PropertyKey, unknown>;
const proxies = new Map<string, object>();

function resolve(path: readonly string[], l: Locale): unknown {
  let node: unknown = dictionaries[l];
  for (const k of path) node = (node as Node | undefined)?.[k];
  return node;
}

function view(path: readonly string[], target: object): object {
  const key = path.join("\u0000");
  let proxy = proxies.get(key);
  if (!proxy) {
    const here = () => (resolve(path, currentLocale()) ?? target) as Node;
    proxy = new Proxy(target, {
      get(_, prop) {
        const value = Reflect.get(here(), prop);
        if (typeof prop === "symbol" || value === null || typeof value !== "object") return value;
        return view([...path, prop], (Reflect.get(target, prop) as object | undefined) ?? value);
      },
      has: (_, prop) => prop in here(),
    });
    proxies.set(key, proxy);
  }
  return proxy;
}

export const t = view([], en) as Strings;

/** "{count} of {total} completed" → fmt(s, { count: 2, total: 4 }) */
export const fmt = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

const rules: Partial<Record<Locale, Intl.PluralRules>> = {};
/**
 * plural(3, t.projects.tasksN) → "3 tasks" / "3 úkoly". English has one/other; Czech
 * one/few/many/other (1 úkol, 2 úkoly, 1,5 úkolu, 5 úkolů). A missing form falls back to other.
 */
export const plural = (n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }) => {
  const l = currentLocale();
  const rule = (rules[l] ??= new Intl.PluralRules(l)).select(n);
  // Czech writes 1,5 with a decimal comma; English keeps the plain number as before.
  return fmt(forms[rule] ?? forms.other, { n: l === "cs" ? n.toLocaleString("cs-CZ") : n });
};
