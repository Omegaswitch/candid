"use client";

import { useState, type ReactNode } from "react";
import Counter from "@/components/Counter";
import CountUp from "@/components/CountUp";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalytics } from "@/hooks/analytics";
import { t } from "@/i18n";
import { formatDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Analytics } from "@/server/analytics";

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

const KEYFRAMES = `@keyframes grow-x{from{transform:scaleX(0)}}@keyframes grow-y{from{transform:scaleY(0)}}`;

export function AnalyticsView() {
  const s = t.analytics;
  const q = useAnalytics();
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <style>{KEYFRAMES}</style>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.subline}</p>
      </header>
      {q.isError ? (
        <div className="flex items-center gap-3 rounded-lg border p-4 text-sm">
          {s.failed}
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            {s.retry}
          </Button>
        </div>
      ) : (
        <Body data={q.data} />
      )}
    </div>
  );
}

function Body({ data }: { data: Analytics | undefined }) {
  const s = t.analytics;
  return (
    <>
      {/* Ledger strip: one ruled row of headline numbers. */}
      <section className="grid grid-cols-2 border-y sm:grid-cols-4 [&>*]:border-b sm:[&>*]:border-b-0 [&>*:not(:last-child)]:sm:border-r [&>*:nth-child(odd)]:border-r">
        <Kpi label={s.projects} hint={data && `${s.active} · ${s.waiting} · ${s.completed}`}>
          {data ? <Counter value={data.projects.active + data.projects.waiting + data.projects.completed} fontSize="inherit" intro={false} motionBlur={false} fade={0} /> : null}
        </Kpi>
        <Kpi label={s.avgCompletion} hint={s.avgCompletionHint}>
          {data ? data.avgCompletion === null ? "—" : <CountUp to={data.avgCompletion} suffix="%" trigger="load" /> : null}
        </Kpi>
        <Kpi label={s.overdue} hint={s.overdueHint} negative={!!data?.overdue}>
          {data ? <Counter value={data.overdue} fontSize="inherit" intro={false} motionBlur={false} fade={0} /> : null}
        </Kpi>
        <Kpi label={s.onTime} hint={data && (data.onTime.total ? fill(s.onTimeHint, { onTime: data.onTime.onTime, total: data.onTime.total }) : s.noData)}>
          {data ? data.onTime.rate === null ? "—" : <CountUp to={data.onTime.rate} suffix="%" trigger="load" /> : null}
        </Kpi>
      </section>

      <StatusBar data={data} />

      <Panel title={s.weekly} hint={s.weeklyHint}>
        {data ? <WeeklyChart weeks={data.weekly} /> : <Skeleton className="h-44 w-full" />}
      </Panel>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title={s.topClients} hint={s.topClientsHint}>
          {data ? (
            <RankList empty={s.noClients} rows={data.topClients.map((c) => ({ key: c.client, label: c.client, value: c.count }))} />
          ) : (
            <ListSkeleton />
          )}
        </Panel>
        <Panel title={s.busiest} hint={s.busiestHint}>
          {data ? (
            <RankList
              empty={s.noBusy}
              rows={data.busiest.map((m) => ({
                key: m.id,
                label: m.name,
                value: m.open,
                note: m.overdue ? `${m.overdue} ${s.overdueShort}` : undefined,
              }))}
            />
          ) : (
            <ListSkeleton />
          )}
        </Panel>
      </div>
    </>
  );
}

function Kpi({ label, hint, negative, children }: { label: string; hint?: string | false; negative?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 px-4 py-5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className={cn("num text-4xl font-semibold leading-none tracking-tight", negative && "text-negative")}>
        {children ?? <Skeleton className="h-9 w-16" />}
      </span>
      <span className="min-h-4 truncate text-xs text-muted-foreground">{hint || " "}</span>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 border-b pb-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      {children}
    </section>
  );
}

