/**
 * Search query syntax, shared by the server (filtering) and the command menu (chips, highlights).
 *
 * Free text is split into words; every word must appear somewhere in the result. Filters, in
 * Czech or English, accents and case ignored:
 *   klient:/client:Novák      project client contains "Novák"
 *   štítek:/stitek:/label:X   project has a label whose name contains X
 *   typ:/type:projekt|úkol|dokument (project|task|document)   limit the result groups
 *   po termínu / overdue      only overdue (open, past due date) projects and tasks
 *   přiřazeno:/prirazeno:/assignee:X   tasks assigned to a member (name or e-mail prefix); projects with
 *                              such open tasks. já / ja / me = the current member
 *   vede:/vlastník:/owner:X    projects owned by a member (and their tasks and documents)
 *   upraveno:/updated:, vytvořeno:/created:   dnes|today, 7d (last 7 days), 2026-11-05
 *   termín:/termin:/due:       dnes|today, 7d (due within 7 days, overdue included), 2026-11-05;
 *                              only open items
 * A leading "-" negates a word, phrase or filter: -smlouva  -štítek:čekáme  -typ:dokument  -"po termínu".
 * Filter values may be quoted: klient:"Stavby Novák".
 *   "přesná fráze"             a double-quoted phrase is one term: it must appear exactly as typed
 *                              (case and accents ignored)
 */

export type SearchType = "project" | "task" | "document";

export type DateField = "updated" | "created" | "due";
export type DateFilter = {
  field: DateField;
  /** "today"; "days" (last / next `n` days); "day" (the exact `day`). */
  kind: "today" | "days" | "day";
  n?: number;
  day?: string;
  negated: boolean;
};

export type ParsedQuery = {
  /** Free-text words, in the order typed (original spelling). */
  terms: string[];
  /** Words that must NOT appear (`-word`). */
  notTerms: string[];
  client: string | null;
  label: string | null;
  /** Empty = all groups. */
  types: SearchType[];
  overdue: boolean;
  /** Member name / e-mail prefix, or "me". */
  assignee: string | null;
  owner: string | null;
  dates: DateFilter[];
  /** Negated filters (`-klient:x`). */
  not: { client: string[]; label: string[]; assignee: string[]; owner: string[]; types: SearchType[]; overdue: boolean };
};

const MAX_TERMS = 6;

export const CS_FROM = "áäčďéěëíňóöřšťúůüýžÁÄČĎÉĚËÍŇÓÖŘŠŤÚŮÜÝŽ";
export const CS_TO = "aacdeeeinoorstuuuyzAACDEEEINOORSTUUUYZ";
const csMap = new Map([...CS_FROM].map((c, i) => [c, CS_TO[i]]));

/**
 * Case- and accent-folds one character to exactly one character, so indexes in the folded string
 * are indexes in the original (needed for highlighting).
 */
function foldChar(c: string) {
  const m = csMap.get(c);
  if (m) return m.toLowerCase();
  const base = c.normalize("NFD")[0] ?? c;
  const lower = base.toLowerCase();
  return lower.length === 1 ? lower : base;
}

/** Length-preserving fold (per UTF-16 unit; surrogate pairs pass through unchanged). */
function fold(s: string) {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code >= 0xd800 && code <= 0xdfff ? s[i] : foldChar(s[i]);
  }
  return out;
}

type Key = "client" | "label" | "type" | "assignee" | "owner" | DateField;
const KEYS: Record<string, Key> = {
  prirazeno: "assignee",
  assignee: "assignee",
  vede: "owner",
  vlastnik: "owner",
  owner: "owner",
  upraveno: "updated",
  updated: "updated",
  vytvoreno: "created",
  created: "created",
  termin: "due",
  due: "due",
  klient: "client",
  client: "client",
  stitek: "label",
  stitky: "label",
  label: "label",
  labels: "label",
  typ: "type",
  type: "type",
};

const TYPES: Record<string, SearchType> = {
  projekt: "project",
  projekty: "project",
  project: "project",
  projects: "project",
  ukol: "task",
  ukoly: "task",
  task: "task",
  tasks: "task",
  dokument: "document",
  dokumenty: "document",
  document: "document",
  documents: "document",
  doc: "document",
  docs: "document",
  soubor: "document",
  file: "document",
};

