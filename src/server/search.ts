import "server-only";
import { and, asc, eq, exists, inArray, isNotNull, isNull, lt, ne, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { documents, labels, memberships, projectLabels, projects, tasks } from "@/db/schema";
import { CS_FROM, CS_TO, allTermsIn, dateRange, hasCriteria, isMe, parseQuery, type DateFilter, type ParsedQuery, type SearchType } from "@/lib/search-query";
import type { Ctx } from "./context";

const searchQuery = z.string().trim().min(1).max(100);
const isoDay = z.iso.date();

function validZone(tz: string | undefined) {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

export type Snippet = { text: string; before: boolean; after: boolean };
export type SearchLabel = { name: string; color: string };

export type SearchResults = {
  /** What the query was understood as; the client highlights `terms` and shows filters as chips. */
  query: ParsedQuery;
  projects: { id: string; name: string; client: string | null; archived: boolean; labels: SearchLabel[]; snippet: Snippet | null }[];
  tasks: { id: string; title: string; projectId: string; projectName: string; done: boolean; dueDate: string | null; snippet: Snippet | null }[];
  documents: { id: string; name: string; projectId: string | null; projectName: string | null; snippet: Snippet | null }[];
  /** Groups that had more matches than returned. */
  more: SearchType[];
};

/** Per group; a `typ:` filter showing a single group gets more room. */
const LIMIT = 8;
const LIMIT_SINGLE = 25;
const SNIPPET_BEFORE = 60;
const SNIPPET_LENGTH = 200;

// Letters folded to ASCII on both sides; the unaccent extension is not assumed (Neon). Upper case
// is listed too because lower() only folds ASCII under a C locale. Same table as the client.
const fold = (v: AnyColumn | SQL | string) => sql`lower(translate(${v}, ${CS_FROM}, ${CS_TO}))`;
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const contains = (col: AnyColumn | SQL, value: string) => sql`${fold(col)} ilike '%' || ${fold(escapeLike(value))} || '%' escape '\\'`;
const startsWith = (col: AnyColumn | SQL, value: string) => sql`${fold(col)} ilike ${fold(escapeLike(value))} || '%' escape '\\'`;

/** `not` that treats unknown (null) as "does not match", so a missing client still passes `-klient:x`. */
const not = (cond: SQL) => sql`not coalesce(${cond}, false)`;

/** Window of `col` around the earliest match of any term (null when none matches). */
function snippetCols(col: AnyColumn, terms: string[]) {
  if (!terms.length) return { pos: sql<number | null>`null::int`, text: sql<string | null>`null::text`, len: sql<number | null>`null::int` };
  // translate() maps 1:1 and lower() keeps the length, so positions in the folded text are positions in `col`.
  const positions = terms.map((t) => sql`nullif(strpos(${fold(col)}, ${fold(t)}), 0)`);
  const pos = sql`least(${sql.join(positions, sql`, `)})`;
  return {
    pos: sql<number | null>`${pos}`.mapWith(Number),
    text: sql<string | null>`substr(${col}, greatest(${pos} - ${SNIPPET_BEFORE}, 1), ${SNIPPET_LENGTH})`,
    len: sql<number | null>`length(${col})`.mapWith(Number),
  };
}

function toSnippet(row: { pos: number | null; text: string | null; len: number | null }): Snippet | null {
  if (!row.pos || !row.text) return null;
  const start = Math.max(row.pos - SNIPPET_BEFORE, 1);
  let text = row.text;
  let before = start > 1;
  const after = start - 1 + SNIPPET_LENGTH < (row.len ?? 0);
  // Do not start or end mid-word when the window was cut.
  if (before) {
    const sp = text.indexOf(" ", 0);
    if (sp > 0 && sp < Math.min(20, row.pos - start)) text = text.slice(sp + 1);
  }
  if (after) {
    const sp = text.lastIndexOf(" ");
    if (sp > text.length - 20) text = text.slice(0, sp);
  }
  text = text.replace(/\s+/g, " ").trim();
  before &&= text.length > 0;
  return text ? { text, before, after } : null;
}

/**
 * Searches the caller's workspace: project names, clients, notes and labels; task titles and notes;
 * document names and extracted PDF text. Case- and accent-insensitive; every word must match
 * somewhere in the result. Items in the trash and unfinished uploads are never returned.
 * `today` (the viewer's local date) decides what is overdue and what "7d" means; `tz` (their IANA
 * zone) decides which local day a timestamp falls on for `upraveno:`/`vytvořeno:`.
 */
// shortcut: LIKE scan, add pg_trgm indexes on the folded expressions if search gets slow (>10k rows).
export async function search(ctx: Ctx, raw: string, opts: { today?: string; tz?: string } = {}): Promise<SearchResults> {
  const query = parseQuery(searchQuery.parse(raw));
  const empty: SearchResults = { query, projects: [], tasks: [], documents: [], more: [] };
  if (!hasCriteria(query)) return empty;
  const today = isoDay.parse(opts.today ?? new Date().toISOString().slice(0, 10));
  const { terms, notTerms, client, label, overdue, assignee, owner } = query;
  const tz = validZone(opts.tz);
  const all: SearchType[] = ["project", "task", "document"];
  const types = (query.types.length ? query.types : all).filter((t) => !query.not.types.includes(t));
  const hasDue = query.dates.some((d) => d.field === "due" && !d.negated);
  // Documents have no due date or assignee, so those filters leave them out.
  const want = (t: SearchType) => types.includes(t) && !((overdue || hasDue || assignee) && t === "document");
  const limit = types.length === 1 ? LIMIT_SINGLE : LIMIT;
  const ws = ctx.workspaceId;

  const labelMatch = (value: string) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(projectLabels)
        .innerJoin(labels, and(eq(labels.id, projectLabels.labelId), eq(labels.workspaceId, ws)))
        .where(and(eq(projectLabels.projectId, projects.id), contains(labels.name, value))),
    );
  /** Members of this workspace matching a name / e-mail prefix, or the caller for "já"/"me"; `col` is the member id column. */
  const memberMatch = (col: AnyColumn, value: string): SQL =>
    isMe(value)
      ? eq(col, ctx.membershipId)
      : exists(
          db
            .select({ one: sql`1` })
            .from(memberships)
            .where(
              and(
                eq(memberships.id, col),
                eq(memberships.workspaceId, ws),
                or(contains(memberships.displayName, value), startsWith(memberships.email, value)),
              ),
            ),
        );
  /** The project has an open task assigned to a matching member. */
  const hasAssignedTask = (value: string) =>
    exists(
      db
        .select({ one: sql`1` })
        .from(tasks)
        .where(
          and(eq(tasks.projectId, projects.id), eq(tasks.workspaceId, ws), eq(tasks.done, false), isNull(tasks.deletedAt), memberMatch(tasks.assigneeId, value)),
        ),
    );
  /** Filters on the project a result belongs to (the project itself, or a task's/document's project). */
  const projectFilters: SQL[] = [];
  if (client) projectFilters.push(contains(projects.client, client));
  if (label) projectFilters.push(labelMatch(label));
  if (owner) projectFilters.push(memberMatch(projects.ownerId, owner));
  for (const v of query.not.client) projectFilters.push(not(contains(projects.client, v)));
  for (const v of query.not.label) projectFilters.push(not(labelMatch(v)));
  for (const v of query.not.owner) projectFilters.push(not(memberMatch(projects.ownerId, v)));

  /** Date filters on an item's own columns. `open` limits `termín:` to unfinished items. */
  const dateFilters = (cols: { updatedAt: AnyColumn; createdAt: AnyColumn; dueDate: AnyColumn }, open: SQL, skipDue = false): SQL[] =>
    query.dates.filter((d) => !(skipDue && d.field === "due")).map((d: DateFilter) => {
      const col = d.field === "due" ? sql`${cols.dueDate}` : sql`((${d.field === "updated" ? cols.updatedAt : cols.createdAt} at time zone ${tz})::date)`;
      const { from, to } = dateRange(d, today);
      const parts: SQL[] = [];
      if (from) parts.push(sql`${col} >= ${from}::date`);
      if (to) parts.push(sql`${col} <= ${to}::date`);
      if (d.field === "due") parts.push(open);
      const cond = and(...parts)!;
      return d.negated ? not(cond) : cond;
    });
  const firstTerm = terms[0];

  const projectQuery = async () => {
    const where: SQL[] = [eq(projects.workspaceId, ws), isNull(projects.deletedAt), ...projectFilters];
    for (const t of terms) where.push(or(contains(projects.name, t), contains(projects.client, t), contains(projects.notes, t), labelMatch(t))!);
    for (const t of notTerms) where.push(not(or(contains(projects.name, t), contains(projects.client, t), contains(projects.notes, t), labelMatch(t))!));
    if (assignee) where.push(hasAssignedTask(assignee));
    for (const v of query.not.assignee) where.push(not(hasAssignedTask(v)));
    where.push(...dateFilters(projects, and(ne(projects.status, "completed"), isNull(projects.archivedAt))!));
    const overdueCond = and(lt(projects.dueDate, today), ne(projects.status, "completed"), isNull(projects.archivedAt))!;
    if (query.not.overdue) where.push(not(overdueCond));
    if (overdue) where.push(overdueCond);
    const snip = snippetCols(projects.notes, terms);
    const rows = await db
      .select({
        id: projects.id,
        name: projects.name,
        client: projects.client,
        archivedAt: projects.archivedAt,
        labels: sql<SearchLabel[]>`coalesce((select json_agg(json_build_object('name', l.name, 'color', l.color) order by l.name)
          from ${projectLabels} pl join ${labels} l on l.id = pl.label_id and l.workspace_id = ${ws}
          where pl.project_id = "projects"."id"), '[]'::json)`, // qualified by hand: drizzle drops the table name in a single-table select, and a bare "id" would bind to labels.id
        snipPos: snip.pos,
        snipText: snip.text,
        snipLen: snip.len,
      })
      .from(projects)
      .where(and(...where))
      .orderBy(
        sql`${projects.archivedAt} is not null`,
        ...(firstTerm ? [sql`${startsWith(projects.name, firstTerm)} desc`, sql`${contains(projects.name, firstTerm)} desc`] : []),
        ...(overdue ? [asc(projects.dueDate)] : []),
        asc(projects.name),
      )
      .limit(limit + 1);
    return rows.map(({ archivedAt, snipPos, snipText, snipLen, ...r }) => ({
      ...r,
      archived: archivedAt !== null,
      // Notes only explain the match when the visible fields do not.
      snippet: allTermsIn(terms, [r.name, r.client, ...r.labels.map((l) => l.name)]) ? null : toSnippet({ pos: snipPos, text: snipText, len: snipLen }),
    }));
  };

  const taskQuery = async () => {
    const where: SQL[] = [eq(tasks.workspaceId, ws), isNull(tasks.deletedAt), ...projectFilters];
    for (const t of terms) where.push(or(contains(tasks.title, t), contains(tasks.note, t))!);
    for (const t of notTerms) where.push(not(or(contains(tasks.title, t), contains(tasks.note, t))!));
    if (assignee) where.push(memberMatch(tasks.assigneeId, assignee));
    for (const v of query.not.assignee) where.push(not(memberMatch(tasks.assigneeId, v)));
    where.push(...dateFilters(tasks, and(eq(tasks.done, false), isNull(projects.archivedAt))!));
    const overdueCond = and(eq(tasks.done, false), lt(tasks.dueDate, today), isNull(projects.archivedAt))!;
    if (query.not.overdue) where.push(not(overdueCond));
    if (overdue) where.push(overdueCond);
    const snip = snippetCols(tasks.note, terms);
    const rows = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        projectId: tasks.projectId,
        projectName: projects.name,
        done: tasks.done,
        dueDate: tasks.dueDate,
        snipPos: snip.pos,
        snipText: snip.text,
        snipLen: snip.len,
      })
      .from(tasks)
      .innerJoin(projects, and(eq(projects.id, tasks.projectId), eq(projects.workspaceId, ws), isNull(projects.deletedAt)))
      .where(and(...where))
      .orderBy(
        asc(tasks.done),
        ...(overdue ? [sql`${tasks.dueDate} asc`] : []),
        ...(firstTerm ? [sql`${startsWith(tasks.title, firstTerm)} desc`, sql`${contains(tasks.title, firstTerm)} desc`] : []),
        asc(tasks.title),
      )
      .limit(limit + 1);
    return rows.map(({ snipPos, snipText, snipLen, ...r }) => ({
      ...r,
      snippet: allTermsIn(terms, [r.title]) ? null : toSnippet({ pos: snipPos, text: snipText, len: snipLen }),
    }));
  };

  const documentQuery = async () => {
    const where: SQL[] = [
      eq(documents.workspaceId, ws),
      isNull(documents.deletedAt),
      // Uploads that never finished are not real documents yet.
      or(eq(documents.kind, "link"), isNotNull(documents.uploadedAt))!,
      ...projectFilters,
    ];
    for (const t of terms) where.push(or(contains(documents.name, t), contains(documents.contentText, t))!);
    for (const t of notTerms) where.push(not(or(contains(documents.name, t), contains(documents.contentText, t))!));
    where.push(...dateFilters({ updatedAt: documents.updatedAt, createdAt: documents.createdAt, dueDate: documents.createdAt }, sql`true`, true));
    // A project filter needs a live project; otherwise a document in a trashed project still shows
    // (as in the document shelf) and a document without a project is fine.
    const projectJoin = and(eq(projects.id, documents.projectId), eq(projects.workspaceId, ws), isNull(projects.deletedAt));
    const snip = snippetCols(documents.contentText, terms);
    const rows = await db
      .select({
        id: documents.id,
        name: documents.name,
        projectId: documents.projectId,
        projectName: projects.name,
        snipPos: snip.pos,
        snipText: snip.text,
        snipLen: snip.len,
      })
      .from(documents)
      .leftJoin(projects, projectJoin)
      .where(and(...where))
      .orderBy(
        ...(firstTerm ? [sql`${startsWith(documents.name, firstTerm)} desc`, sql`${contains(documents.name, firstTerm)} desc`] : []),
        asc(documents.name),
      )
      .limit(limit + 1);
    return rows.map(({ snipPos, snipText, snipLen, ...r }) => ({
      ...r,
      projectId: r.projectName === null ? null : r.projectId,
      snippet: allTermsIn(terms, [r.name]) ? null : toSnippet({ pos: snipPos, text: snipText, len: snipLen }),
    }));
  };

  const [p, t, d] = await Promise.all([
    want("project") ? projectQuery() : [],
    want("task") ? taskQuery() : [],
    want("document") ? documentQuery() : [],
  ]);
  const more: SearchType[] = [];
  if (p.length > limit) more.push("project");
  if (t.length > limit) more.push("task");
  if (d.length > limit) more.push("document");
  return { query, projects: p.slice(0, limit), tasks: t.slice(0, limit), documents: d.slice(0, limit), more };
}

export type RecentProject = { id: string; name: string; client: string | null; archived: boolean };

/** The caller's workspace projects among `ids` (not in the trash), in the order of `ids`; unknown ids are dropped. */
export async function recentProjects(ctx: Ctx, ids: string[]): Promise<RecentProject[]> {
  const valid = z.array(z.uuid()).max(20).parse(ids);
  if (!valid.length) return [];
  const rows = await db
    .select({ id: projects.id, name: projects.name, client: projects.client, archivedAt: projects.archivedAt })
    .from(projects)
    .where(and(eq(projects.workspaceId, ctx.workspaceId), isNull(projects.deletedAt), inArray(projects.id, valid)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return valid.flatMap((id) => {
    const r = byId.get(id);
    return r ? [{ id: r.id, name: r.name, client: r.client, archived: r.archivedAt !== null }] : [];
  });
}
