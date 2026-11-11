"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Counter from "@/components/Counter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCounts, useMembers, usePrefs, useProjects, useSavePrefs } from "@/hooks/queries";
import { useLabels } from "@/hooks/labels";
import { useReorderProjects, useSetArchived, useSetPinned } from "@/hooks/projects";
import { fmt, plural, t } from "@/i18n";
import { addDaysIso, todayLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Prefs } from "@/server/preferences";
import type { ProjectSummary } from "@/server/projects";
import { DuplicateDialog } from "./duplicate-dialog";
import { type CardActions, ProjectCard } from "./project-card";
import { activeFilterCount, type Filters, NO_FILTERS, ProjectToolbar } from "./project-filters";
import { useSession } from "@/components/app/session";
import { ProjectSheet } from "./project-sheet";
import { ProjectTable } from "./project-table";
import { ProjectBoard } from "./project-board";
import { setViewIds } from "@/lib/view-context";
import dynamic from "next/dynamic";

const ExportDialog = dynamic(() => import("@/components/import-export/export-dialog").then((m) => m.ExportDialog), { ssr: false });

const DEFAULT_FILTERS: Filters = NO_FILTERS;

function matchesDue(p: ProjectSummary, due: Filters["due"], today: string) {
  if (!due) return true;
  if (due === "none") return !p.dueDate;
  if (!p.dueDate) return false;
  if (due === "overdue") return p.dueDate < today && p.status !== "completed";
  if (due === "week") return p.dueDate >= today && p.dueDate <= addDaysIso(today, 7);
  return p.dueDate >= today && p.dueDate.slice(0, 7) === today.slice(0, 7);
}

