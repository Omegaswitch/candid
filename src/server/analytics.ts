import "server-only";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships, projects, tasks } from "@/db/schema";
import type { Ctx } from "./context";
import { addDays } from "./tasks";

const ANALYTICS_WEEKS = 12;

export type Analytics = {
  projects: { active: number; waiting: number; completed: number };
  avgCompletion: number | null;
  overdue: number;
  onTime: { rate: number | null; onTime: number; total: number };
  weekly: { week: string; count: number }[];
  topClients: { client: string; count: number }[];
  busiest: { id: string; name: string; open: number; overdue: number }[];
  /** Mean length of a stay in each status, in days (null when no project was ever in it). */
  avgDaysInStatus: { status: "active" | "waiting" | "completed"; days: number | null; stays: number }[];
};

const STATUSES = ["active", "waiting", "completed"] as const;

/**
 * Average days per stay in each status, rebuilt from the `status_changed` history: a project's stays
 * run from its creation to the first change, between consecutive changes, and from the last change
 * until now (the current stay counts too). A project with no change is one stay in its current status.
 * One statement for the whole workspace. Trashed projects are left out; archived ones count.
 */
export async function avgDaysInStatus(ctx: Ctx): Promise<Analytics["avgDaysInStatus"]> {
  const ws = ctx.workspaceId;
  const { rows } = await db.execute<{ status: string; days: number | null; stays: number }>(sql`
    with changes as (
      select e.project_id, e.created_at, e.data ->> 'from' as from_status, e.data ->> 'to' as to_status,
             lead(e.created_at) over w as next_at, row_number() over w as n
      from activity_events e join projects p on p.id = e.project_id
      where e.workspace_id = ${ws} and p.workspace_id = ${ws} and p.deleted_at is null
        and e.action = 'status_changed' and e.data ->> 'to' is not null
      window w as (partition by e.project_id order by e.created_at, e.id)
    ), stays as (
      select to_status as status, created_at as since, coalesce(next_at, now()) as until from changes
      union all
      select c.from_status, p.created_at, c.created_at from changes c join projects p on p.id = c.project_id
      where c.n = 1 and c.from_status is not null
      union all
      select p.status::text, p.created_at, now() from projects p
      where p.workspace_id = ${ws} and p.deleted_at is null
        and not exists (select 1 from changes c where c.project_id = p.id)
    )
    select status, round(avg(greatest(extract(epoch from (until - since)), 0) / 86400)::numeric, 1)::float8 as days, count(*)::int as stays
    from stays group by status`);
  const by = new Map(rows.map((r) => [r.status, r]));
  return STATUSES.map((status) => ({ status, days: by.get(status)?.days ?? null, stays: by.get(status)?.stays ?? 0 }));
}

/** Monday of the ISO week containing `isoDay`. */
export function weekStart(isoDay: string) {
  const dow = (new Date(`${isoDay}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(isoDay, -dow);
}

/** Fills the last `n` weeks (oldest first) so empty weeks still show as zero bars. */
export function fillWeeks(rows: { week: string; count: number }[], today: string, n = ANALYTICS_WEEKS) {
  const byWeek = new Map(rows.map((r) => [r.week, Number(r.count)]));
  const last = weekStart(today);
  return Array.from({ length: n }, (_, i) => {
    const week = addDays(last, (i - n + 1) * 7);
    return { week, count: byWeek.get(week) ?? 0 };
  });
}

/** Workspace-wide numbers. Trashed projects and tasks never count; archived ones count only where history matters. */
export async function workspaceAnalytics(ctx: Ctx, today: string): Promise<Analytics> {
  const ws = ctx.workspaceId;
  const liveProject = and(eq(projects.workspaceId, ws), isNull(projects.deletedAt));
  const liveTask = and(eq(tasks.workspaceId, ws), isNull(tasks.deletedAt), isNull(projects.deletedAt));
  const since = addDays(weekStart(today), -(ANALYTICS_WEEKS - 1) * 7);

  const [statusRow, completionRow, taskRow, weeklyRows, clientRows, busyRows, daysInStatus] = await Promise.all([
    db
      .select({
        active: sql<number>`count(*) filter (where ${projects.status} = 'active')::int`,
        waiting: sql<number>`count(*) filter (where ${projects.status} = 'waiting')::int`,
        completed: sql<number>`count(*) filter (where ${projects.status} = 'completed')::int`,
      })
      .from(projects)
      .where(and(liveProject, isNull(projects.archivedAt))),
    db
      .select({
        ratio: sql<number>`(count(*) filter (where ${tasks.done}))::float / count(*)`,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(liveTask, isNull(projects.archivedAt)))
      .groupBy(tasks.projectId),
    db
      .select({
        overdue: sql<number>`count(*) filter (where not ${tasks.done} and ${tasks.dueDate} < ${today} and ${projects.archivedAt} is null)::int`,
        dueDone: sql<number>`count(*) filter (where ${tasks.done} and ${tasks.dueDate} is not null and ${tasks.completedAt} is not null)::int`,
        onTime: sql<number>`count(*) filter (where ${tasks.done} and ${tasks.dueDate} is not null and ${tasks.completedAt}::date <= ${tasks.dueDate})::int`,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(liveTask),
    db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${tasks.completedAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(liveTask, eq(tasks.done, true), sql`${tasks.completedAt} >= ${since}::date`))
      .groupBy(sql`1`),
    db
      .select({ client: sql<string>`trim(${projects.client})`, count: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(liveProject, isNotNull(projects.client), sql`trim(${projects.client}) <> ''`))
      .groupBy(sql`1`)
      .orderBy(desc(sql`2`), sql`1`)
      .limit(5),
    db
      .select({
        id: memberships.id,
        name: sql<string>`coalesce(${memberships.displayName}, ${memberships.email})`,
        open: sql<number>`count(*)::int`,
        overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${today})::int`,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(memberships, eq(memberships.id, tasks.assigneeId))
      .where(and(liveTask, isNull(projects.archivedAt), eq(tasks.done, false), eq(memberships.workspaceId, ws)))
      .groupBy(memberships.id)
      .orderBy(desc(sql`3`), sql`2`)
      .limit(5),
    avgDaysInStatus(ctx),
  ]);

  const ratios = completionRow.map((r) => Number(r.ratio)).filter((n) => Number.isFinite(n));
  const t = taskRow[0] ?? { overdue: 0, dueDone: 0, onTime: 0 };
  return {
    projects: statusRow[0] ?? { active: 0, waiting: 0, completed: 0 },
    avgCompletion: ratios.length ? Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) : null,
    overdue: t.overdue,
    onTime: { rate: t.dueDone ? Math.round((t.onTime / t.dueDone) * 100) : null, onTime: t.onTime, total: t.dueDone },
    weekly: fillWeeks(weeklyRows, today),
    topClients: clientRows,
    busiest: busyRows,
    avgDaysInStatus: daysInStatus,
  };
}
