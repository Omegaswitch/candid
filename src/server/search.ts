import "server-only";
import { and, asc, eq, isNotNull, isNull, or, sql, type SQL, type AnyColumn } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { documents, projects, tasks } from "@/db/schema";
import type { Ctx } from "./context";

export const searchQuery = z.string().trim().min(1).max(100);

export type SearchResults = {
  projects: { id: string; name: string; client: string | null; archived: boolean }[];
  tasks: { id: string; title: string; projectId: string; projectName: string; done: boolean }[];
  documents: { id: string; name: string; projectId: string | null }[];
};

const LIMIT = 8;

// Czech letters folded to ASCII on both sides; the unaccent extension is not assumed (Neon).
// Upper case is listed too because lower() only folds ASCII under a C locale.
const FROM = "áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ";
const TO = "acdeeinorstuuyzACDEEINORSTUUYZ";
const fold = (v: AnyColumn | SQL | string) => sql`lower(translate(${v}, ${FROM}, ${TO}))`;

/**
 * Case- and accent-insensitive substring search over project names/clients, task titles and
 * document names in the caller's workspace. Prefix matches sort first.
 */
// shortcut: ILIKE scan, add pg_trgm index if search gets slow (>10k rows)
export async function search(ctx: Ctx, raw: string): Promise<SearchResults> {
  const q = searchQuery.parse(raw);
  const esc = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const contains = (col: AnyColumn) => sql`${fold(col)} ilike '%' || ${fold(esc)} || '%' escape '\\'`;
  const prefixFirst = (col: AnyColumn) => sql`(${fold(col)} ilike ${fold(esc)} || '%' escape '\\') desc`;

  const [p, t, d] = await Promise.all([
    db
      .select({ id: projects.id, name: projects.name, client: projects.client, archivedAt: projects.archivedAt })
      .from(projects)
      .where(and(eq(projects.workspaceId, ctx.workspaceId), isNull(projects.deletedAt), or(contains(projects.name), contains(projects.client))))
      .orderBy(sql`${projects.archivedAt} is not null`, prefixFirst(projects.name), asc(projects.name))
      .limit(LIMIT),
    db
      .select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId, projectName: projects.name, done: tasks.done })
      .from(tasks)
      .innerJoin(projects, and(eq(projects.id, tasks.projectId), eq(projects.workspaceId, ctx.workspaceId), isNull(projects.deletedAt)))
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), isNull(tasks.deletedAt), contains(tasks.title)))
      .orderBy(asc(tasks.done), prefixFirst(tasks.title), asc(tasks.title))
      .limit(LIMIT),
    db
      .select({ id: documents.id, name: documents.name, projectId: documents.projectId })
      .from(documents)
      .where(
        and(
          eq(documents.workspaceId, ctx.workspaceId),
          isNull(documents.deletedAt),
          // Uploads that never finished are not real documents yet.
          or(eq(documents.kind, "link"), isNotNull(documents.uploadedAt)),
          contains(documents.name),
        ),
      )
      .orderBy(prefixFirst(documents.name), asc(documents.name))
      .limit(LIMIT),
  ]);

  return {
    projects: p.map(({ archivedAt, ...r }) => ({ ...r, archived: archivedAt !== null })),
    tasks: t,
    documents: d,
  };
}