const byName = (a: ProjectSummary, b: ProjectSummary) => a.name.localeCompare(b.name);
const SORTS: Record<Prefs["sort"], (a: ProjectSummary, b: ProjectSummary) => number> = {
  manual: (a, b) => a.position - b.position,
  due: (a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || byName(a, b),
  name: byName,
  activity: (a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt),
};

/** The project id in `/projects/<id>`, the shareable address of an open panel. */
function useOpenProjectId() {
  const pathname = usePathname();
  const m = pathname.match(/^\/projects\/([^/]+)/);
  return m ? m[1] : null;
}

export function Dashboard() {
  const projects = useProjects();
  const counts = useCounts();
  const members = useMembers();
  const prefs = usePrefs();
  const savePrefs = useSavePrefs();
  const reorder = useReorderProjects();
  const setPinned = useSetPinned();
  const setArchived = useSetArchived();
  const openId = useOpenProjectId();
  const me = useSession().membershipId;
  const [duplicating, setDuplicating] = useState<ProjectSummary | null>(null);
  const today = todayLocal();

  const view = prefs.data?.view ?? "grid";
  const sort = prefs.data?.sort ?? "manual";
  const filters = prefs.data?.filters ?? DEFAULT_FILTERS;
  const filtered = activeFilterCount(filters) > 0;

  const memberName = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, m.name])), [members.data]);
  const ownerName = useCallback((id: string | null) => (id ? (memberName.get(id) ?? null) : null), [memberName]);

  const all = projects.data;
  const labels = useLabels();
  // A deleted label left in saved filters must not hide every project.
  const labelExists = !labels.data || labels.data.some((l) => l.id === filters.labelId);
  const shown = useMemo(() => {
    if (!all) return [];
    const list = all.filter(
      (p) =>
        (!filters.mine || p.ownerId === me || p.openAssigneeIds?.includes(me)) &&
        (!filters.ownerId || p.ownerId === filters.ownerId) &&
        (!filters.status || p.status === filters.status) &&
        (!filters.priority || p.priority === filters.priority) &&
        (!filters.labelId || !labelExists || p.labels.some((l) => l.id === filters.labelId)) &&
        matchesDue(p, filters.due, today),
    );
    return list.sort(SORTS[sort]);
  }, [all, filters, sort, today, labelExists, me]);

  const finding = useMemo(() => {
    if (!all) return null;
    if (!all.length) return t.projects.findingEmpty;
    const late = all.filter((p) => p.overdueCount > 0);
    const lateTasks = late.reduce((s, p) => s + p.overdueCount, 0);
    if (lateTasks)
      return fmt(t.projects.findingOverdue, { tasks: plural(lateTasks, t.projects.tasksN), projects: plural(late.length, t.projects.projectsN) });
    const week = counts.data?.dueThisWeek ?? 0;
    return week ? fmt(t.projects.findingDueSoon, { tasks: plural(week, t.projects.tasksN) }) : t.projects.findingClear;
  }, [all, counts.data?.dueThisWeek]);

  const canReorder = sort === "manual" && !filtered;

  // "Current view" export uses the filtered ids; "Selected" uses the table checkboxes.
  useEffect(() => {
    setViewIds(filtered ? shown.map((p) => p.id) : null);
    return () => setViewIds(null);
  }, [filtered, shown]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportingSelected, setExportingSelected] = useState(false);
  const onSelect = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  // URL is the source of truth for the panel: native history keeps the dashboard mounted.
  const open = useCallback((id: string) => window.history.pushState(null, "", `/projects/${id}`), []);
  const close = useCallback(() => window.history.replaceState(null, "", "/"), []);

  const move = useCallback(
    (id: string, delta: -1 | 1) => {
      if (!all) return;
      const ids = all.map((p) => p.id);
      const from = ids.indexOf(id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= ids.length) return;
      reorder.mutate(arrayMove(ids, from, to));
    },
    [all, reorder],
  );

  const actions: CardActions = useMemo(
    () => ({
      open,
      pin: (p) => setPinned.mutate({ id: p.id, pinned: !p.pinned }),
      duplicate: setDuplicating,
      archive: (p) => {
        if (openId === p.id) close();
        setArchived.mutate({ id: p.id, archived: true, name: p.name });
      },
      move: canReorder ? move : undefined,
    }),
    // Mutation objects change identity every render; their `mutate` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, close, openId, canReorder, move],
  );

  const setFilters = (f: Filters) => savePrefs.mutate({ filters: f });
  const showActive = () => savePrefs.mutate({ filters: { ...DEFAULT_FILTERS, status: "active" } });
  const activeCount = useMemo(() => all?.filter((p) => p.status === "active").length, [all]);

  return (
    <div className="mx-auto flex max-w-[1312px] flex-col gap-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{t.projects.title}</h1>
          <div className="mt-1 min-h-5 text-sm text-muted-foreground">{finding ?? <Skeleton className="h-4 w-64" />}</div>
        </div>
        <div role="group" aria-label={t.projects.counts.label} className="-mx-2.5 grid grid-cols-3 sm:flex sm:gap-1">
          <CountLink value={activeCount} label={t.projects.counts.active} onClick={showActive} title={t.projects.counts.activeHint} />
          <CountLink value={counts.data?.overdue} label={t.projects.counts.overdue} href="/overdue" negative />
          <CountLink value={counts.data?.dueThisWeek} label={t.projects.counts.dueWeek} href="/due-soon" />
        </div>
      </header>

      <ProjectToolbar
        filters={filters}
        sort={sort}
        view={view}
        onFilters={setFilters}
        onSort={(s) => savePrefs.mutate({ sort: s })}
        onView={(v) => savePrefs.mutate({ view: v })}
      />

      {all && filtered && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {fmt(t.projects.filters.showing, { shown: shown.length, total: all.length })}
          {sort === "manual" && ` · ${t.projects.reorderOff}`}
        </p>
      )}

      {projects.isError ? (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm">
          <span>{t.projects.loadError}</span>
          <Button variant="outline" size="sm" onClick={() => projects.refetch()}>
            {t.common.retry}
          </Button>
        </div>
      ) : !all ? (
        view === "table" ? (
          <TableSkeleton />
        ) : (
          <CardGrid>
            {Array.from({ length: 6 }, (_, i) => (
              <CardSkeleton key={i} />
            ))}
          </CardGrid>
        )
      ) : shown.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {filtered ? (
            <>
              {t.projects.emptyFiltered}{" "}
              <button className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => setFilters(DEFAULT_FILTERS)}>
                {t.projects.filters.clear}
              </button>
            </>
          ) : (
            t.projects.empty
          )}
        </div>
      ) : view === "table" ? (
        <>
          {selected.size > 0 && (
            <div role="status" className="flex items-center gap-3 rounded-lg border bg-card px-4 py-2 text-sm">
              <span className="num font-medium">{fmt(t.projects.selection.count, { n: selected.size })}</span>
              <Button size="sm" variant="outline" onClick={() => setExportingSelected(true)}>
                {t.projects.selection.export}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                {t.projects.selection.clear}
              </Button>
            </div>
          )}
          <ProjectTable projects={shown} ownerName={ownerName} today={today} actions={actions} selected={selected} onSelect={onSelect} />
          {exportingSelected && (
            <ExportDialog open onOpenChange={(o) => !o && setExportingSelected(false)} preset={{ scope: "selected", projectIds: [...selected] }} />
          )}
        </>
      ) : view === "board" ? (
        <ProjectBoard projects={shown} today={today} actions={actions} />
      ) : canReorder ? (
        <SortableGrid projects={shown} ownerName={ownerName} today={today} actions={actions} onReorder={(ids) => reorder.mutate(ids)} />
      ) : (
        <CardGrid>
          {shown.map((p, i) => (
            <ProjectCard key={p.id} p={p} ownerName={ownerName(p.ownerId)} today={today} actions={actions} index={i} count={shown.length} />
          ))}
        </CardGrid>
      )}

      <ProjectSheet projectId={openId} onClose={close} />
      <DuplicateDialog project={duplicating} onClose={() => setDuplicating(null)} />
    </div>
  );
}

