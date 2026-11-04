"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, MoreHorizontal, PanelBottomOpen, Pencil, StickyNote, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import type { TaskPatch, TaskRow as Task } from "@/hooks/project-detail";
import { fmt, t } from "@/i18n";
import { dueState, formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { DateInput, MemberSelect, useMemberName } from "./fields";
import { CommitInput, InlineText } from "./inline-text";
import { TaskNote } from "./notes";

/** Assignee, due date and waiting state on the row's second line. Overdue and waiting always carry a word. */
function TaskMeta({ task }: { task: Task }) {
  const name = useMemberName()(task.assigneeId);
  const due = task.done ? null : dueState(task.dueDate);
  const parts: React.ReactNode[] = [];
  if (name) parts.push(<span key="a">{name}</span>);
  if (task.dueDate) {
    parts.push(
      due === "overdue" ? (
        <span key="d" className="font-medium text-negative">
          {t.tasks.overdue} · <span className="num">{formatDay(task.dueDate)}</span>
        </span>
      ) : (
        <span key="d" className="num">
          {fmt(t.tasks.dueOn, { date: formatDay(task.dueDate)! })}
        </span>
      ),
    );
  }
  if (task.note) parts.push(<StickyNote key="n" aria-label={t.tasks.note} className="size-3" />);
  const waiting = task.waiting && !task.done;
  if (!parts.length && !waiting) return null;
  return (
    <div className="grid gap-1 text-xs text-muted-foreground">
      {waiting && (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex-none rounded-full bg-pill-warning px-1.5 py-px font-medium text-pill-warning-ink">{t.tasks.waiting}</span>
          {task.waitingReason && <span className="truncate">{task.waitingReason}</span>}
        </span>
      )}
      {parts.length > 0 && (
        <span className="flex min-w-0 flex-wrap items-center gap-x-2">
          {parts.map((p, i) => (
            <span key={i} className="flex items-center gap-2 whitespace-nowrap">
              {i > 0 && <span aria-hidden>·</span>}
              {p}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function TaskDetails({ projectId, task, onPatch }: { projectId: string; task: Task; onPatch: (p: TaskPatch) => void }) {
  const id = useId();
  const label = "text-xs text-muted-foreground";
  return (
    <div className="grid gap-3 pt-2 pb-1">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1">
          <label htmlFor={`${id}-a`} className={label}>
            {t.tasks.assignee}
          </label>
          <MemberSelect id={`${id}-a`} value={task.assigneeId} onChange={(assigneeId) => onPatch({ assigneeId })} className="border-input" />
        </div>
        <div className="grid gap-1">
          <label htmlFor={`${id}-d`} className={label}>
            {t.tasks.due}
          </label>
          <DateInput id={`${id}-d`} value={task.dueDate} onChange={(dueDate) => onPatch({ dueDate })} className="border-input" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <div className="flex items-center gap-2">
          <Switch id={`${id}-w`} checked={task.waiting} onCheckedChange={(waiting) => onPatch({ waiting })} />
          <label htmlFor={`${id}-w`} className="text-sm">
            {t.tasks.waiting}
          </label>
        </div>
        {task.waiting && (
          <CommitInput
            value={task.waitingReason ?? ""}
            allowEmpty
            passCleanEscape
            aria-label={t.tasks.waitingFor}
            placeholder={t.tasks.waitingReasonPlaceholder}
            onCommit={(v) => onPatch({ waitingReason: v || null })}
            className="h-8"
          />
        )}
      </div>
      <TaskNote projectId={projectId} task={task} />
    </div>
  );
}

export function TaskRow({
  projectId,
  task,
  selecting,
  selected,
  onSelect,
  onToggle,
  onPatch,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  projectId: string;
  task: Task;
  selecting: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onToggle: () => void;
  onPatch: (p: TaskPatch) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const renameRequested = useRef(false);
  const detailsId = useId();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: selecting });
  const title = { title: task.title };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group relative rounded-md border border-transparent px-1 py-1.5",
        isDragging && "z-10 border-border bg-popover shadow-sm",
        selected && "border-border bg-accent",
      )}
    >
      <div className="flex items-start gap-1.5">
        {!selecting && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={fmt(t.tasks.dragHandle, title)}
            className="mt-1 flex h-6 w-4 flex-none cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical aria-hidden className="size-3.5" />
          </button>
        )}
        <span className="flex h-8 w-6 flex-none items-center justify-center">
          {selecting ? (
            <Checkbox checked={selected} onCheckedChange={(v) => onSelect(v === true)} aria-label={fmt(t.tasks.selectTask, title)} />
          ) : (
            <Checkbox
              checked={task.done}
              onCheckedChange={onToggle}
              aria-label={fmt(task.done ? t.tasks.reopen : t.tasks.complete, title)}
              className="rounded-full data-checked:border-positive data-checked:bg-positive dark:data-checked:bg-positive"
            />
          )}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5 py-1">
          <InlineText
            value={task.title}
            onSave={(v) => onPatch({ title: v })}
            editing={editing}
            onEditingChange={setEditing}
            label={t.tasks.titleLabel}
            editLabel={fmt(t.tasks.editTitle, title)}
            className={cn("text-sm break-words", task.done && "text-muted-foreground line-through decoration-muted-foreground/60")}
          >
            {task.title}
          </InlineText>
          <TaskMeta task={task} />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-expanded={open}
          aria-controls={detailsId}
          aria-label={`${open ? t.tasks.hideDetails : t.tasks.details}: ${task.title}`}
          onClick={() => setOpen((o) => !o)}
          className="mt-0.5 text-muted-foreground"
        >
          <ChevronDown aria-hidden className={cn("transition-transform duration-150", open && "rotate-180")} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={fmt(t.tasks.actions, title)} className="mt-0.5 text-muted-foreground">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44"
            onCloseAutoFocus={(e) => {
              // Rename: open the input once the menu has let go of focus.
              if (!renameRequested.current) return;
              renameRequested.current = false;
              e.preventDefault();
              setEditing(true);
            }}
          >
            <DropdownMenuItem onSelect={() => (renameRequested.current = true)}>
              <Pencil aria-hidden /> {t.common.rename}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setOpen((o) => !o)}>
              <PanelBottomOpen aria-hidden /> {open ? t.tasks.hideDetails : t.tasks.details}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove(-1)}>
              <ArrowUp aria-hidden /> {t.tasks.moveUp}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove(1)}>
              <ArrowDown aria-hidden /> {t.tasks.moveDown}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 aria-hidden /> {t.common.remove}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <div id={detailsId} className="pr-2 pl-12">
          <TaskDetails projectId={projectId} task={task} onPatch={onPatch} />
        </div>
      )}
    </li>
  );
}
