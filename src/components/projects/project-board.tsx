"use client";

import {
  DndContext,
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
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo } from "react";
import { toast } from "sonner";
import { useSetProjectStatus } from "@/hooks/projects";
import { fmt, t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ProjectSummary } from "@/server/projects";
import { type CardActions, openOnClick, ProjectMenu } from "./project-card";
import { ChecklistTrack, DueLabel, HighPriority, LabelChips, StatusPill } from "./project-bits";

const STATUSES = ["active", "waiting", "completed"] as const;
type Status = (typeof STATUSES)[number];
const b = t.projects.board;

// Pointer: the column under the cursor; keyboard (no pointer): the column the card overlaps most.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

type MoveTo = (p: ProjectSummary, status: Status, fromMenu?: boolean) => void;

function BoardCard({ p, today, actions, moveTo }: { p: ProjectSummary; today: string; actions: CardActions; moveTo: MoveTo }) {
  const { setNodeRef, transform, attributes, listeners, isDragging } = useDraggable({ id: p.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      className={cn(
        "relative grid gap-2 rounded-lg border bg-card p-3 text-sm md:touch-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        isDragging ? "z-10 cursor-grabbing shadow-lg" : "cursor-grab",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <a
          href={`/projects/${p.id}`}
          onClick={(e) => openOnClick(e, () => actions.open(p.id))}
          onPointerDown={(e) => e.stopPropagation()}
          className="truncate font-medium hover:underline"
        >
          {p.name}
        </a>
        {p.priority === "high" && <HighPriority />}
        {/* The menu is not a drag handle: keep its pointer and key presses away from the card's sensors. */}
        <span className="-my-1 -mr-1.5 ml-auto flex-none" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <ProjectMenu p={p} actions={actions} index={0} count={1} onStatus={(s) => moveTo(p, s, true)} />
        </span>
      </div>
      {p.client && <div className="-mt-1.5 truncate text-xs text-muted-foreground">{p.client}</div>}
      <LabelChips labels={p.labels} />
      <ChecklistTrack done={p.doneCount} total={p.taskCount} />
      <div className="text-xs">
        <DueLabel date={p.dueDate} done={p.status === "completed"} today={today} />
      </div>
    </li>
  );
}

function Column({
  status,
  projects,
  today,
  actions,
  moveTo,
}: {
  status: Status;
  projects: ProjectSummary[];
  today: string;
  actions: CardActions;
  moveTo: MoveTo;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={t.projects.status[status]}
      className={cn("flex w-[82%] min-w-0 flex-none snap-start flex-col gap-2 rounded-xl border bg-muted/40 p-2 transition-colors sm:w-[46%] md:w-auto", isOver && "border-foreground/40 bg-accent")}
    >
      <header className="flex items-center gap-2 px-1 pt-0.5">
        <StatusPill status={status} />
        <span className="num text-xs text-muted-foreground">{projects.length}</span>
      </header>
      <ul className="flex min-h-24 flex-col gap-2">
        {projects.map((p) => (
          <BoardCard key={p.id} p={p} today={today} actions={actions} moveTo={moveTo} />
        ))}
        {!projects.length && <li className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{b.empty}</li>}
      </ul>
    </section>
  );
}

/** Pipeline: one column per project status; dropping a card in another column changes its status. */
export function ProjectBoard({ projects, today, actions }: { projects: ProjectSummary[]; today: string; actions: CardActions }) {
  const setStatus = useSetProjectStatus();
  // Board order is by status, not manual position: no "Move up / down" in the card menu here.
  const boardActions = useMemo(() => ({ ...actions, move: undefined }), [actions]);
  const moveTo: MoveTo = (p, status, fromMenu) => {
    if (p.status === status) return;
    setStatus.mutate({ p, status });
    // From the menu the card may leave the visible column (phones): say where it went.
    if (fromMenu) toast.success(fmt(b.moved, { name: p.name, status: t.projects.status[status] }));
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const nameOf = (id: string | number) => projects.find((p) => p.id === id)?.name ?? "";
  const statusName = (id: string | number | undefined) => (id ? t.projects.status[id as Status] : "");
  const announcements: Announcements = {
    onDragStart: ({ active }) => fmt(b.dragStart, { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? fmt(b.dragOver, { name: nameOf(active.id), status: statusName(over.id) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? fmt(b.dragEnd, { name: nameOf(active.id), status: statusName(over.id) }) : undefined),
    onDragCancel: ({ active }) => fmt(b.dragCancel, { name: nameOf(active.id) }),
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const p = projects.find((x) => x.id === active.id);
    const status = over?.id as Status | undefined;
    if (p && status) moveTo(p, status);
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: b.hint } }}
    >
      {/* Phones and small tablets: the columns sit side by side and scroll sideways, snapping to a column. */}
      <div
        role="group"
        aria-label={b.label}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0"
      >
        {STATUSES.map((s) => (
          <Column key={s} status={s} projects={projects.filter((p) => p.status === s)} today={today} actions={boardActions} moveTo={moveTo} />
        ))}
      </div>
    </DndContext>
  );
}