// [-]key:"quoted value" | [-]key:value | [-]"quoted phrase" | [-]word
const TOKEN = /(-?)(?:([^\s:"]+):"([^"]*)"?|([^\s:"]+):([^\s"]+)|"([^"]*)"?|(\S+))/g;

const ME = new Set(["ja", "me"]);
/** `já` / `me`: the current member. */
export const isMe = (value: string) => ME.has(fold(value.trim()));

const MAX_DAYS = 3650;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDay(v: string) {
  const m = ISO_DAY.exec(v);
  if (!m) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** `dnes`/`today`, `7d` or `YYYY-MM-DD`; null when the value is none of those. */
function parseDateValue(field: DateField, value: string, negated: boolean): DateFilter | null {
  const v = fold(value.trim());
  if (v === "dnes" || v === "today") return { field, kind: "today", negated };
  const days = /^(\d{1,4})d$/.exec(v);
  if (days && Number(days[1]) <= MAX_DAYS) return { field, kind: "days", n: Number(days[1]), negated };
  if (validDay(v)) return { field, kind: "day", day: v, negated };
  return null;
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The inclusive day range a date filter covers, relative to the viewer's `today`.
 * updated/created: "7d" = since 7 days ago (up to now); due: "7d" = up to 7 days ahead, overdue included.
 */
export function dateRange(f: DateFilter, today: string): { from?: string; to?: string } {
  if (f.kind === "today") return { from: today, to: today };
  if (f.kind === "day") return { from: f.day, to: f.day };
  const n = f.n ?? 0;
  return f.field === "due" ? { to: addDays(today, n) } : { from: addDays(today, -n) };
}

export function parseQuery(raw: string): ParsedQuery {
  const out: ParsedQuery = {
    terms: [],
    notTerms: [],
    client: null,
    label: null,
    types: [],
    overdue: false,
    assignee: null,
    owner: null,
    dates: [],
    not: { client: [], label: [], assignee: [], owner: [], types: [], overdue: false },
  };
  // "po termínu" is two words; find it on the folded text and cut it from the original (same indexes).
  let text = raw;
  const f = fold(text);
  const phrase = /(^|\s)(-?)po\s+terminu(?=\s|$)/g;
  let m: RegExpExecArray | null;
  const cuts: [number, number][] = [];
  while ((m = phrase.exec(f))) {
    cuts.push([m.index + m[1].length, m.index + m[0].length]);
    if (m[2]) out.not.overdue = true;
    else out.overdue = true;
  }
  for (const [a, b] of cuts.reverse()) text = text.slice(0, a) + " " + text.slice(b);

  for (const t of text.matchAll(TOKEN)) {
    const neg = t[1] === "-";
    const key = t[2] ?? t[4];
    const value = (t[3] ?? t[5] ?? "").trim();
    const kind = key ? KEYS[fold(key)] : undefined;
    if (kind && value) {
      if (applyFilter(out, kind, value, neg)) continue;
      pushTerms(out, t[0], false); // not a valid filter value: plain text, dash and all
      continue;
    }
    if (t[6] !== undefined) {
      pushTerm(out, t[6].replace(/\s+/g, " ").trim(), neg);
      continue;
    }
    const word = t[7] ?? t[0];
    if (fold(word) === "overdue") {
      if (neg) out.not.overdue = true;
      else out.overdue = true;
      continue;
    }
    pushTerms(out, word, neg);
  }
  return out;
}

/** Applies `kind:value`; false when the value is not valid for the filter. */
function applyFilter(out: ParsedQuery, kind: Key, value: string, neg: boolean) {
  switch (kind) {
    case "client":
    case "label":
    case "assignee":
    case "owner":
      if (neg) out.not[kind].push(value);
      else out[kind] = value;
      return true;
    case "type": {
      const type = TYPES[fold(value)];
      if (!type) return false;
      const list = neg ? out.not.types : out.types;
      if (!list.includes(type)) list.push(type);
      return true;
    }
    default: {
      const d = parseDateValue(kind, value, neg);
      if (!d) return false;
      if (out.dates.length < 6) out.dates.push(d);
      return true;
    }
  }
}

function pushTerm(out: ParsedQuery, term: string, neg: boolean) {
  const list = neg ? out.notTerms : out.terms;
  if (!term || list.length >= MAX_TERMS) return;
  if (!list.some((x) => fold(x) === fold(term))) list.push(term);
}

function pushTerms(out: ParsedQuery, text: string, neg: boolean) {
  for (const w of text.split(/\s+/)) pushTerm(out, w.trim(), neg);
}

export const hasCriteria = (q: ParsedQuery) =>
  q.terms.length > 0 ||
  q.notTerms.length > 0 ||
  !!q.client ||
  !!q.label ||
  !!q.assignee ||
  !!q.owner ||
  q.overdue ||
  q.types.length > 0 ||
  q.dates.length > 0 ||
  q.not.client.length + q.not.label.length + q.not.assignee.length + q.not.owner.length + q.not.types.length > 0 ||
  q.not.overdue;

export type Segment = { text: string; match: boolean };

/** Splits `text` into plain and matching segments for every term (accent/case-insensitive). */
export function highlight(text: string, terms: string[]): Segment[] {
  if (!text) return [];
  const f = fold(text);
  const hit = new Uint8Array(text.length);
  for (const term of terms) {
    const ft = fold(term);
    if (!ft) continue;
    for (let i = f.indexOf(ft); i !== -1; i = f.indexOf(ft, i + ft.length)) hit.fill(1, i, i + ft.length);
  }
  const out: Segment[] = [];
  for (let i = 0; i < text.length; ) {
    let j = i;
    while (j < text.length && hit[j] === hit[i]) j++;
    out.push({ text: text.slice(i, j), match: hit[i] === 1 });
    i = j;
  }
  return out;
}

/** True when every term appears in at least one of the texts. */
export function allTermsIn(terms: string[], texts: (string | null | undefined)[]) {
  const hay = texts.filter(Boolean).map((t) => fold(t!));
  return terms.every((term) => hay.some((h) => h.includes(fold(term))));
}
