import "server-only";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import { CS_FROM, CS_TO } from "@/lib/search-query";
import type { Ctx } from "./context";
import { notFound } from "./errors";
import { listProjectSummaries, type ProjectSummary } from "./projects";

export type ClientContact = { name: string | null; email: string | null; phone: string | null; projects: { id: string; name: string }[] };

export type ClientDetail = {
  /** The client as most often written on its projects. */
  name: string;
  /** Not archived, not completed. */
  active: ProjectSummary[];
  archived: ProjectSummary[];
  counts: { open: number; completed: number; archived: number };
  contacts: ClientContact[];
  lastActivityAt: string | null;
  onTime: { rate: number | null; onTime: number; total: number };
  /** Open steps past their due date on this client's projects that are not archived. */
  overdueSteps: number;
};

// Same folding as search: case and Czech accents, so "novak" finds "Novák". unaccent is not assumed (Neon).
const fold = (v: unknown) => sql`lower(translate(trim(${v}), ${CS_FROM}, ${CS_TO}))`;

/** Collapses the same person written twice ("Jana", "jana@x.cz") into one line; projects accumulate. */
function mergeContacts(rows: { id: string; name: string; contactName: string | null; contactEmail: string | null; contactPhone: string | null }[]) {
  const out = new Map<string, ClientContact>();
  for (const r of rows) {
    if (!r.contactName && !r.contactEmail && !r.contactPhone) continue;
    const key = (r.contactEmail ?? r.contactPhone?.replace(/\D/g, "") ?? r.contactName ?? "").toLowerCase();
    const c = out.get(key) ?? { name: null, email: null, phone: null, projects: [] };
    c.name ??= r.contactName;
    c.email ??= r.contactEmail;
    c.phone ??= r.contactPhone;
    c.projects.push({ id: r.id, name: r.name });
    out.set(key, c);
  }
  return [...out.values()];
}

/**
 * Everything the client page shows, matched by name within the workspace (case and accent
 * insensitive; trashed projects never appear). Three queries: the matching projects with their
 * contacts, the card summaries for them, and the on-time figure.
 */
export async function getClient(ctx: Ctx, rawName: string, today: string): Promise<ClientDetail> {
  const name = rawName.trim();
  if (!name) throw notFound("Client");
  const rows = await db
    .select({ id: projects.id, name: projects.name, client: projects.client, contactName: projects.contactName, contactEmail: projects.contactEmail, contactPhone: projects.contactPhone })
    .from(projects)
    .where(and(eq(projects.workspaceId, ctx.workspaceId), isNull(projects.deletedAt), isNotNull(projects.client), sql`${fold(projects.client)} = ${fold(name)}`))
    .orderBy(projects.createdAt);
  if (!rows.length) throw notFound("Client");
  const ids = rows.map((r) => r.id);

  const [all, [t]] = await Promise.all([
    listProjectSummaries(ctx, { archived: "any", ids, today }),
    db
      .select({
        dueDone: sql<number>`count(*) filter (where ${tasks.dueDate} is not null and ${tasks.completedAt} is not null)::int`,
        onTime: sql<number>`count(*) filter (where ${tasks.dueDate} is not null and ${tasks.completedAt}::date <= ${tasks.dueDate})::int`,
      })
      .from(tasks)
      .where(and(eq(tasks.workspaceId, ctx.workspaceId), inArray(tasks.projectId, ids), eq(tasks.done, true), isNull(tasks.deletedAt))),
  ]);

  const spellings = new Map<string, number>();
  for (const r of rows) spellings.set(r.client!.trim(), (spellings.get(r.client!.trim()) ?? 0) + 1);
  const display = [...spellings].sort((a, b) => b[1] - a[1])[0][0];

  const active = all.filter((p) => !p.archivedAt);
  const archived = all.filter((p) => p.archivedAt);
  const last = all.reduce<string | null>((m, p) => (!m || p.lastActivityAt > m ? p.lastActivityAt : m), null);
  return {
    name: display,
    active,
    archived,
    counts: {
      open: active.filter((p) => p.status !== "completed").length,
      completed: all.filter((p) => p.status === "completed").length,
      archived: archived.length,
    },
    contacts: mergeContacts(rows),
    lastActivityAt: last,
    onTime: { rate: t.dueDone ? Math.round((t.onTime / t.dueDone) * 100) : null, onTime: t.onTime, total: t.dueDone },
    overdueSteps: active.reduce((s, p) => s + p.overdueCount, 0),
  };
}
