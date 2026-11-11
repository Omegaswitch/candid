/**
 * Search query syntax, shared by the server (filtering) and the command menu (chips, highlights).
 *
 * Free text is split into words; every word must appear somewhere in the result. Filters, in
 * Czech or English, accents and case ignored:
 *   klient:/client:Novák      project client contains "Novák"
 *   štítek:/stitek:/label:X   project has a label whose name contains X
 *   typ:/type:projekt|úkol|dokument (project|task|document)   limit the result groups
 *   po termínu / overdue      only overdue (open, past due date) projects and tasks
 * Filter values may be quoted: klient:"Stavby Novák".
 *   "přesná fráze"             a double-quoted phrase is one term: it must appear exactly as typed
 *                              (case and accents ignored)
 */

export type SearchType = "project" | "task" | "document";

export type ParsedQuery = {
  /** Free-text words, in the order typed (original spelling). */
  terms: string[];
  client: string | null;
  label: string | null;
  /** Empty = all groups. */
  types: SearchType[];
  overdue: boolean;
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

const KEYS: Record<string, "client" | "label" | "type"> = {
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

// key:"quoted value" | key:value | "quoted phrase" | word
const TOKEN = /([^\s:"]+):"([^"]*)"?|([^\s:"]+):([^\s"]+)|"([^"]*)"?|(\S+)/g;

export function parseQuery(raw: string): ParsedQuery {
  const out: ParsedQuery = { terms: [], client: null, label: null, types: [], overdue: false };
  // "po termínu" is two words; find it on the folded text and cut it from the original (same indexes).
  let text = raw;
  const f = fold(text);
  const phrase = /(^|\s)po\s+terminu(?=\s|$)/g;
  let m: RegExpExecArray | null;
  const cuts: [number, number][] = [];
  while ((m = phrase.exec(f))) cuts.push([m.index + m[1].length, m.index + m[0].length]);
  for (const [a, b] of cuts.reverse()) text = text.slice(0, a) + " " + text.slice(b);
  if (cuts.length) out.overdue = true;

  for (const t of text.matchAll(TOKEN)) {
    const key = t[1] ?? t[3];
    const value = (t[2] ?? t[4] ?? "").trim();
    const kind = key ? KEYS[fold(key)] : undefined;
    if (kind && value) {
      if (kind === "client") out.client = value;
      else if (kind === "label") out.label = value;
      else {
        const type = TYPES[fold(value)];
        if (type && !out.types.includes(type)) out.types.push(type);
        else if (!type) pushTerms(out, t[0]);
      }
      continue;
    }
    if (t[5] !== undefined) {
      pushTerm(out, t[5].replace(/\s+/g, " ").trim());
      continue;
    }
    const word = t[6] ?? t[0];
    if (t[6] !== undefined && fold(word) === "overdue") {
      out.overdue = true;
      continue;
    }
    pushTerms(out, word);
  }
  return out;
}

function pushTerm(out: ParsedQuery, term: string) {
  if (!term || out.terms.length >= MAX_TERMS) return;
  if (!out.terms.some((x) => fold(x) === fold(term))) out.terms.push(term);
}

function pushTerms(out: ParsedQuery, text: string) {
  for (const w of text.split(/\s+/)) pushTerm(out, w.trim());
}

export const hasCriteria = (q: ParsedQuery) => q.terms.length > 0 || !!q.client || !!q.label || q.overdue || q.types.length > 0;

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
