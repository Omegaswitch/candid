"use client";

import { ArrowDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { fmt, t } from "@/i18n";
import type { Prefs } from "@/server/preferences";
import type { ProjectSummary } from "@/server/projects";
import { cn } from "@/lib/utils";
import { type CardActions, openOnClick, ProjectMenu } from "./project-card";
import { ChecklistTrack, ClientLink, DueLabel, HighPriority, IdleBadge, LabelChips, StatusAge, StatusPill } from "./project-bits";

const NONE = new Set<string>();

/** Compact table view. Below sm the rows fold into two-line list rows; nothing is dropped. */
export function ProjectTable({
  projects,
  ownerName,
  today,
  actions,
  selected = NONE,
  onSelect,
  sort,
  onSort,
}: {
  projects: ProjectSummary[];
  ownerName: (id: string | null) => string | null;
  today: string;
  actions: CardActions;
  /** Without `onSelect` the checkbox column is left out. */
  selected?: Set<string>;
  onSelect?: (ids: string[], on: boolean) => void;
  /** With both, the "In status" header sorts by time in status (longest first); a second click restores manual order. */
  sort?: Prefs["sort"];
  onSort?: (s: Prefs["sort"]) => void;
}) {
  const allOn = projects.length > 0 && projects.every((p) => selected.has(p.id));
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full table-fixed text-sm">
        <thead className="hidden text-left text-xs text-muted-foreground sm:table-header-group">
          <tr className="h-9 border-b">
            {onSelect && (
              <th className="w-10 pl-4">
                <Checkbox
                  checked={allOn ? true : selected.size ? "indeterminate" : false}
                  onCheckedChange={(v) => onSelect(projects.map((p) => p.id), v === true)}
                  aria-label={t.projects.selection.all}
                />
              </th>
            )}
            <th className={cn("w-[29%] xl:w-[25%] font-normal", onSelect ? "pl-4" : "pl-4 sm:w-[33%] xl:w-[28%]")}>{t.projects.table.name}</th>
            <th className="w-[12%] xl:w-[10%] font-normal">{t.projects.table.status}</th>
            <th
              className="w-[9%] font-normal xl:w-[8%]"
              aria-sort={sort === "status" ? "descending" : onSort ? "none" : undefined}
            >
              {onSort ? (
                <button
                  type="button"
                  onClick={() => onSort(sort === "status" ? "manual" : "status")}
                  className={cn("-ml-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50", sort === "status" && "text-foreground")}
                >
                  {t.projects.table.inStatus}
                  <ArrowDown className={cn("size-3", sort !== "status" && "opacity-0")} aria-hidden />
                </button>
              ) : (
                t.projects.table.inStatus
              )}
            </th>
            <th className="w-[16%] xl:w-[13%] font-normal">{t.projects.table.progress}</th>
            <th className="hidden font-normal xl:table-cell">{t.projects.table.next}</th>
            <th className="w-[12%] xl:w-[10%] font-normal">{t.projects.table.owner}</th>
            <th className="w-[12%] xl:w-[10%] pr-2 text-right font-normal">{t.projects.table.due}</th>
            <th className="w-11">
              <span className="sr-only">{t.projects.table.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p, i) => (
            <tr key={p.id} className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 last:border-0 hover:bg-accent/40 has-[a:focus-visible]:bg-accent/40 sm:table-row sm:h-12 sm:p-0">
              {onSelect && (
                <td className="relative z-10 sm:pl-4">
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={(v) => onSelect([p.id], v === true)}
                    aria-label={fmt(t.projects.selection.one, { name: p.name })}
                  />
                </td>
              )}
              <td className="min-w-0 flex-1 basis-[60%]">
                <div className="flex min-w-0 items-center gap-2">
                  <a
                    href={`/projects/${p.id}`}
                    onClick={(e) => openOnClick(e, () => actions.open(p.id))}
                    className="truncate font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                  >
                    {p.name}
                  </a>
                  {p.priority === "high" && <HighPriority />}
                  <IdleBadge p={p} />
                  <LabelChips labels={p.labels} className="hidden flex-nowrap overflow-hidden sm:flex" />
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  <ClientLink name={p.client} />
                </div>
              </td>
              <td className="order-3 sm:order-none">
                <StatusPill status={p.status} />
              </td>
              <td className="order-3 text-xs sm:order-none sm:text-sm">
                <StatusAge p={p} short />
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
