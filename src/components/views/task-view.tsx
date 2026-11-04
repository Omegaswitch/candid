"use client";

import { Hourglass } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DueLabel, Initials } from "@/components/projects/project-bits";
import { ProjectSheet } from "@/components/projects/project-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useCounts, useMembers } from "@/hooks/queries";
import { type TaskViewItem, type TaskViewName, useTaskView, useToggleTask } from "@/hooks/projects";
import { fmt, plural, t } from "@/i18n";
import { ApiError } from "@/lib/api";
import { addDaysIso, todayLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

const v = t.views;
type Group = keyof typeof v.groups;

function groupOf(due: string | null, today: string): Group {
  if (!due) return "none";
  if (due < today) return "overdue";
  if (due === today) return "today";
  if (due === addDaysIso(today, 1)) return "tomorrow";
  return due <= addDaysIso(today, 7) ? "week" : "later";
}
const ORDER: Group[] = ["overdue", "today", "tomorrow", "week", "later", "none"];
const COUNT_KEY = { mine: "mine", "due-soon": "dueThisWeek", overdue: "overdue", waiting: "waiting" } as const;

/** One cross-project list: My tasks, Due soon, Overdue, Waiting. Rows grouped by due date. */
export function TaskView({ view }: { view: TaskViewName }) {
  const q = useTaskView(view);
  const members = useMembers();
  const toggle = useToggleTask();
  const [projectId, setProjectId] = useState<string | null>(null);
  const today = todayLocal();
  const s = v[view];

  const counts = useCounts();
  const items = useMemo(() => q.data?.pages.flat(), [q.data]);
  const names = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.name])), [members.data]);
  const groups = useMemo(() => {
    const map = new Map<Group, TaskViewItem[]>();
    for (const it of items ?? []) {
      const g = groupOf(it.task.dueDate, today);
      map.set(g, [...(map.get(g) ?? []), it]);
    }
    return ORDER.filter((g) => map.has(g)).map((g) => ({ g, items: map.get(g)! }));
  }, [items, today]);

  const subline = useMemo(() => {
    if (!items?.length) return null;
    const open = items.filter((i) => !i.task.done);
    const tasks = plural(open.length, v.tasksN);
    const overdue = open.filter((i) => i.task.dueDate && i.task.dueDate < today).length;
    const projects = plural(new Set(open.map((i) => i.project.id)).size, v.projectsN);
    if (view === "overdue") return fmt(s.subline, { tasks, projects });
    return fmt(overdue ? s.subline : s.sublineNone, { tasks, overdue: plural(overdue, v.tasksN) });
  }, [items, today, view, s]);

  const setDone = (it: TaskViewItem, done: boolean, version = it.task.version) => {
    const title = it.task.title;
    toggle
      .mutateAsync({ id: it.task.id, done, version, title })
      .then((task) => {
        toast.success(fmt(done ? v.completed : v.reopened, { title }), {
          action: done ? { label: t.common.undo, onClick: () => setDone(it, false, task.version) } : undefined,
        });
      })
      .catch((e) => {
        if (e instanceof ApiError && e.isConflict) toast.error(fmt(v.changedElsewhere, { title }));
        else toast.error(fmt(v.couldNotComplete, { title }), { action: { label: t.common.retry, onClick: () => setDone(it, done, version) } });
      });
  };

  return (
    <div className="flex max-w-[1100px] flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <div className="mt-1 min-h-5 text-sm text-muted-foreground">
          {q.isPending ? <Skeleton className="h-4 w-56" /> : (subline ?? s.empty)}
        </div>
      </header>

      {q.isError ? (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm">
          <span>{v.loadError}</span>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            {t.common.retry}
          </Button>
        </div>
      ) : q.isPending ? (
        <div aria-busy aria-label={t.common.loading}>
          <div className="mb-2 flex h-4 items-center"><Skeleton className="h-3 w-16" /></div>
          <div className="rounded-lg border bg-card">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex h-14 items-center gap-3 border-b px-4 last:border-0">
                <Skeleton className="size-[18px]" />
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex h-5 items-center"><Skeleton className="h-3.5 w-1/2" /></div>
                  <div className="flex h-4 items-center"><Skeleton className="h-3 w-1/4" /></div>
                </div>
                <div className="hidden w-40 items-center gap-2 sm:flex">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
                <Skeleton className="h-3.5 w-16 sm:w-20" />
              </div>
            ))}
          </div>
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{s.empty}</div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(({ g, items }) => (
            <section key={g} aria-labelledby={`group-${g}`}>
              {groups.length > 1 && (
                <h2 id={`group-${g}`} className="mb-2 flex gap-2 text-xs text-muted-foreground">
                  {v.groups[g]} <span className="num">{items.length}</span>
                </h2>
              )}
              <ul className="rounded-lg border bg-card" aria-label={groups.length > 1 ? undefined : s.title}>
                {items.map((it) => (
                  <TaskRow
                    key={it.task.id}
                    it={it}
                    today={today}
                    assignee={it.task.assigneeId ? (names.get(it.task.assigneeId) ?? null) : null}
                    showWaiting={view === "waiting"}
                    quietDue={view === "overdue"}
                    onToggle={(done) => setDone(it, done)}
                    onOpenProject={() => setProjectId(it.project.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {q.hasNextPage && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Button variant="outline" size="sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {v.loadMore}
          </Button>
          <span className="num">
            {fmt(v.shown, { shown: items?.length ?? 0, total: counts.data?.[COUNT_KEY[view]] ?? "…" })}
          </span>
        </div>
      )}

      <ProjectSheet projectId={projectId} onClose={() => setProjectId(null)} />
    </div>
  );
}

export function TaskRow({
  it,
  today,
  assignee,
  showWaiting,
  quietDue = false,
  onToggle,
  onOpenProject,
}: {
  it: TaskViewItem;
  today: string;
  assignee: string | null;
  showWaiting: boolean;
  quietDue?: boolean;
  onToggle: (done: boolean) => void;
  onOpenProject: () => void;
}) {
  const { task, project } = it;
  const id = `task-${task.id}`;
  return (
    <li className="flex min-h-14 items-center gap-3 border-b px-4 py-2.5 last:border-0">
      <Checkbox
        id={id}
        checked={task.done}
        onCheckedChange={(c) => onToggle(c === true)}
        aria-label={fmt(v.complete, { title: task.title })}
        className="size-[18px]"
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className={cn("block truncate", task.done && "text-muted-foreground line-through")}>
          {task.title}
        </label>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={onOpenProject}
            aria-label={fmt(v.openProject, { name: project.name })}
            className="truncate rounded-sm hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {project.name}
          </button>
          {showWaiting && task.waiting && (
            <span className="inline-flex min-w-0 items-center gap-1 text-warning">
              <Hourglass className="size-3 flex-none" aria-hidden />
              <span className="truncate">{task.waitingReason ? fmt(v.waitingFor, { reason: task.waitingReason }) : v.waitingNoReason}</span>
            </span>
          )}
          <span className="truncate sm:hidden">· {assignee ?? v.unassigned}</span>
        </div>
      </div>
      <div className="hidden w-40 items-center gap-2 text-muted-foreground sm:flex">
        <Initials name={assignee} />
        <span className="truncate text-sm">{assignee ?? v.unassigned}</span>
      </div>
      <div className="flex-none text-right text-xs sm:w-32 sm:text-sm">
        {/* On the Overdue page every row is late: the dates stay plain so red is not a texture. */}
        <DueLabel date={task.dueDate} done={task.done || quietDue} today={today} bare />
      </div>
    </li>
  );
}
