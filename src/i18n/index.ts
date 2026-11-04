import { common } from "./en/common";
import { documents } from "./en/documents";
import { google } from "./en/google";
import { importExport } from "./en/importExport";
import { nav } from "./en/nav";
import { projects } from "./en/projects";
import { settings } from "./en/settings";
import { tasks } from "./en/tasks";
import { views } from "./en/views";

/**
 * Every user-facing string lives under src/i18n/en/<namespace>.ts. A Czech locale is a
 * `cs` object of the same shape (`Strings`), selected here.
 */
export const en = { common, nav, projects, tasks, documents, importExport, google, settings, views };
export type Strings = typeof en;
export const t: Strings = en;
export const locale = "en";

/** "{count} of {total} completed" → fmt(s, { count: 2, total: 4 }) */
export const fmt = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));

const rules = new Intl.PluralRules(locale);
/** plural(3, { one: "{n} task", other: "{n} tasks" }) — add few/many forms for Czech. */
export const plural = (n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string }) =>
  fmt(forms[rules.select(n)] ?? forms.other, { n });
