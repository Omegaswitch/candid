"use client";

import { ArrowRight, CircleAlert, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt, plural, t } from "@/i18n";
import type { FieldDiff, ImportMode, ImportPlan, ImportResult, PlanAction, PlannedProject, RowIssue } from "@/lib/import/types";
import { cn } from "@/lib/utils";

const s = t.importExport;
const PAGE = 300;

const ACTION_PILL: Record<PlanAction, string> = {
  create: "bg-pill-positive text-pill-positive-ink",
  update: "bg-pill-hue text-pill-hue-ink",
  unchanged: "bg-pill-neutral text-pill-neutral-ink",
  skip: "bg-pill-neutral text-muted-foreground line-through",
};
const SEVERITY_PILL: Record<RowIssue["severity"], string> = {
  error: "bg-pill-negative text-pill-negative-ink",
  warning: "bg-pill-warning text-pill-warning-ink",
  duplicate: "bg-pill-warning text-pill-warning-ink",
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-xs font-medium", className)}>{children}</span>;
}

function Summary({ plan }: { plan: ImportPlan }) {
  const c = plan.counts;
  const r = s.review;
  const parts = [
    c.projectsCreate && plural(c.projectsCreate, r.projectsCreate),
    c.projectsUpdate && plural(c.projectsUpdate, r.projectsUpdate),
    c.tasksCreate && plural(c.tasksCreate, r.tasksCreate),
    c.tasksUpdate && plural(c.tasksUpdate, r.tasksUpdate),
    c.unchanged && plural(c.unchanged, r.unchanged),
    c.skipped && plural(c.skipped, r.skipped),
  ].filter(Boolean);
  return (
    <div className="grid gap-1">
      <p className="num text-sm">{parts.join(" · ") || r.nothingToImport}</p>
      {(c.errors > 0 || c.warnings > 0) && (
        <p className="num flex flex-wrap gap-x-3 text-xs">
          {c.errors > 0 && (
            <span className="inline-flex items-center gap-1 text-negative">
              <CircleAlert className="size-3.5" aria-hidden />
              {plural(c.errors, r.errors)}
            </span>
          )}
          {c.warnings > 0 && (
            <span className="inline-flex items-center gap-1 text-warning">
              <TriangleAlert className="size-3.5" aria-hidden />
              {plural(c.warnings, r.warnings)}
            </span>
          )}
        </p>
      )}
    </div>
  );
}

function Diffs({ diffs, create }: { diffs: FieldDiff[]; create: boolean }) {
  if (!diffs.length) return null;
  return (
    <ul className="mt-1 grid gap-0.5 text-xs">
      {diffs.map((d) => (
        <li key={d.field} className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
          <span className="text-muted-foreground">{s.fields[d.field]}:</span>
          {!create && (
            <>
              <span className="break-all text-muted-foreground line-through">{d.from ?? s.review.empty}</span>
              <ArrowRight className="size-3 self-center text-muted-foreground" aria-label={s.review.changedTo} />
            </>
          )}
          <span className="break-all">{d.to ?? s.review.empty}</span>
        </li>
      ))}
    </ul>
  );
}

type Filter = "all" | "changes" | "issues";

