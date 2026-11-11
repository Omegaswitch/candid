"use client";

import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjectActivity } from "@/hooks/project-detail";
import { fmt, plural, t } from "@/i18n";
import { formatDay, formatInstant, formatRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/server/activity-read";
import { CONTACT_ICONS } from "./follow-up";

const a = t.tasks.activity;

function describeEvent(e: ActivityItem) {
  const actor = e.actorName ?? a.someone;
  const d = (e.data ?? {}) as Record<string, unknown>;
  const vars = { actor, title: String(d.title ?? ""), from: String(d.from ?? ""), to: String(d.to ?? ""), date: typeof d.on === "string" ? (formatDay(d.on) ?? "") : "" };
  if (e.entityType === "project") {
    if (e.action === "contact_logged") return fmt(t.calendar.contact.logged[contactKind(d)], { actor });
    if (e.action === "status_changed") {
      const to = t.tasks.panel.statuses[d.to as keyof typeof t.tasks.panel.statuses] ?? vars.to;
      return fmt(a.project.status_changed, { actor, to: to.toLowerCase() });
    }
    const s = a.project[e.action as keyof typeof a.project];
    if (s) return fmt(s, vars);
  }
  if (e.entityType === "task") {
    if (e.action === "bulk_updated") return fmt(plural(Number(d.count ?? 0), a.bulk), { actor });
    const s = a.task[e.action as keyof typeof a.task];
    if (s) return fmt(s, vars);
  }
  if (e.entityType === "document") return fmt(a.document, vars);
  return fmt(a.other, vars);
}

const contactKind = (d: Record<string, unknown>): keyof typeof CONTACT_ICONS => (d.kind === "email" || d.kind === "meeting" ? d.kind : "call");

function ContactIcon({ e }: { e: ActivityItem }) {
  const Icon = CONTACT_ICONS[contactKind((e.data ?? {}) as Record<string, unknown>)];
  return <Icon aria-hidden className="mt-0.5 size-4 flex-none text-muted-foreground" />;
}

/** The outcome typed with a logged contact, and the icon of its kind. */
function ContactDetail({ e }: { e: ActivityItem }) {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const outcome = typeof d.outcome === "string" ? d.outcome : "";
  return outcome ? <span className="pl-[22px] text-sm break-words text-muted-foreground">{outcome}</span> : null;
}

/** Autosave writes one notes event per save; a run of them by one person reads as one. */
function collapse(events: ActivityItem[]) {
  return events.filter((e, i) => {
    const prev = events[i - 1];
    return !(prev && e.action === "notes_edited" && prev.action === "notes_edited" && prev.actorId === e.actorId);
  });
}

export function History({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const q = useProjectActivity(projectId, open);
  return (
    <section aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="-mx-1 flex items-center gap-1 rounded-md px-1 text-sm font-medium hover:bg-accent"
        >
          <ChevronRight aria-hidden className={cn("size-4 text-muted-foreground transition-transform duration-150", open && "rotate-90")} />
          {t.tasks.panel.history}
        </button>
      </h3>
      {open && (
        <div id={id} className="mt-2">
          {q.isPending ? (
            <ul className="grid gap-2.5" aria-busy aria-label={t.common.loading}>
              {[0, 1, 2].map((i) => (
                <li key={i} className="grid gap-0.5">
                  <div className="flex h-5 items-center"><Skeleton className="h-3.5 w-3/4" /></div>
                  <div className="flex h-4 items-center"><Skeleton className="h-3 w-20" /></div>
                </li>
              ))}
            </ul>
          ) : q.isError ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              {t.tasks.panel.historyError}
              <Button variant="link" size="xs" className="h-auto px-0" onClick={() => q.refetch()}>
                {t.common.retry}
              </Button>
            </p>
          ) : q.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.tasks.panel.historyEmpty}</p>
          ) : (
            <ol className="grid gap-2.5">
              {collapse(q.data).map((e) => (
                <li key={e.id} className="grid gap-0.5">
                  {e.action === "contact_logged" ? (
                    <span className="flex items-start gap-1.5 text-sm break-words">
                      <ContactIcon e={e} />
                      {describeEvent(e)}
                    </span>
                  ) : (
                    <span className="text-sm break-words">{describeEvent(e)}</span>
                  )}
                  {e.action === "contact_logged" && <ContactDetail e={e} />}
                  <time dateTime={e.createdAt} title={formatInstant(e.createdAt)} className="text-xs text-muted-foreground">
                    {formatRelative(e.createdAt)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
