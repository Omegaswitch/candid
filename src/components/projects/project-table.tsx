"use client";

import { fmt, t } from "@/i18n";
import type { ProjectSummary } from "@/server/projects";
import { type CardActions, openOnClick, ProjectMenu } from "./project-card";
import { ChecklistTrack, DueLabel, HighPriority, StatusPill } from "./project-bits";

/** Compact table view. Below sm the rows fold into two-line list rows; nothing is dropped. */
export function ProjectTable({
  projects,
  ownerName,
  today,
  actions,
}: {
  projects: ProjectSummary[];
  ownerName: (id: string | null) => string | null;
  today: string;
  actions: CardActions;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full table-fixed text-sm">
        <thead className="hidden text-left text-xs text-muted-foreground sm:table-header-group">
          <tr className="h-9 border-b">
            <th className="w-[34%] pl-4 font-normal">{t.projects.table.name}</th>
            <th className="w-[13%] font-normal">{t.projects.table.status}</th>
            <th className="w-[19%] font-normal">{t.projects.table.progress}</th>
            <th className="hidden font-normal xl:table-cell">{t.projects.table.next}</th>
            <th className="w-[12%] font-normal">{t.projects.table.owner}</th>
            <th className="w-[13%] pr-2 text-right font-normal">{t.projects.table.due}</th>
            <th className="w-11" aria-label={t.projects.menu.open} />
          </tr>
        </thead>
        <tbody>
          {projects.map((p, i) => (
            <tr key={p.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 last:border-0 hover:bg-accent/40 sm:table-row sm:h-12 sm:p-0">
              <td className="min-w-0 flex-1 basis-[60%] sm:pl-4">
                <div className="flex min-w-0 items-center gap-2">
                  <a
                    href={`/projects/${p.id}`}
                    onClick={(e) => openOnClick(e, () => actions.open(p.id))}
                    className="truncate font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                  >
                    {p.name}
                  </a>
                  {p.priority === "high" && <HighPriority />}
                </div>
                <div className="truncate text-xs text-muted-foreground">{p.client ?? t.common.none}</div>
              </td>
              <td className="order-3 sm:order-none">
                <StatusPill status={p.status} />
              </td>
              <td className="order-4 w-28 sm:order-none sm:w-auto sm:pr-6">
                <ChecklistTrack done={p.doneCount} total={p.taskCount} />
                <div className="num mt-1 text-xs text-muted-foreground">
                  {p.taskCount ? fmt(t.projects.progress, { done: p.doneCount, total: p.taskCount }) : t.projects.noTasks}
                </div>
              </td>
              <td className="hidden truncate pr-4 xl:table-cell">
                {p.nextTask?.title ?? <span className="text-muted-foreground">{t.common.none}</span>}
              </td>
              <td className="order-5 hidden truncate text-muted-foreground sm:order-none sm:table-cell">{ownerName(p.ownerId) ?? t.common.none}</td>
              <td className="order-6 ml-auto text-xs sm:order-none sm:pr-2 sm:text-right sm:text-sm">
                <DueLabel date={p.dueDate} done={p.status === "completed"} today={today} bare />
              </td>
              <td className="order-2 sm:order-none sm:pr-2">
                <ProjectMenu p={p} actions={actions} index={i} count={projects.length} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