function CountLink({
  value,
  label,
  href,
  onClick,
  title,
  negative,
}: {
  value: number | undefined;
  label: string;
  href?: string;
  onClick?: () => void;
  title?: string;
  negative?: boolean;
}) {
  const body = (
    <>
      <span className={cn("num text-base font-semibold leading-none", negative && !!value && "text-negative")}>
        {value === undefined ? <span className="inline-block h-4 w-4 rounded-md bg-muted align-middle" /> : <Counter value={value} fontSize="inherit" intro={false} motionBlur={false} fade={0} />}
      </span>
      <span className="text-[13px] text-muted-foreground">{label}</span>
    </>
  );
  const cls =
    "flex min-h-11 flex-col items-start justify-center gap-1 rounded-md px-2.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-9 sm:min-h-0 sm:flex-row sm:items-center sm:gap-1.5";
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} title={title} className={cls}>
      {body}
    </button>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">{children}</div>;
}

/** Same boxes as ProjectCard (ring, title, client, two-column info), so nothing moves when data lands. */
function CardSkeleton() {
  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-5" aria-hidden>
      <div className="flex flex-col items-center gap-3 pt-1">
        <Skeleton className="size-32 rounded-full" />
        <div className="flex w-full flex-col items-center px-6">
          <div className="flex h-6 items-center"><Skeleton className="h-4 w-40" /></div>
          <div className="flex h-[19px] items-center"><Skeleton className="h-3 w-24" /></div>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="grid gap-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The table view's frame: the real column headers at once, rows at the row height (48px from sm). */
function TableSkeleton() {
  const th = t.projects.table;
  return (
    <div className="overflow-hidden rounded-lg border bg-card" aria-hidden>
      <div className="hidden h-9 items-center gap-4 border-b pl-4 pr-2 text-xs text-muted-foreground sm:flex">
        <span className="w-6" />
        <span className="w-[34%] xl:w-[27%]">{th.name}</span>
        <span className="w-[13%] xl:w-[11%]">{th.status}</span>
        <span className="w-[19%] xl:w-[15%]">{th.progress}</span>
        <span className="hidden flex-1 xl:block">{th.next}</span>
        <span className="w-[14%] xl:w-[12%]">{th.owner}</span>
        <span className="ml-auto text-right">{th.due}</span>
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex h-[88px] items-center gap-4 border-b px-4 last:border-0 sm:h-12">
          <Skeleton className="size-4" />
          <div className="flex w-[34%] flex-col gap-1 xl:w-[27%]">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="hidden h-1.5 w-[15%] sm:block" />
          <Skeleton className="ml-auto h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

function SortableCard(props: Omit<React.ComponentProps<typeof ProjectCard>, "drag">) {
  const s = useSortable({ id: props.p.id });
  return (
    <ProjectCard
      {...props}
      drag={{
        ref: s.setNodeRef,
        style: { transform: CSS.Translate.toString(s.transform), transition: s.transition },
        dragging: s.isDragging,
        handle: { ref: s.setActivatorNodeRef, ...s.attributes, ...s.listeners },
      }}
    />
  );
}

function SortableGrid({
  projects,
  ownerName,
  today,
  actions,
  onReorder,
}: {
  projects: ProjectSummary[];
  ownerName: (id: string | null) => string | null;
  today: string;
  actions: CardActions;
  onReorder: (ids: string[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => projects.map((p) => p.id), [projects]);
  const nameOf = (id: string | number) => projects.find((p) => p.id === id)?.name ?? "";
  const pos = (id: string | number | undefined) => ids.indexOf(String(id)) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => fmt(t.projects.dragStart, { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? fmt(t.projects.dragOver, { name: nameOf(active.id), position: pos(over.id), total: ids.length }) : undefined),
    onDragEnd: ({ active, over }) => fmt(t.projects.dragEnd, { name: nameOf(active.id), position: pos(over?.id ?? active.id), total: ids.length }),
    onDragCancel: ({ active }) => fmt(t.projects.dragCancel, { name: nameOf(active.id) }),
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t.projects.reorderHint } }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <CardGrid>
          {projects.map((p, i) => (
            <SortableCard key={p.id} p={p} ownerName={ownerName(p.ownerId)} today={today} actions={actions} index={i} count={projects.length} />
          ))}
        </CardGrid>
      </SortableContext>
    </DndContext>
  );
}
