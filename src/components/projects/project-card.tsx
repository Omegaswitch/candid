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
import { daysBetween } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ProjectSummary } from "@/server/projects";
import { DueLabel, HighPriority, Initials, StatusPill } from "./project-bits";
import { ProgressRing } from "./progress-ring";

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

/**
 * As the due date nears, the whole card warms from a light orange (a week out) to red (due today),
 * and stays red once overdue. Completed projects and projects without a date stay neutral.
 * The tint is mixed into the card colour, so it works in both themes and keeps text contrast.
 */
function dueTint(p: ProjectSummary, today: string): CSSProperties | undefined {
  if (!p.dueDate || p.status === "completed") return undefined;
  const days = daysBetween(today, p.dueDate);
  if (days > 7) return undefined;
  if (days < 0) {
    return { background: "color-mix(in oklch, var(--card), var(--negative) 14%)", borderColor: "color-mix(in oklch, var(--border), var(--negative) 45%)" };
  }
  // 7 days → light orange, 0 days → red: the hue walks from orange to red as the date arrives.
  const k = 1 - days / 7;
  const hue = `color-mix(in oklch, #f59e0b, var(--negative) ${Math.round(k * 100)}%)`;
  return {
    background: `color-mix(in oklch, var(--card), ${hue} ${Math.round(7 + k * 7)}%)`,
    borderColor: `color-mix(in oklch, var(--border), ${hue} ${Math.round(25 + k * 25)}%)`,
  };
}

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
  const tint = dueTint(p, today);
  return (
    <div
      ref={drag?.ref}
      style={{ ...drag?.style, ...tint }}
      className={cn(
        "group relative flex flex-col gap-4 rounded-xl border bg-card p-5 transition-[border-color,box-shadow] duration-150 hover:border-foreground/25 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50",
        drag?.dragging && "z-20 border-foreground/30 shadow-md",
      )}
    >
      <div className="absolute right-2 top-2 flex items-center">
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

      <div className="flex flex-col items-center gap-3 pt-1 text-center">
        <ProgressRing done={p.doneCount} total={p.taskCount} size={128} ticks caption={t.projects.completedShort} />
        <div className="w-full min-w-0 px-6">
          <a
            href={`/projects/${p.id}`}
            onClick={(e) => openOnClick(e, () => actions.open(p.id))}
            className="block truncate text-base font-medium outline-none after:absolute after:inset-0 after:rounded-lg"
          >
            {p.name}
          </a>
          <div className="truncate text-[13px] text-muted-foreground">{p.client ?? t.common.none}</div>
        </div>
      </div>

      <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{t.projects.next}</dt>
          <dd className="truncate">{p.nextTask ? p.nextTask.title : <span className="text-muted-foreground">{p.taskCount ? t.projects.allDone : t.common.none}</span>}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{t.projects.dueLabel}</dt>
          <dd><DueLabel date={p.dueDate} done={p.status === "completed"} today={today} /></dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{t.projects.progressLabel}</dt>
          <dd className="num">{p.taskCount ? fmt(t.projects.progress, { done: p.doneCount, total: p.taskCount }) : t.projects.noTasks}</dd>
        </div>
        <div className="flex min-w-0 items-end justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <StatusPill status={p.status} />
            {p.priority === "high" && <HighPriority />}
          </div>
          <Initials name={ownerName} />
        </div>
      </dl>
    </div>
  );
});
