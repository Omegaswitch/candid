"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronRight, Plus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePrefs, useMembers, useSavePrefs } from "@/hooks/queries";
import { errorText, useTaskActions, type TaskRow as Task } from "@/hooks/project-detail";
import { fmt, plural, t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useEscapeCancel } from "./inline-text";
import { TaskRow } from "./task-row";
import { ProgressRing } from "@/components/projects/progress-ring";

/** The step ring and "2 of 4 completed"; the ring fills one step per ticked item. */
export function Progress({ tasks }: { tasks: Task[] }) {
  const done = tasks.filter((x) => x.done).length;
  const next = tasks.find((x) => !x.done);
  return (
    <div className="flex items-center gap-4">
      <ProgressRing done={done} total={tasks.length} size={64} />
      <div className="grid min-w-0 gap-0.5">
        <p className="num text-sm font-medium">{fmt(t.tasks.progress, { done, total: tasks.length })}</p>
        {next && (
          <p className="truncate text-sm text-muted-foreground">
            {t.projects.next}: <span className="text-foreground">{next.title}</span>
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

function BulkBar({ ids, onClear, actions }: { ids: string[]; onClear: () => void; actions: ReturnType<typeof useTaskActions> }) {
  const members = useMembers();
  const [due, setDue] = useState("");
  const [dueOpen, setDueOpen] = useState(false);
  const none = ids.length === 0;
  return (
    <div role="toolbar" aria-label={t.tasks.select} className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-card p-1.5">
      <span role="status" aria-live="polite" className="num px-1.5 text-sm font-medium">
        {plural(ids.length, t.tasks.selected)}
      </span>
      <Button variant="outline" size="sm" disabled={none} onClick={() => actions.bulkUpdate(ids, { done: true })}>
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
            <DropdownMenuItem key={m.id} onSelect={() => actions.bulkUpdate(ids, { assigneeId: m.id })}>
              {m.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => actions.bulkUpdate(ids, { assigneeId: null })}>{t.tasks.panel.unassigned}</DropdownMenuItem>
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
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="num dark:scheme-dark" />
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
      <Button variant="ghost" size="sm" disabled={none} onClick={onClear} className="ml-auto">
        {t.tasks.bulkClear}
      </Button>
    </div>
  );
}

export function Checklist({ projectId, tasks }: { projectId: string; tasks: Task[] }) {
  const actions = useTaskActions(projectId);
  const headingId = useId();
  const prefs = usePrefs();
  const savePrefs = useSavePrefs();
  const collapsed = prefs.data?.completedCollapsed ?? true;
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
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
  const onDragEnd = (group: Task[]) => (e: DragEndEvent) => e.over && move(group, String(e.active.id), String(e.over.id));

  const list = (group: Task[]) => (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(group)}>
      <SortableContext items={group.map((x) => x.id)} strategy={verticalListSortingStrategy}>
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
        )}
      </div>
      <Progress tasks={tasks} />
      {selecting && <BulkBar ids={selectedIds} onClear={() => setSelected(new Set())} actions={actions} />}

      {tasks.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">{t.tasks.empty}</p>
      ) : (
        <div className="-mx-1 grid gap-1">
          {list(open)}
          {done.length > 0 && (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={!collapsed}
                onClick={() => savePrefs.mutate({ completedCollapsed: !collapsed })}
                className="justify-start gap-1 self-start text-muted-foreground"
              >
                <ChevronRight aria-hidden className={cn("transition-transform duration-150", !collapsed && "rotate-90")} />
                <span className="num">{collapsed ? plural(done.length, t.tasks.showCompleted) : t.tasks.hideCompleted}</span>
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
