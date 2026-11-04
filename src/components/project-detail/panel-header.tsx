"use client";

import { Archive, ArchiveRestore, Copy, Link2, MoreHorizontal, Pin, PinOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorText, type ProjectDetail, type ProjectPatch, type useProjectActions } from "@/hooks/project-detail";
import { fmt, t } from "@/i18n";
import { dueState, formatInstant } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { DateInput, ghostControl, MemberSelect } from "./fields";
import { InlineText } from "./inline-text";

const p = t.tasks.panel;
type Actions = ReturnType<typeof useProjectActions>;

function DuplicateDialog({ name, open, onOpenChange, actions }: { name: string; open: boolean; onOpenChange: (o: boolean) => void; actions: Actions }) {
  const router = useRouter();
  const id = useId();
  const [copyName, setCopyName] = useState(() => fmt(p.copySuffix, { name }));
  const [includeNotes, setIncludeNotes] = useState(true);
  const [includeDates, setIncludeDates] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await actions.duplicate({ name: copyName.trim(), includeNotes, includeDates });
      onOpenChange(false);
      toast(fmt(p.duplicated, { name: created.name }), { action: { label: p.open, onClick: () => router.push(`/projects/${created.id}`) } });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{p.duplicateTitle}</DialogTitle>
            <DialogDescription>{p.duplicateDescription}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor={`${id}-n`}>{p.duplicateName}</Label>
            <Input id={`${id}-n`} value={copyName} onChange={(e) => setCopyName(e.target.value)} maxLength={200} required />
          </div>
          <div className="grid gap-3">
            <Label className="font-normal">
              <Checkbox checked={includeNotes} onCheckedChange={(v) => setIncludeNotes(v === true)} />
              {p.includeNotes}
            </Label>
            <Label className="font-normal">
              <Checkbox checked={includeDates} onCheckedChange={(v) => setIncludeDates(v === true)} />
              {p.includeDates}
            </Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={busy || !copyName.trim()}>
              {p.duplicateAction}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProjectMenu({ data, actions }: { data: ProjectDetail; actions: Actions }) {
  const [dupOpen, setDupOpen] = useState(false);
  const archived = !!data.project.archivedAt;
  const copyLink = () =>
    navigator.clipboard
      .writeText(`${window.location.origin}/projects/${data.project.id}`)
      .then(() => toast(p.linkCopied))
      .catch(() => toast.error(p.linkNotCopied));
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={p.menu}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => actions.pin(!data.pinned)}>
            {data.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />} {data.pinned ? p.unpin : p.pin}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDupOpen(true)}>
            <Copy aria-hidden /> {p.duplicate}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copyLink}>
            <Link2 aria-hidden /> {p.copyLink}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => actions.archive(!archived)}>
            {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />} {archived ? p.restore : p.archive}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dupOpen && <DuplicateDialog name={data.project.name} open={dupOpen} onOpenChange={setDupOpen} actions={actions} />}
    </>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      <label htmlFor={htmlFor} className="text-sm text-muted-foreground">
        {label}
      </label>
      <div className="-ml-2 min-w-0">{children}</div>
    </div>
  );
}

export function PanelHeader({ data, actions }: { data: ProjectDetail; actions: Actions }) {
  const id = useId();
  const pr = data.project;
  const save = (patch: ProjectPatch) => actions.save(patch);
  const overdue = pr.status !== "completed" && dueState(pr.dueDate) === "overdue";

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-2 pr-10">
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="text-lg leading-snug font-semibold break-words">
            <InlineText value={pr.name} onSave={(name) => save({ name })} label={p.nameLabel} editLabel={`${p.editName}: ${pr.name}`} inputClassName="text-lg font-semibold">
              {pr.name}
            </InlineText>
          </h2>
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <InlineText
              value={pr.client ?? ""}
              allowEmpty
              onSave={(client) => save({ client: client || null })}
              label={p.client}
              editLabel={`${p.client}: ${pr.client ?? t.common.none}`}
              placeholder={p.clientPlaceholder}
            >
              {pr.client || <span className="text-muted-foreground">{p.clientPlaceholder}</span>}
            </InlineText>
            {pr.archivedAt && <span className="flex-none rounded-full bg-pill-neutral px-2 py-0.5 text-xs font-medium text-pill-neutral-ink">{p.archived}</span>}
          </div>
        </div>
        <div className="flex flex-none items-center gap-0.5">
          <ProjectMenu data={data} actions={actions} />
        </div>
      </div>

      {actions.conflict && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-pill-warning px-3 py-2 text-sm text-pill-warning-ink">
          <span className="min-w-0 flex-1">{p.conflictNotice}</span>
          <Button size="sm" variant="outline" onClick={() => actions.save(actions.conflict!)}>
            {p.reapply}
          </Button>
          <Button size="sm" variant="ghost" onClick={actions.dismissConflict}>
            {p.dismiss}
          </Button>
        </div>
      )}

      <div className="grid gap-1">
        <Field label={p.owner} htmlFor={`${id}-o`}>
          <MemberSelect id={`${id}-o`} value={pr.ownerId} onChange={(ownerId) => save({ ownerId })} />
        </Field>
        <Field label={p.status} htmlFor={`${id}-s`}>
          <Select value={pr.status} onValueChange={(status) => save({ status: status as ProjectPatch["status"] })}>
            <SelectTrigger id={`${id}-s`} className={ghostControl}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["active", "waiting", "completed"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {p.statuses[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={p.priority} htmlFor={`${id}-p`}>
          <Select value={pr.priority} onValueChange={(priority) => save({ priority: priority as ProjectPatch["priority"] })}>
            <SelectTrigger id={`${id}-p`} className={ghostControl}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["normal", "high"] as const).map((s) => (
                <SelectItem key={s} value={s}>
                  {p.priorities[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={p.due} htmlFor={`${id}-d`}>
          <div className="flex items-center gap-2">
            <DateInput id={`${id}-d`} value={pr.dueDate} onChange={(dueDate) => save({ dueDate })} className={cn("max-w-44", overdue && "text-negative")} />
            {overdue && <span className="flex-none text-xs font-medium text-negative">{t.tasks.overdue}</span>}
          </div>
        </Field>
      </div>

      <p className="text-xs text-muted-foreground">
        {fmt(p.timestamps, { created: formatInstant(pr.createdAt), updated: formatInstant(pr.updatedAt) })}
      </p>
    </div>
  );
}
