"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDuplicateProject } from "@/hooks/projects";
import { fmt, t } from "@/i18n";
import type { ProjectSummary } from "@/server/projects";

const d = t.projects.duplicate;

export function DuplicateDialog({ project, onClose }: { project: ProjectSummary | null; onClose: () => void }) {
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>{project && <DuplicateForm key={project.id} project={project} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function DuplicateForm({ project, onClose }: { project: ProjectSummary; onClose: () => void }) {
  const dup = useDuplicateProject();
  const [name, setName] = useState(fmt(d.nameDefault, { name: project.name }));
  const [includeNotes, setNotes] = useState(true);
  const [includeDates, setDates] = useState(false);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        dup.mutate({ id: project.id, name: name.trim(), includeNotes, includeDates }, { onSuccess: onClose });
      }}
    >
      <DialogHeader>
        <DialogTitle>{d.title}</DialogTitle>
        <DialogDescription>{d.body}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="dup-name">{d.name}</Label>
        <Input id="dup-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="dup-notes" className="font-normal">
          {d.includeNotes}
        </Label>
        <Switch id="dup-notes" checked={includeNotes} onCheckedChange={setNotes} />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="dup-dates" className="font-normal">
          {d.includeDates}
        </Label>
        <Switch id="dup-dates" checked={includeDates} onCheckedChange={setDates} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={dup.isPending}>
          {d.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}