export function ReviewStep(props: {
  plan: ImportPlan | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  skipRows: number[];
  acceptDuplicates: number[];
  onSkip: (row: number, on: boolean) => void;
  onAccept: (row: number, on: boolean) => void;
}) {
  const { plan } = props;
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);
  const issuesByRow = useMemo(() => {
    const m = new Map<number, RowIssue[]>();
    for (const i of plan?.issues ?? []) m.set(i.row, [...(m.get(i.row) ?? []), i]);
    return m;
  }, [plan]);

  if (props.error) {
    return (
      <div className="grid justify-items-start gap-3 rounded-lg border p-4">
        <p className="text-sm text-negative">{props.error}</p>
        <Button variant="outline" onClick={props.onRetry}>
          {t.common.retry}
        </Button>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="grid gap-4" aria-busy>
        <span className="sr-only">{s.review.loading}</span>
        <div className="flex h-5 items-center"><Skeleton className="h-3.5 w-72" /></div>
        <div className="flex gap-1.5">
          {(["all", "changes", "issues"] as const).map((f) => (
            <span key={f} className="flex h-7 items-center rounded-full border px-3 text-xs text-muted-foreground">{s.review.filters[f]}</span>
          ))}
        </div>
        <div className="grid gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="overflow-hidden rounded-lg border bg-card">
              <div className="flex items-start gap-2 border-b bg-muted/40 px-3 py-2">
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex h-5 items-center"><Skeleton className="h-3.5 w-1/3" /></div>
                  <div className="flex h-4 items-center"><Skeleton className="h-3 w-1/4" /></div>
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              {[0, 1].map((j) => (
                <div key={j} className="flex h-10 items-center gap-2 border-t px-3 first:border-t-0">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className={`h-3.5 ${j ? "w-1/2" : "w-2/3"}`} />
                  <Skeleton className="ml-auto h-5 w-14 rounded-full" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const changed = (p: PlannedProject) => p.action === "create" || p.action === "update" || p.tasks.some((x) => x.action === "create" || x.action === "update");
  const shown = filter === "changes" ? plan.projects.filter(changed) : plan.projects;
  let budget = limit;
  const visible = shown.filter(() => budget-- > 0);

  return (
    <div className={cn("grid gap-4 transition-opacity duration-150", props.loading && "opacity-60")} aria-busy={props.loading}>
      <Summary plan={plan} />
      <div role="radiogroup" aria-label={s.review.issuesTitle} className="flex flex-wrap gap-1.5">
        {(["all", "changes", "issues"] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={filter === f}
            onClick={() => setFilter(f)}
            className={cn(
              "num h-7 rounded-full border px-3 text-xs outline-none transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50",
              filter === f ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
            )}
          >
            {s.review.filters[f]}
            {f === "issues" && plan.issues.length > 0 && ` (${plan.issues.length})`}
          </button>
        ))}
      </div>

      {filter === "issues" ? (
        <IssueList issues={plan.issues} {...props} />
      ) : !visible.length ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">{s.review.nothing}</p>
      ) : (
        <div className="grid gap-3">
          {visible.map((p) => (
            <section key={p.key} className="overflow-hidden rounded-lg border bg-card" aria-label={p.name}>
              <header className="flex items-start gap-2 border-b bg-muted/40 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{p.name || s.review.empty}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.client ?? s.review.noClient} · {fmt(s.review.row, { row: p.firstRow })}
                  </p>
                  <Diffs diffs={p.diffs} create={p.action === "create"} />
                </div>
                <Pill className={ACTION_PILL[p.action]}>{s.review.actions[p.action]}</Pill>
              </header>
              {p.tasks.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">{s.review.projectOnly}</p>
              ) : (
                <ul>
                  {p.tasks
                    .filter((x) => filter !== "changes" || x.action === "create" || x.action === "update")
                    .map((x) => (
                      <li key={x.row} className="flex items-start gap-2 border-t px-3 py-2 first:border-t-0">
                        <span className="num w-14 shrink-0 pt-0.5 text-xs text-muted-foreground">{fmt(s.review.row, { row: x.row })}</span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("break-words", x.action === "skip" && "text-muted-foreground")}>{x.title}</p>
                          <Diffs diffs={x.diffs} create={x.action === "create"} />
                          {(issuesByRow.get(x.row) ?? []).map((i, n) => (
                            <p key={n} className={cn("mt-0.5 text-xs", i.severity === "error" ? "text-negative" : "text-warning")}>
                              {i.message}
                            </p>
                          ))}
                        </div>
                        <Pill className={ACTION_PILL[x.action]}>{s.review.actions[x.action]}</Pill>
                      </li>
                    ))}
                </ul>
              )}
            </section>
          ))}
          {shown.length > visible.length && (
            <Button variant="outline" onClick={() => setLimit((n) => n + PAGE)} className="justify-self-start">
              {plural(shown.length - visible.length, s.review.showMore)}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function IssueList(props: {
  issues: RowIssue[];
  skipRows: number[];
  acceptDuplicates: number[];
  onSkip: (row: number, on: boolean) => void;
  onAccept: (row: number, on: boolean) => void;
}) {
  const r = s.review;
  if (!props.issues.length) return <p className="rounded-lg border p-4 text-sm text-muted-foreground">{r.noIssues}</p>;
  const action = (i: RowIssue) => {
    if (i.code === "skippedByUser") return { label: r.includeRow, run: () => props.onSkip(i.row, false) };
    if (i.severity === "duplicate") {
      const accepted = props.acceptDuplicates.includes(i.row);
      return accepted ? { label: r.dontCreate, run: () => props.onAccept(i.row, false) } : { label: r.createAnyway, run: () => props.onAccept(i.row, true) };
    }
    if (i.severity === "warning" && !i.skipped) return { label: r.skipRow, run: () => props.onSkip(i.row, true) };
    return null;
  };
  return (
    <ul className="divide-y overflow-hidden rounded-lg border bg-card">
      {props.issues.map((i, n) => {
        const a = action(i);
        return (
          <li key={`${i.row}-${i.code}-${n}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
            <span className="num w-14 shrink-0 text-xs text-muted-foreground">{fmt(r.row, { row: i.row })}</span>
            <Pill className={SEVERITY_PILL[i.severity]}>{r.severity[i.severity]}</Pill>
            <span className="min-w-0 flex-1 basis-60 text-sm break-words">{i.message}</span>
            {a && (
              <Button variant="outline" size="sm" onClick={a.run}>
                {a.label}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function ConfirmStep({ plan, label, mode, error }: { plan: ImportPlan; label: string; mode: ImportMode; error: string | null }) {
  return (
    <div className="grid max-w-xl gap-4">
      <h3 className="font-medium">{s.confirm.title}</h3>
      <Summary plan={plan} />
      <dl className="grid gap-1 text-sm text-muted-foreground">
        <dd>{fmt(s.confirm.source, { label })}</dd>
        <dd>{fmt(s.confirm.mode, { mode: mode === "create" ? s.mode.create : s.mode.update })}</dd>
      </dl>
      <p className="text-sm">{s.confirm.body}</p>
      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

export function ResultStep({ result }: { result: ImportResult }) {
  const r = s.result;
  const pt = (c: { projects: number; tasks: number }) => fmt(r.projectsTasks, { projects: plural(c.projects, r.projects), tasks: plural(c.tasks, r.tasks) });
  const tiles = [
    { label: r.created, value: pt(result.created) },
    { label: r.updated, value: pt(result.updated) },
    { label: r.skipped, value: plural(result.skipped, r.rows) },
    { label: r.failed, value: plural(result.failed, r.rows), bad: result.failed > 0 },
  ];
  return (
    <div className="grid gap-4">
      <h3 className="font-medium">{r.title}</h3>
      {result.replayed && <p className="text-sm text-muted-foreground">{r.replayed}</p>}
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((x) => (
          <div key={x.label} className="rounded-lg border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{x.label}</dt>
            <dd className={cn("num mt-1 text-sm font-medium", x.bad && "text-negative")}>{x.value}</dd>
          </div>
        ))}
      </dl>
      {result.rowErrors.length > 0 && (
        <section className="grid gap-2">
          <h4 className="text-sm font-medium">{r.rowErrors}</h4>
          <ul className="divide-y overflow-hidden rounded-lg border bg-card text-sm">
            {result.rowErrors.map((e, i) => (
              <li key={i} className="flex gap-3 px-3 py-2">
                <span className="num w-14 shrink-0 text-xs text-muted-foreground">{fmt(s.review.row, { row: e.row })}</span>
                <span className="min-w-0 break-words">{e.message}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