/** One stacked bar for project status: solid, mid and hairline tones of the foreground. */
function StatusBar({ data }: { data: Analytics | undefined }) {
  const s = t.analytics;
  if (!data) return <Skeleton className="h-2 w-full" />;
  const p = data.projects;
  const total = p.active + p.waiting + p.completed;
  const parts = [
    { key: "active", label: s.active, value: p.active, cls: "bg-foreground" },
    { key: "waiting", label: s.waiting, value: p.waiting, cls: "bg-foreground/45" },
    { key: "completed", label: s.completed, value: p.completed, cls: "bg-foreground/15" },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={parts.map((x) => `${x.label} ${x.value}`).join(", ")}>
        {total > 0 &&
          parts.map((x) =>
            x.value ? (
              <div
                key={x.key}
                className={cn("h-full origin-left animate-[grow-x_700ms_cubic-bezier(.2,.7,.2,1)_both] motion-reduce:animate-none", x.cls)}
                style={{ width: `${(x.value / total) * 100}%` }}
              />
            ) : null,
          )}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        {parts.map((x) => (
          <li key={x.key} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", x.cls)} aria-hidden />
            <span className="text-muted-foreground">{x.label}</span>
            <span className="num font-medium">{x.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Hand-rolled SVG bars; the current week is solid, the rest are a muted tone. */
function WeeklyChart({ weeks }: { weeks: Analytics["weekly"] }) {
  const s = t.analytics;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...weeks.map((w) => w.count));
  const H = 140;
  const W = 600;
  const gap = 10;
  const bw = (W - gap * (weeks.length - 1)) / weeks.length;
  const shown = hover ?? weeks.length - 1;
  const cur = weeks[shown];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="num text-2xl font-semibold leading-none">{cur?.count ?? 0}</span>
        <span className="text-muted-foreground">{hover === null || hover === weeks.length - 1 ? s.thisWeek : formatDay(cur?.week)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="h-auto w-full overflow-visible" role="img" aria-label={s.weekly} onMouseLeave={() => setHover(null)}>
        {[0.5, 1].map((f) => (
          <line key={f} x1={0} x2={W} y1={H - H * f} y2={H - H * f} className="stroke-border" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-border" vectorEffect="non-scaling-stroke" />
        {weeks.map((w, i) => {
          const h = w.count ? Math.max(3, (w.count / max) * H) : 0;
          const x = i * (bw + gap);
          const active = i === shown;
          return (
            <g key={w.week} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} className="outline-none">
              <title>{fill(s.weekOf, { date: formatDay(w.week) ?? w.week, count: w.count })}</title>
              <rect x={x} y={0} width={bw} height={H} fill="transparent" />
              <rect
                x={x}
                y={H - h}
                width={bw}
                height={h}
                rx={3}
                className={cn(
                  "origin-bottom transition-colors [transform-box:fill-box] animate-[grow-y_600ms_cubic-bezier(.2,.7,.2,1)_both] motion-reduce:animate-none",
                  active ? "fill-foreground" : "fill-foreground/20",
                )}
                style={{ animationDelay: `${i * 35}ms` }}
              />
              {(i === 0 || i === weeks.length - 1 || i === Math.floor(weeks.length / 2)) && (
                <text x={x + bw / 2} y={H + 15} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {formatDay(w.week)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RankList({ rows, empty }: { rows: { key: string; label: string; value: number; note?: string }[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value));
  return (
    <ol className="flex flex-col">
      {rows.map((r, i) => (
        <li key={r.key} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-x-3 border-b py-2.5 last:border-b-0">
          <span className="num text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="truncate text-sm">{r.label}</span>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full origin-left rounded-full bg-foreground/70 animate-[grow-x_700ms_cubic-bezier(.2,.7,.2,1)_both] motion-reduce:animate-none"
                style={{ width: `${(r.value / max) * 100}%`, animationDelay: `${i * 60}ms` }}
              />
            </div>
          </div>
          <span className="flex items-baseline gap-2 text-right">
            {r.note && <span className="text-xs text-negative">{r.note}</span>}
            <span className="num text-sm font-semibold">{r.value}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
