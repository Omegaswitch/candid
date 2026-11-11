"use client";

import { Mail, Phone, PhoneCall, Users, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLogContact } from "@/hooks/calendar";
import type { ProjectPatch, ProjectRow } from "@/hooks/project-detail";
import { t } from "@/i18n";
import { todayLocal } from "@/lib/dates";
import type { ContactKind } from "@/server/follow-ups";
import { DateInput } from "./fields";
import { CommitInput } from "./inline-text";

const c = t.calendar;

export const CONTACT_ICONS = { call: Phone, email: Mail, meeting: Users } as const;

/** "Next contact": a date and a one-line reminder, both optional. Clearing the date clears the note too. */
export function FollowUpCard({ project, onSave }: { project: ProjectRow; onSave: (patch: ProjectPatch) => void }) {
  const on = project.followUpOn;
  return (
    <section className="grid gap-1.5">
      <h3 className="text-sm font-medium">{c.followUpBox.title}</h3>
      <div className="grid gap-0.5 rounded-lg border bg-card px-2 py-1.5">
        <div className="flex min-h-8 items-center gap-2 text-sm">
          <PhoneCall aria-hidden className="size-4 flex-none text-muted-foreground" />
          <DateInput value={on} onChange={(v) => onSave({ followUpOn: v })} label={c.followUpBox.date} className="max-w-44" />
          {on && (
            <Button variant="ghost" size="icon-sm" className="ml-auto flex-none text-muted-foreground" aria-label={c.followUpBox.clear} title={c.followUpBox.clear} onClick={() => onSave({ followUpOn: null })}>
              <X />
            </Button>
          )}
        </div>
        {on && (
          <div className="flex min-h-8 items-center gap-2 pl-6">
            <CommitInput
              value={project.followUpNote ?? ""}
              allowEmpty
              passCleanEscape
              maxLength={300}
              aria-label={c.followUpBox.note}
              placeholder={c.followUpBox.notePlaceholder}
              onCommit={(v) => onSave({ followUpNote: v || null })}
              className="h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent"
            />
          </div>
        )}
      </div>
    </section>
  );
}

/** One-line contact log: what kind, what came of it, optionally when to follow up. Lands in the history. */
export function ContactLog({ projectId }: { projectId: string }) {
  const log = useLogContact(projectId);
  const [kind, setKind] = useState<ContactKind>("call");
  const [outcome, setOutcome] = useState("");
  const [next, setNext] = useState("");
  const submit = () => {
    if (log.isPending) return;
    log.mutate(
      { kind, outcome: outcome.trim(), followUpOn: next || null },
      {
        onSuccess: () => {
          setOutcome("");
          setNext("");
        },
      },
    );
  };
  return (
    <section className="grid gap-1.5">
      <h3 className="text-sm font-medium">{c.contact.title}</h3>
      <form
        className="grid gap-2 rounded-lg border bg-card p-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <ToggleGroup type="single" variant="outline" spacing={0} value={kind} onValueChange={(v) => v && setKind(v as ContactKind)} aria-label={c.contact.kind} className="w-full">
          {(["call", "email", "meeting"] as const).map((k) => {
            const Icon = CONTACT_ICONS[k];
            return (
              <ToggleGroupItem key={k} value={k} className="flex-1 gap-1.5">
                <Icon aria-hidden /> {c.contact[k]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <div className="flex gap-2">
          <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} maxLength={300} aria-label={c.contact.outcome} placeholder={c.contact.outcomePlaceholder} className="h-8 flex-1" />
          <Button type="submit" disabled={log.isPending}>
            {c.contact.save}
          </Button>
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex-none">{c.contact.followUpOn}</span>
          <Input type="date" value={next} min={todayLocal()} onChange={(e) => setNext(e.target.value)} aria-label={c.contact.followUpHint} className="num h-8 max-w-40 dark:scheme-dark" />
        </label>
      </form>
    </section>
  );
}
