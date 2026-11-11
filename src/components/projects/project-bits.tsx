"use client";

import { ArrowUp, CircleAlert, CircleCheck, Clock, Hourglass } from "lucide-react";
import Link from "next/link";
import { fmt, t } from "@/i18n";
import { dueState, formatDay, todayLocal } from "@/lib/dates";
import { clientHref } from "@/lib/clients";
import { daysSince, IDLE_DAYS, idleDays } from "@/lib/insight";
import { initials } from "@/lib/people";
import { cn } from "@/lib/utils";
import { labelClass } from "@/hooks/labels";
import type { Label } from "@/server/labels";
import type { ProjectSummary } from "@/server/projects";

/** Status always carries its word; the tint only repeats it. */
export function StatusPill({ status, className }: { status: ProjectSummary["status"]; className?: string }) {
  const Icon = status === "waiting" ? Hourglass : status === "completed" ? CircleCheck : null;
  return (
    <span
      className={cn(
        "inline-flex h-5 flex-none items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-medium",
        status === "waiting" && "bg-pill-warning text-pill-warning-ink",
        status === "completed" && "bg-pill-positive text-pill-positive-ink",
        status === "active" && "bg-pill-neutral text-pill-neutral-ink",
        className,
      )}
    >
      {Icon && <Icon className="size-3" aria-hidden />}
      {t.projects.status[status]}
    </span>
  );
}

export function HighPriority({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex flex-none items-center gap-0.5 whitespace-nowrap text-xs font-medium", className)}>
      <ArrowUp className="size-3" aria-hidden />
      {t.projects.priority.high}
      <span className="sr-only"> {t.projects.highPriority}</span>
    </span>
  );
}

/** A deadline in words. Overdue is red with an icon; done work is never overdue. */
export function DueLabel({
  date,
  done = false,
  today = todayLocal(),
  bare = false,
  className,
}: {
  date: string | null;
  done?: boolean;
  today?: string;
  /** Just the date, without "Due". */
  bare?: boolean;
  className?: string;
}) {
  if (!date) return <span className={cn("text-muted-foreground", className)}>{bare ? t.common.none : t.projects.noDue}</span>;
  const state = done ? "later" : dueState(date, today);
  const day = formatDay(date, today)!;
  if (state === "overdue")
    return (
      <span className={cn("inline-flex items-center gap-1 whitespace-nowrap font-medium text-negative", className)}>
        <CircleAlert className="size-3.5" aria-hidden />
        {fmt(t.projects.overdueSince, { date: day })}
      </span>
    );
  if (state === "today") return <span className={cn("whitespace-nowrap font-medium", className)}>{t.projects.dueToday}</span>;
  return (
    <span className={cn("num whitespace-nowrap", state === "soon" ? "text-foreground" : "text-muted-foreground", className)}>
      {bare ? day : fmt(t.projects.due, { date: day })}
    </span>
  );
}

export function Initials({ name, className }: { name: string | null | undefined; className?: string }) {
  if (!name) return <span className={cn("text-xs text-muted-foreground", className)}>{t.common.none}</span>;
  return (
    <span
      title={name}
      className={cn(
        "inline-flex size-6 flex-none items-center justify-center rounded-full bg-raised text-[11px] font-medium text-foreground",
        className,
      )}
    >
      <span aria-hidden>{initials(name)}</span>
      <span className="sr-only">{name}</span>
    </span>
  );
}

/**
 * The signature element: one segment per task, done segments filled with the hue. Very long
 * checklists keep the same track but tighten the gaps so it never wraps.
 */
export function ChecklistTrack({ done, total, className }: { done: number; total: number; className?: string }) {
  if (total === 0) return <div className={cn("h-1.5 rounded-sm border border-dashed border-border", className)} aria-hidden />;
  const label = fmt(t.projects.checklist, { done, total });
  if (total > 60) {
    return (
      <div role="img" aria-label={label} className={cn("h-1.5 overflow-hidden rounded-sm bg-raised", className)}>
        <div className="h-full bg-hue" style={{ width: `${(done / total) * 100}%` }} />
      </div>
    );
  }
  return (
    <div role="img" aria-label={label} className={cn("flex h-1.5", total > 24 ? "gap-px" : "gap-0.5", className)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn("min-w-0 flex-1 rounded-[2px]", i < done ? "bg-hue" : "bg-raised")} />
      ))}
    </div>
  );
}

/** Small coloured chips for a project's labels; nothing when there are none. */
export function LabelChips({ labels, className }: { labels: Label[]; className?: string }) {
  if (!labels.length) return null;
  return (
    <ul aria-label={t.projects.labels.title} className={cn("flex min-w-0 flex-wrap gap-1", className)}>
      {labels.map((l) => (
        <li key={l.id} className={cn("inline-flex h-5 max-w-40 items-center truncate rounded-full px-2 text-xs font-medium", labelClass[l.color])}>
          <span className="truncate">{l.name}</span>
        </li>
      ))}
    </ul>
  );
}

/** "12 d in Waiting": how long the project has been in its current status. Quiet text, never a badge. */
export function StatusAge({ p, short, className }: { p: Pick<ProjectSummary, "status" | "statusSince">; short?: boolean; className?: string }) {
  const n = daysSince(p.statusSince);
  return (
    <span className={cn("num whitespace-nowrap text-muted-foreground", className)}>
      {short ? fmt(t.projects.statusDaysShort, { n }) : fmt(t.projects.statusFor, { n, status: t.projects.status[p.status] })}
    </span>
  );
}

/** "Idle 16 d": an active or waiting project nobody has touched for IDLE_DAYS or more. Word plus icon, warning tint. */
export function IdleBadge({ p, className }: { p: Pick<ProjectSummary, "status" | "lastActivityAt">; className?: string }) {
  const days = idleDays(p);
  if (days === null) return null;
  return (
    <span
      title={fmt(t.projects.idleHint, { n: IDLE_DAYS })}
      className={cn("inline-flex h-5 flex-none items-center gap-1 whitespace-nowrap rounded-full border border-warning/30 px-1.5 text-xs font-medium text-warning", className)}
    >
      <Clock className="size-3" aria-hidden />
      {fmt(t.projects.idle, { n: days })}
    </span>
  );
}

/** The client's name as a link to its page; "—" when there is none. Sits above a card's stretched link. */
export function ClientLink({ name, className }: { name: string | null; className?: string }) {
  if (!name?.trim()) return <span className={className}>{t.common.none}</span>;
  return (
    <Link href={clientHref(name)} className={cn("relative z-10 rounded-sm hover:text-foreground hover:underline focus-visible:underline focus-visible:outline-none", className)}>
      {name}
    </Link>
  );
}
