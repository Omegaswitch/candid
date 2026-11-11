"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Circle, Flag, PhoneCall, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useSession } from "@/components/app/session";
import { ProjectSheet } from "@/components/projects/project-sheet";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendar, useMoveStep } from "@/hooks/calendar";
import { fmt, intlLocale, t } from "@/i18n";
import { groupByDay, monthGrid, monthStart, shiftMonth } from "@/lib/calendar";
import { formatDay, todayLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CalendarDeadline, CalendarFollowUp, CalendarStep } from "@/server/calendar";

const c = t.calendar;

type Item =
  | { kind: "deadline"; key: string; day: string; projectId: string; deadline: CalendarDeadline }
  | { kind: "followUp"; key: string; day: string; projectId: string; followUp: CalendarFollowUp }
  | { kind: "step"; key: string; day: string; projectId: string; step: CalendarStep };

const MAX_VISIBLE = 3;
const fmtDate = (opts: Intl.DateTimeFormatOptions, iso: string) => new Intl.DateTimeFormat(intlLocale(), { ...opts, timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
const upperFirst = (s: string) => s.charAt(0).toLocaleUpperCase(intlLocale()) + s.slice(1);
const monthLabel = (iso: string) => upperFirst(fmtDate({ month: "long", year: "numeric" }, iso));
const longDay = (iso: string) => fmtDate({ weekday: "long", day: "numeric", month: "long" }, iso);
/** Monday-first weekday names from a known Monday, in the active language. */
const weekdays = () => Array.from({ length: 7 }, (_, i) => ({ short: fmtDate({ weekday: "short" }, `2024-01-0${i + 1}`), long: fmtDate({ weekday: "long" }, `2024-01-0${i + 1}`) }));

function describe(item: Item, today: string) {
  if (item.kind === "deadline") return fmt(c.deadline, { name: item.deadline.name });
  if (item.kind === "followUp") {
    const { name, followUpNote: note } = item.followUp;
    return note ? fmt(c.followUpNote, { name, note }) : fmt(c.followUp, { name });
  }
  const { title, projectName: project, dueDate } = item.step;
  return fmt(dueDate < today ? c.stepOverdue : c.step, { title, project });
}

/** Visible label of a chip: the step title, or the project name for the two project-level kinds. */
const labelOf = (item: Item) => (item.kind === "step" ? item.step.title : item.kind === "deadline" ? item.deadline.name : item.followUp.name);

/** One entry. Steps are solid, project due dates outlined with a flag, follow-ups dashed with a phone. */
function ChipBody({ item, today }: { item: Item; today: string }) {
  const late = item.kind === "step" && item.day < today;
  const Icon = item.kind === "deadline" ? Flag : item.kind === "followUp" ? PhoneCall : late ? CircleAlert : Circle;
  return (
    <>
      <Icon aria-hidden className="size-3 flex-none" />
      <span className="truncate">{labelOf(item)}</span>
      {late && <span className="sr-only">{c.overdue}</span>}
    </>
  );
}
const chipClass = (item: Item, today: string) =>
  cn(
    "flex h-6 w-full min-w-0 items-center gap-1 rounded-sm px-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
    item.kind === "step" && "bg-secondary text-foreground hover:bg-accent",
    item.kind === "step" && item.day < today && "text-negative",
    item.kind === "deadline" && "border border-foreground/50 bg-card font-medium text-foreground hover:bg-accent",
    item.kind === "followUp" && "border border-dashed border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
  );

function StaticChip({ item, today, onOpen, large }: { item: Item; today: string; onOpen: (projectId: string) => void; large?: boolean }) {
  return (
    <button
      type="button"
      title={describe(item, today)}
      aria-label={`${describe(item, today)}. ${fmt(c.openProject, { name: item.kind === "step" ? item.step.projectName : item.kind === "deadline" ? item.deadline.name : item.followUp.name })}`}
      onClick={() => onOpen(item.projectId)}
      className={cn(chipClass(item, today), large && "h-auto min-h-11 py-2 text-sm [&_svg]:size-4")}
    >
      <ChipBody item={item} today={today} />
    </button>
  );
}

function DraggableChip({ item, today, onOpen }: { item: Extract<Item, { kind: "step" }>; today: string; onOpen: (projectId: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.step.id, data: { step: item.step } });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      title={describe(item, today)}
      aria-label={`${describe(item, today)}. ${fmt(c.openProject, { name: item.step.projectName })}`}
      onClick={() => onOpen(item.projectId)}
      className={cn(chipClass(item, today), "cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <ChipBody item={item} today={today} />
    </button>
  );
}

function DayCell({
  iso,
  inMonth,
  today,
  items,
  onOpen,
}: {
  iso: string;
  inMonth: boolean;
  today: string;
  items: Item[];
  onOpen: (projectId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  const isToday = iso === today;
  const extra = items.length - MAX_VISIBLE;
  return (
    <div
      ref={setNodeRef}
      role="gridcell"
      aria-label={longDay(iso)}
      aria-current={isToday ? "date" : undefined}
      className={cn(
        "flex min-h-28 min-w-0 flex-col gap-1 border-b border-r p-1.5 transition-colors",
        !inMonth && "bg-muted/40",
        isOver && "bg-accent ring-2 ring-inset ring-foreground/40",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "num inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs",
            isToday ? "bg-foreground font-semibold text-background" : inMonth ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {Number(iso.slice(8))}
          {isToday && <span className="sr-only"> ({c.today})</span>}
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        {items.slice(0, MAX_VISIBLE).map((it) =>
          it.kind === "step" ? <DraggableChip key={it.key} item={it} today={today} onOpen={onOpen} /> : <StaticChip key={it.key} item={it} today={today} onOpen={onOpen} />,
        )}
        {extra > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={fmt(c.moreLabel, { n: extra, date: longDay(iso) })}
                className="num h-5 w-full rounded-sm px-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {fmt(c.more, { n: extra })}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 gap-1.5">
              <div className="px-0.5 text-xs font-medium text-muted-foreground">{longDay(iso)}</div>
              <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {items.map((it) => (
                  <StaticChip key={it.key} item={it} today={today} onOpen={onOpen} />
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}

/** Arrow keys move a picked-up step a whole day cell at a time (the default is 25 px). */
const cellKeyboard: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const rect = context.droppableRects.values().next().value;
  if (!rect) return;
  const { x, y } = currentCoordinates;
  switch (event.code) {
    case "ArrowRight": return { x: x + rect.width, y };
    case "ArrowLeft": return { x: x - rect.width, y };
    case "ArrowDown": return { x, y: y + rect.height };
    case "ArrowUp": return { x, y: y - rect.height };
  }
};
// The pointer decides while dragging with a mouse; the dragged rectangle decides with the keyboard.
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length ? within : rectIntersection(args);
};

export function CalendarView() {
  const today = todayLocal();
  const me = useSession().membershipId;
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [mine, setMine] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<CalendarStep | null>(null);
  const move = useMoveStep();

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const q = useCalendar(grid.from, grid.to);
  const first = monthStart(cursor.year, cursor.month);

  const items = useMemo(() => {
    const d = q.data;
    if (!d) return [];
    const list: Item[] = [
      ...d.deadlines.filter((x) => !mine || x.ownerId === me).map((x): Item => ({ kind: "deadline", key: `d-${x.projectId}`, day: x.dueDate, projectId: x.projectId, deadline: x })),
      ...d.followUps.filter((x) => !mine || x.ownerId === me).map((x): Item => ({ kind: "followUp", key: `f-${x.projectId}`, day: x.followUpOn, projectId: x.projectId, followUp: x })),
      ...d.steps.filter((x) => !mine || x.assigneeId === me).map((x): Item => ({ kind: "step", key: `s-${x.id}`, day: x.dueDate, projectId: x.projectId, step: x })),
    ];
    return list;
  }, [q.data, mine, me]);
  const byDay = useMemo(() => groupByDay(items, (i) => i.day), [items]);
  const inMonthCount = items.filter((i) => i.day.slice(0, 7) === first.slice(0, 7)).length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Space picks up and drops; Enter stays "open the project", as on any button.
    useSensor(KeyboardSensor, { coordinateGetter: cellKeyboard, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );
  const stepOf = (id: string | number) => q.data?.steps.find((s) => s.id === id);
  const announcements: Announcements = {
    onDragStart: ({ active }) => fmt(c.dragStart, { title: stepOf(active.id)?.title ?? "" }),
    onDragOver: ({ active, over }) => (over ? fmt(c.dragOver, { title: stepOf(active.id)?.title ?? "", date: longDay(String(over.id)) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? fmt(c.dragEnd, { title: stepOf(active.id)?.title ?? "", date: longDay(String(over.id)) }) : fmt(c.dragCancel, { title: stepOf(active.id)?.title ?? "" })),
    onDragCancel: ({ active }) => fmt(c.dragCancel, { title: stepOf(active.id)?.title ?? "" }),
  };
  const onDragStart = ({ active }: DragStartEvent) => setDragging(stepOf(active.id) ?? null);
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const step = stepOf(active.id);
    if (step && over) move(step, String(over.id));
  };

  const go = (delta: number) => setCursor((cur) => shiftMonth(cur.year, cur.month, delta));
  const label = monthLabel(first);
  const names = weekdays();
  const agendaDays = grid.weeks.flat().filter((d) => d.inMonth && byDay.has(d.iso));

  return (
    <div className="mx-auto flex max-w-[1312px] flex-col gap-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
          <div className="mt-1 min-h-5 text-sm text-muted-foreground" aria-live="polite">
            {q.isPending ? <Skeleton className="h-4 w-48" /> : inMonthCount === 0 ? (mine ? c.emptyMine : c.empty) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" aria-pressed={mine} title={c.mineHint} onClick={() => setMine((m) => !m)}
            className={cn("h-9 bg-card md:h-8", mine && "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:text-background dark:bg-foreground dark:hover:bg-foreground/90")}>
            <UserRound /> {c.mineOnly}
          </Button>
          <div className="ml-auto flex items-center gap-1 lg:ml-0" role="group" aria-label={label}>
            <Button variant="outline" size="icon" className="size-9 bg-card md:size-8" aria-label={c.prev} onClick={() => go(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" className="h-9 bg-card md:h-8" onClick={() => setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) })}>
              {c.today}
            </Button>
            <Button variant="outline" size="icon" className="size-9 bg-card md:size-8" aria-label={c.next} onClick={() => go(1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="flex items-center gap-2 text-lg font-medium" aria-live="polite">
          <CalendarDays aria-hidden className="size-4 text-muted-foreground" />
          {label}
        </h2>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={c.title}>
          <li className="flex items-center gap-1.5"><Circle aria-hidden className="size-3" />{c.legend.step}</li>
          <li className="flex items-center gap-1.5"><Flag aria-hidden className="size-3" />{c.legend.deadline}</li>
          <li className="flex items-center gap-1.5"><PhoneCall aria-hidden className="size-3" />{c.legend.followUp}</li>
        </ul>
      </div>

      {q.isError && !q.data ? (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm">
          <span>{c.loadError}</span>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            {t.common.retry}
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop and tablet: the month grid. Drag a step onto another day to change its due date. */}
          <DndContext
            id="calendar-grid"
            sensors={sensors}
            collisionDetection={collision}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onDragCancel={() => setDragging(null)}
            accessibility={{ announcements, screenReaderInstructions: { draggable: c.dragHint } }}
          >
            <div role="grid" aria-label={fmt(c.grid, { month: label })} aria-busy={q.isPending} className="hidden overflow-hidden rounded-lg border bg-card md:block">
              <div role="row" className="grid grid-cols-7 border-b">
                {names.map((n) => (
                  <div key={n.long} role="columnheader" aria-label={n.long} className="border-r px-2 py-1.5 text-xs text-muted-foreground last:border-r-0">
                    {n.short}
                  </div>
                ))}
              </div>
              {grid.weeks.map((week) => (
                <div key={week[0].iso} role="row" className="grid grid-cols-7 [&>*:last-child]:border-r-0 [&:last-child>*]:border-b-0">
                  {week.map((d) => (
                    <DayCell key={d.iso} iso={d.iso} inMonth={d.inMonth} today={today} items={byDay.get(d.iso) ?? []} onOpen={setProjectId} />
                  ))}
                </div>
              ))}
            </div>
            <DragOverlay dropAnimation={null}>
              {dragging && (
                <div className="w-44 cursor-grabbing rounded-sm shadow-md ring-1 ring-foreground/20">
                  <div className="flex h-6 items-center gap-1 rounded-sm bg-secondary px-1.5 text-xs">
                    <Circle aria-hidden className="size-3 flex-none" />
                    <span className="truncate">{dragging.title}</span>
                  </div>
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {/* Phones: an agenda of the days that have something, instead of seven cramped columns. */}
          <section aria-label={fmt(c.agenda, { month: label })} aria-busy={q.isPending} className="flex flex-col gap-5 md:hidden">
            {agendaDays.map((d) => (
              <div key={d.iso}>
                <h3 className={cn("mb-1.5 flex items-center gap-2 text-sm", d.iso === today ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
                  {upperFirst(longDay(d.iso))}
                  {d.iso === today && <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">{c.today}</span>}
                </h3>
                <ul className="flex flex-col gap-1">
                  {byDay.get(d.iso)!.map((it) => (
                    <li key={it.key} className="flex flex-col gap-0.5">
                      <StaticChip item={it} today={today} onOpen={setProjectId} large />
                      {it.kind === "step" && <span className="truncate px-1.5 text-xs text-muted-foreground">{it.step.projectName} · {formatDay(it.day, today)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </>
      )}

      <ProjectSheet projectId={projectId} onClose={() => setProjectId(null)} />
    </div>
  );
}
