"use client";

import {
  closestCenter,
  DndContext,
  useDroppable,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ChevronRight, Plus, Users } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePrefs, useMembers, useSavePrefs } from "@/hooks/queries";
import {
  errorText,
  useTaskActions,
  type TaskRow as Task,
} from "@/hooks/project-detail";
import { fmt, plural, t } from "@/i18n";
import { isPlainShortcut } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import { useEscapeCancel } from "./inline-text";
import { TaskRow } from "./task-row";
import { useMemberName } from "./fields";
import { Initials } from "@/components/projects/project-bits";
import { ProgressRing } from "@/components/projects/progress-ring";

/** The step ring and "2 of 4 completed"; the ring fills one step per ticked item. */
export function Progress({ tasks }: { tasks: Task[] }) {
  const done = tasks.filter((x) => x.done).length;
  const next = tasks.find((x) => !x.done);
  return (
    <div className="flex items-center gap-4">
      <ProgressRing done={done} total={tasks.length} size={64} />
      <div className="grid min-w-0 gap-0.5">
        <p className="num text-sm font-medium">
          {fmt(t.tasks.progress, { done, total: tasks.length })}
        </p>
        {next && (
          <p className="truncate text-sm text-muted-foreground">
            {t.projects.next}:{" "}
            <span className="text-foreground">{next.title}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function AddTask({ onAdd }: { onAdd: (title: string) => Promise<unknown> }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEscapeCancel(ref, !!text, () => setText(""));
  // T: jump to "add a step" in the open project panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainShortcut(e, "t", "[role=dialog]") || !ref.current) return;
      e.preventDefault();
      ref.current.focus();
      ref.current.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const submit = () => {
    const title = text.trim();
    if (!title) return;
    setText("");
    onAdd(title).catch((e) => {
      // Give the text back so nothing typed is lost.
      setText((cur) => cur || title);
      toast.error(`${fmt(t.tasks.addFailed, { title })}. ${errorText(e)}`);
    });
  };
  return (
    <div className="flex items-center gap-1.5 px-1">
      <span className="flex h-8 w-10 flex-none items-center justify-end pr-1 text-muted-foreground">
        <Plus aria-hidden className="size-4" />
      </span>
      <Input
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        aria-label={t.tasks.add}
        placeholder={t.tasks.addPlaceholder}
        maxLength={500}
        className="h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
      />
    </div>
  );
}

function BulkBar({
  ids,
  onClear,
  actions,
}: {
  ids: string[];
  onClear: () => void;
  actions: ReturnType<typeof useTaskActions>;
}) {
  const members = useMembers();
  const [due, setDue] = useState("");
  const [dueOpen, setDueOpen] = useState(false);
  const none = ids.length === 0;
  return (
    <div
      role="toolbar"
      aria-label={t.tasks.select}
      className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card p-1.5"
    >
      <span
        role="status"
        aria-live="polite"
        className="num px-1.5 text-sm font-medium"
      >
        {plural(ids.length, t.tasks.selected)}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={none}
        onClick={() => actions.bulkUpdate(ids, { done: true })}
      >
        {t.tasks.bulkComplete}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={none}>
            {t.tasks.bulkAssign}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          {members.data?.map((m) => (
            <DropdownMenuItem
              key={m.id}
              onSelect={() => actions.bulkUpdate(ids, { assigneeId: m.id })}
            >
              {m.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => actions.bulkUpdate(ids, { assigneeId: null })}
          >
            {t.tasks.panel.unassigned}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={dueOpen} onOpenChange={setDueOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={none}>
            {t.tasks.bulkDue}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-60">
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!due) return;
              actions.bulkUpdate(ids, { dueDate: due });
              setDueOpen(false);
            }}
          >
            <label className="grid gap-1 text-xs text-muted-foreground">
              {t.tasks.due}
              <Input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="num dark:scheme-dark"
              />
            </label>
            <div className="flex justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  actions.bulkUpdate(ids, { dueDate: null });
                  setDueOpen(false);
                }}
              >
                {t.tasks.bulkClearDate}
              </Button>
              <Button type="submit" size="sm" disabled={!due}>
                {t.tasks.bulkApply}
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="sm"
        disabled={none}
        onClick={onClear}
        className="ml-auto"
      >
        {t.tasks.bulkClear}
      </Button>
    </div>
  );
}

const UNASSIGNED = "none";
const sectionDropId = (key: string) => `section:${key}`;

/** One person's block in "group by person": divider with initials, name and done/total, then their open steps. */
function PersonSection({
  sectionKey,
  name,
  done,
  total,
  children,
}: {
  sectionKey: string;
  name: string | null;
  done: number;
  total: number;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: sectionDropId(sectionKey),
  });
  const label = name ?? t.tasks.panel.unassigned;
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={label}
      className={cn("grid gap-1 rounded-lg", isOver && "bg-accent/40")}
    >
      <div className="flex items-center gap-2 px-1 pt-2">
        {name ? (
          <Initials name={name} />
        ) : (
          <span
            aria-hidden
            className="inline-flex size-6 flex-none items-center justify-center rounded-full border border-dashed text-[11px] text-muted-foreground"
          >
            ?
          </span>
        )}
        <span className="truncate text-xs font-medium">{label}</span>
        <span className="num text-xs text-muted-foreground">
          {fmt(t.tasks.groupCount, { done, total })}
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      {children}
    </div>
  );
}

export function Checklist({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: Task[];
}) {
  const actions = useTaskActions(projectId);
  const headingId = useId();
  const prefs = usePrefs();
  const savePrefs = useSavePrefs();
  const collapsed = prefs.data?.completedCollapsed ?? true;
  const byPerson = prefs.data?.checklistByPerson ?? false;
  const members = useMembers();
  const memberName = useMemberName();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const open = tasks.filter((x) => !x.done);
  const done = tasks.filter((x) => x.done);
  const selectedIds = tasks.filter((x) => selected.has(x.id)).map((x) => x.id);

  /** Moves within one group (open or completed); the full order is sent, hidden tasks keep their places. */
  const move = (group: Task[], from: string, to: string) => {
    const a = tasks.findIndex((x) => x.id === from);
    const b = tasks.findIndex((x) => x.id === to);
    if (a < 0 || b < 0 || a === b || !group.some((x) => x.id === to)) return;
    actions.reorder(arrayMove(tasks, a, b).map((x) => x.id));
  };
  const onDragEnd = (group: Task[]) => (e: DragEndEvent) =>
    e.over && move(group, String(e.active.id), String(e.over.id));

  const keyOf = (x: Task) => x.assigneeId ?? UNASSIGNED;
  /** Sections for the open steps: members in roster order (then unknown ids), "Unassigned" always last as a drop target. */
  const sectionKeys = (() => {
    const present = new Set(open.map(keyOf));
    const order = (members.data ?? [])
      .map((m) => m.id)
      .filter((id) => present.has(id));
    for (const k of present)
      if (k !== UNASSIGNED && !order.includes(k)) order.push(k);
    return [...order, UNASSIGNED];
  })();
  /** Drop in grouped mode: into another section reassigns (and places it at the target step); same section reorders. */
  const onGroupedDragEnd = (e: DragEndEvent) => {
    if (!e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    const task = open.find((x) => x.id === activeId);
    if (!task) return;
    const overTask = open.find((x) => x.id === overId);
    const target = overTask
      ? keyOf(overTask)
      : overId.startsWith("section:")
        ? overId.slice("section:".length)
        : null;
    if (target === null) return;
    if (target !== keyOf(task)) {
      const assigneeId = target === UNASSIGNED ? null : target;
      actions.patch(task.id, { assigneeId });
      toast.success(
        fmt(t.tasks.reassigned, {
          name: memberName(assigneeId) ?? t.tasks.panel.unassigned,
        }),
      );
    }
    if (overTask && overTask.id !== task.id) {
      const a = tasks.findIndex((x) => x.id === activeId);
      const b = tasks.findIndex((x) => x.id === overId);
      actions.reorder(arrayMove(tasks, a, b).map((x) => x.id));
    }
  };

  const rows = (group: Task[]) => (
    <ul className="grid gap-px">
      {group.map((task, i) => (
        <TaskRow
          key={task.id}
          projectId={projectId}
          task={task}
          selecting={selecting}
          selected={selected.has(task.id)}
          onSelect={(on) =>
            setSelected((s) => {
              const n = new Set(s);
              if (on) n.add(task.id);
              else n.delete(task.id);
              return n;
            })
          }
          onToggle={() => actions.toggle(task)}
          onPatch={(p) => actions.patch(task.id, p)}
          onRemove={() => actions.removeTask(task)}
          onMove={(dir) => move(group, task.id, group[i + dir].id)}
          canMoveUp={i > 0}
          canMoveDown={i < group.length - 1}
        />
      ))}
    </ul>
  );

  const grouped = () => (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onGroupedDragEnd}
    >
      {sectionKeys.map((key) => {
        const mine = tasks.filter((x) => keyOf(x) === key);
        const section = open.filter((x) => keyOf(x) === key);
        return (
          <PersonSection
            key={key}
            sectionKey={key}
            name={key === UNASSIGNED ? null : (memberName(key) ?? key)}
            done={mine.filter((x) => x.done).length}
            total={mine.length}
          >
            <SortableContext
              items={section.map((x) => x.id)}
              strategy={verticalListSortingStrategy}
            >
              {section.length > 0 ? (
                rows(section)
              ) : (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {t.tasks.groupDropHint}
                </p>
              )}
            </SortableContext>
          </PersonSection>
        );
      })}
    </DndContext>
  );

  const list = (group: Task[]) => (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd(group)}
    >
      <SortableContext
        items={group.map((x) => x.id)}
        strategy={verticalListSortingStrategy}
      >
        {rows(group)}
      </SortableContext>
    </DndContext>
  );

  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id={headingId} className="text-sm font-medium">
          {t.tasks.checklist}
        </h3>
        {tasks.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={byPerson}
              onClick={() => savePrefs.mutate({ checklistByPerson: !byPerson })}
            >
              <Users aria-hidden />
              {t.tasks.groupByPerson}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={selecting}
              onClick={() => {
                setSelecting((s) => !s);
                setSelected(new Set());
              }}
            >
              {selecting ? t.tasks.doneSelecting : t.tasks.select}
            </Button>
          </div>
        )}
      </div>
      <Progress tasks={tasks} />
      {selecting && (
        <BulkBar
          ids={selectedIds}
          onClear={() => setSelected(new Set())}
          actions={actions}
        />
      )}

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
          {t.tasks.empty}
        </p>
      ) : (
        <div className="-mx-1 grid gap-1">
          {byPerson ? grouped() : list(open)}
          {done.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={!collapsed}
                onClick={() =>
                  savePrefs.mutate({ completedCollapsed: !collapsed })
                }
                className="justify-start gap-1 self-start text-muted-foreground"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "transition-transform duration-150",
                    !collapsed && "rotate-90",
                  )}
                />
                <span className="num">
                  {collapsed
                    ? plural(done.length, t.tasks.showCompleted)
                    : t.tasks.hideCompleted}
                </span>
              </Button>
              {!collapsed && list(done)}
            </>
          )}
        </div>
      )}
      <AddTask onAdd={(title) => actions.create.mutateAsync(title)} />
    </section>
  );
}
