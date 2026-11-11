/**
 * Per-browser search memory for the command menu: the last opened projects and the last queries.
 * localStorage may be missing or throw (private window, blocked site data), so every access is
 * guarded and the menu works without it.
 */

const RECENT_KEY = "candid:search:recent-projects";
const QUERIES_KEY = "candid:search:queries";
export const MAX_RECENT_PROJECTS = 6;
export const MAX_QUERIES = 5;
const MAX_QUERY_LENGTH = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Puts `item` first, drops an earlier copy (`same` decides what a copy is) and caps the length. */
export function pushFront<T>(list: T[], item: T, cap: number, same: (a: T, b: T) => boolean = (a, b) => a === b) {
  return [item, ...list.filter((x) => !same(x, item))].slice(0, cap);
}

const sameQuery = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

function readList(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    if (list.length) localStorage.setItem(key, JSON.stringify(list));
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable or full: the history simply is not kept */
  }
}

export const readRecentProjects = () => readList(RECENT_KEY).filter((id) => UUID.test(id)).slice(0, MAX_RECENT_PROJECTS);
export const readRecentQueries = () =>
  readList(QUERIES_KEY)
    .map((q) => q.slice(0, MAX_QUERY_LENGTH))
    .slice(0, MAX_QUERIES);

export function rememberProject(id: string) {
  if (!UUID.test(id)) return;
  writeList(RECENT_KEY, pushFront(readRecentProjects(), id, MAX_RECENT_PROJECTS));
}

export function rememberQuery(query: string) {
  const q = query.trim().replace(/\s+/g, " ").slice(0, MAX_QUERY_LENGTH);
  if (q.length < 2) return;
  writeList(QUERIES_KEY, pushFront(readRecentQueries(), q, MAX_QUERIES, sameQuery));
}

export function clearSearchHistory() {
  writeList(RECENT_KEY, []);
  writeList(QUERIES_KEY, []);
}
