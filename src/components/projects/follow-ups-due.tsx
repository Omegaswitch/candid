"use client";

import { Check, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompleteFollowUp, useDueFollowUps } from "@/hooks/calendar";
import { fmt, plural, t } from "@/i18n";
import { daysBetween, formatDay, todayLocal } from "@/lib/dates";

const c = t.calendar.due;

/**
 * "Contact today": client follow-ups due today or overdue, with a one-click "Done". Renders nothing
 * while loading or when nobody needs a call, so the page header stays as quiet as it was.
 */
export function FollowUpsDue({ onOpen }: { onOpen: (projectId: string) => void }) {
  const q = useDueFollowUps();
  const done = useCompleteFollowUp();
  const today = todayLocal();
  const items = q.data;
  if (!items?.length) return null;
  return (
    <section aria-labelledby="follow-ups-h" className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <PhoneCall aria-hidden className="size-4 text-muted-foreground" />
        <h2 id="follow-ups-h" className="text-sm font-medium">
          {c.title}
        </h2>
        <span className="num text-xs text-muted-foreground">{items.length}</span>
      </div>
      <ul>
        {items.map((f) => {
          const late = daysBetween(f.followUpOn, today);
          return (
            <li key={f.projectId} className="flex min-h-12 items-center gap-3 border-b px-4 py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onOpen(f.projectId)}
                  aria-label={fmt(c.open, { name: f.name })}
                  className="block max-w-full truncate rounded-sm text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {f.name}
                </button>
                <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  {f.client && <span className="truncate">{f.client}</span>}
                  {f.client && f.followUpNote && <span aria-hidden>·</span>}
                  {f.followUpNote && <span className="truncate">{f.followUpNote}</span>}
                </div>
              </div>
              <span className={late > 0 ? "num flex-none text-xs font-medium text-negative" : "num flex-none text-xs text-muted-foreground"} title={formatDay(f.followUpOn, today) ?? undefined}>
                {late > 0 ? plural(late, c.late) : c.today}
              </span>
              <Button size="sm" variant="outline" aria-label={fmt(c.doneLabel, { name: f.name })} disabled={done.isPending && done.variables?.projectId === f.projectId} onClick={() => done.mutate({ projectId: f.projectId, name: f.name })}>
                <Check /> {c.done}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
