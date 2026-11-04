"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave, useProjectNotesSave, useTaskNoteSave, type TaskRow, type TextConflict } from "@/hooks/project-detail";
import { fmt, t } from "@/i18n";
import { formatInstant } from "@/lib/dates";
import { cn } from "@/lib/utils";

type Autosave = ReturnType<typeof useAutosave>;

export function ConflictDialog({
  conflict,
  open,
  onOpenChange,
  onResolve,
}: {
  conflict: TextConflict;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolve: (choice: "mine" | "theirs" | "both") => void;
}) {
  const c = t.common.conflict;
  const box = "max-h-64 min-h-24 overflow-y-auto rounded-md border bg-background p-2.5 text-sm whitespace-pre-wrap break-words";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{c.title}</DialogTitle>
          <DialogDescription>{c.body}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <section aria-label={c.yours} className="grid gap-1.5">
            <h3 className="text-xs text-muted-foreground">{c.yours}</h3>
            <div className={box}>{conflict.mine || t.common.none}</div>
          </section>
          <section aria-label={c.theirs} className="grid gap-1.5">
            <h3 className="text-xs text-muted-foreground">{fmt(c.theirs, { when: formatInstant(conflict.theirsSavedAt) })}</h3>
            <div className={box}>{conflict.theirs || t.common.none}</div>
          </section>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => onResolve("both")}>
            {c.merge}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => onResolve("theirs")}>
              {c.keepTheirs}
            </Button>
            <Button onClick={() => onResolve("mine")}>{c.keepMine}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Saving…", "Saved", "Could not save" + Retry, offline, or an unresolved conflict. Announced politely. */
function SaveState({ s, onOpenConflict }: { s: Autosave; onOpenConflict: () => void }) {
  let body: React.ReactNode = null;
  if (s.conflict) {
    body = (
      <>
        <span className="text-negative">{t.common.couldNotSave}</span>
        <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={onOpenConflict}>
          {t.common.conflict.title}
        </Button>
      </>
    );
  } else if (s.status === "error" || s.status === "offline") {
    body = (
      <>
        <span className="text-negative">{s.status === "offline" ? t.tasks.panel.offline : t.common.couldNotSave}</span>
        <Button variant="link" size="xs" className="h-auto px-0 text-xs" onClick={() => void s.retry()}>
          {t.common.retry}
        </Button>
      </>
    );
  } else if (s.status === "saving") body = t.common.saving;
  else if (s.dirty) body = t.tasks.panel.unsaved;
  else if (s.status === "saved") body = t.common.saved;
  return (
    <span role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {body}
    </span>
  );
}

function NotesField({
  s,
  placeholder,
  className,
  heading,
}: {
  s: Autosave;
  placeholder: string;
  className?: string;
  heading: (id: string, state: React.ReactNode) => React.ReactNode;
}) {
  const id = useId();
  const [dialogOpen, setDialogOpen] = useState(true);
  const state = <SaveState s={s} onOpenConflict={() => setDialogOpen(true)} />;
  return (
    <div className="grid gap-1.5">
      {heading(id, state)}
      <Textarea
        id={id}
        value={s.text}
        placeholder={placeholder}
        onChange={(e) => s.setText(e.target.value)}
        onBlur={() => void s.flush()}
        className={cn("resize-y text-sm", className)}
      />
      {s.conflict && (
        <ConflictDialog
          conflict={s.conflict}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onResolve={(choice) => {
            s.resolve(choice);
            setDialogOpen(true);
          }}
        />
      )}
    </div>
  );
}

export function ProjectNotes({ projectId, notes, notesVersion }: { projectId: string; notes: string; notesVersion: number }) {
  const save = useProjectNotesSave(projectId);
  const s = useAutosave({
    serverText: notes,
    serverVersion: notesVersion,
    save,
    fromConflict: (cur) => {
      const c = cur as { notes: string; notesVersion: number; updatedAt: string };
      return { text: c.notes, version: c.notesVersion, savedAt: c.updatedAt };
    },
  });
  return (
    <NotesField
      s={s}
      placeholder={t.tasks.panel.notesPlaceholder}
      className="min-h-28"
      heading={(id, state) => (
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-medium">
            <label htmlFor={id}>{t.tasks.panel.notes}</label>
          </h3>
          {state}
        </div>
      )}
    />
  );
}

export function TaskNote({ projectId, task }: { projectId: string; task: TaskRow }) {
  const save = useTaskNoteSave(projectId);
  const s = useAutosave({
    serverText: task.note,
    serverVersion: task.version,
    save: (note, version) => save(task.id, note, version),
    fromConflict: (cur) => {
      const c = cur as TaskRow;
      return { text: c.note, version: c.version, savedAt: c.updatedAt };
    },
  });
  return (
    <NotesField
      s={s}
      placeholder={t.tasks.notePlaceholder}
      className="min-h-16"
      heading={(id, state) => (
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={id} className="text-xs text-muted-foreground">
            {t.tasks.note}
          </label>
          {state}
        </div>
      )}
    />
  );
}
