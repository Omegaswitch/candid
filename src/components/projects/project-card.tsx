"use client";

import { ArrowDown, ArrowUp, Archive, Copy, GripVertical, MoreHorizontal, PanelRightOpen, Pin, PinOff } from "lucide-react";
import { memo, type CSSProperties, type HTMLAttributes, type MouseEvent, type Ref } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmt, t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ProjectSummary } from "@/server/projects";
import { ChecklistTrack, DueLabel, HighPriority, Initials, StatusPill } from "./project-bits";

export type CardActions = {
  open: (id: string) => void;
  pin: (p: ProjectSummary) => void;
  duplicate: (p: ProjectSummary) => void;
  archive: (p: ProjectSummary) => void;
  /** Present only while manual reorder is possible. */
  move?: (id: string, delta: -1 | 1) => void;
};

/** Plain left-click opens the panel in place; modified clicks keep the link's normal behaviour. */
export function openOnClick(e: MouseEvent, open: () => void) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  open();
}

export function ProjectMenu({
  p,
  actions,
  index,
  count,
}: {
  p: ProjectSummary;
  actions: CardActions;
  index: number;
  count: number;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative z-10 text-muted-foreground" aria-label={fmt(t.projects.menu.label, { name: p.name })}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={() => actions.open(p.id)}>
          <PanelRightOpen /> {t.projects.menu.open}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.pin(p)}>
          {p.pinned ? <PinOff /> : <Pin />} {p.pinned ? t.projects.menu.unpin : t.projects.menu.pin}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.duplicate(p)}>
          <Copy /> {t.projects.menu.duplicate}
        </DropdownMenuItem>
        {actions.move && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={index === 0} onSelect={() => actions.move!(p.id, -1)}>
              <ArrowUp /> {t.projects.menu.moveUp}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={index === count - 1} onSelect={() => actions.move!(p.id, 1)}>
              <ArrowDown /> {t.projects.menu.moveDown}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.archive(p)}>
          <Archive /> {t.projects.menu.archive}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type DragProps = {
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  dragging?: boolean;
  handle?: HTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> };
};

export const ProjectCard = memo(function ProjectCard({
  p,
  ownerName,
  today,
  actions,
  index,
  count,
  drag,
}: {
  p: ProjectSummary;
  ownerName: string | null;
  today: string;
  actions: CardActions;
  index: number;
  count: number;
  drag?: DragProps;
}) {
  const { ref: handleRef, ...handleProps } = drag?.handle ?? {};
  return (
    <div
      ref={drag?.ref}
      style={drag?.style}
      className={cn(
        "group relative flex flex-col gap-3 rounded-lg border bg-card p-4 transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50",
        drag?.dragging && "z-20 border-foreground/30 shadow-md",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <a
            href={`/projects/${p.id}`}
            onClick={(e) => openOnClick(e, () => actions.open(p.id))}
            className="block truncate text-base font-medium outline-none after:absolute after:inset-0 after:rounded-lg"
          >
            {p.name}
          </a>
          <div className="truncate text-[13px] text-muted-foreground">{p.client ?? t.common.none}</div>
        </div>
        <div className="-mr-1.5 -mt-1 flex items-center">
          {drag?.handle && (
            <Button
              ref={handleRef}
              variant="ghost"
              size="icon-sm"
              className="relative z-10 cursor-grab touch-none text-muted-foreground active:cursor-grabbing sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              aria-label={fmt(t.projects.dragHandle, { name: p.name })}
              {...handleProps}
            >
              <GripVertical />
            </Button>
          )}
          <ProjectMenu p={p} actions={actions} index={index} count={count} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <ChecklistTrack done={p.doneCount} total={p.taskCount} />
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="num text-muted-foreground">
            {p.taskCount ? fmt(t.projects.progress, { done: p.doneCount, total: p.taskCount }) : t.projects.noTasks}
          </span>
          <DueLabel date={p.dueDate} done={p.status === "completed"} today={today} />
        </div>
      </div>

      <div className="min-w-0 text-sm">
        {p.nextTask ? (
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="flex-none text-xs text-muted-foreground">{t.projects.next}</span>
            <span className="truncate">{p.nextTask.title}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">{p.taskCount ? t.projects.allDone : t.common.none}</span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2">
        <StatusPill status={p.status} />
        {p.priority === "high" && <HighPriority />}
        <span className="ml-auto">
          <Initials name={ownerName} />
        </span>
      </div>
    </div>
  );
});
