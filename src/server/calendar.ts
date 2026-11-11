import "server-only";
import { and, asc, eq, gte, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
import type { Ctx } from "./context";
import { isoDate } from "./projects";

export const MAX_RANGE_DAYS = 62;

export const calendarQuery = z
  .object({ from: isoDate, to: isoDate })
  .refine((v) => v.from <= v.to, "from must not be after to")
  .refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 86_400_000 < MAX_RANGE_DAYS, "Range is too long");

export type CalendarStep = { id: string; title: string; dueDate: string; assigneeId: string | null; version: number; projectId: string; projectName: string };
export type CalendarDeadline = { projectId: string; name: string; dueDate: string; ownerId: string | null; status: "active" | "waiting" | "completed" };
export type CalendarFollowUp = { projectId: string; name: string; followUpOn: string; followUpNote: string | null; ownerId: string | null };
export type CalendarRange = { steps: CalendarStep[]; deadlines: CalendarDeadline[]; followUps: CalendarFollowUp[] };

/**
 * Everything the calendar draws for one date range, workspace-scoped: open steps by due date,
 * project due dates and follow-ups. Archived and trashed projects never appear. The three reads
 * are independent and run in parallel; each is capped so a huge range cannot return unbounded rows.
 */
export async function calendarRange(ctx: Ctx, raw: unknown): Promise<CalendarRange> {
  const { from, to } = calendarQuery.parse(raw);
  const live = and(eq(projects.workspaceId, ctx.workspaceId), isNull(projects.archivedAt), isNull(projects.deletedAt));
  const [steps, deadlines, followUps] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        assigneeId: tasks.assigneeId,
        version: tasks.version,
        projectId: tasks.projectId,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(live, eq(tasks.workspaceId, ctx.workspaceId), eq(tasks.done, false), isNull(tasks.deletedAt), gte(tasks.dueDate, from), lte(tasks.dueDate, to)))
      .orderBy(asc(tasks.dueDate), asc(projects.position), asc(tasks.position))
      .limit(1000),
    db
      .select({ projectId: projects.id, name: projects.name, dueDate: projects.dueDate, ownerId: projects.ownerId, status: projects.status })
      .from(projects)
      .where(and(live, ne(projects.status, "completed"), gte(projects.dueDate, from), lte(projects.dueDate, to)))
      .orderBy(asc(projects.dueDate), asc(projects.name))
      .limit(500),
    db
      .select({ projectId: projects.id, name: projects.name, followUpOn: projects.followUpOn, followUpNote: projects.followUpNote, ownerId: projects.ownerId })
      .from(projects)
      .where(and(live, isNotNull(projects.followUpOn), gte(projects.followUpOn, from), lte(projects.followUpOn, to)))
      .orderBy(asc(projects.followUpOn), asc(projects.name))
      .limit(500),
  ]);
  return { steps: steps as CalendarStep[], deadlines: deadlines as CalendarDeadline[], followUps: followUps as CalendarFollowUp[] };
}
