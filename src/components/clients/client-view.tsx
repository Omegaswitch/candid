"use client";

import { Mail, Phone } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { BackButton } from "@/components/app/back-button";
import { Kpi, Panel } from "@/components/analytics/analytics-view";
import Counter from "@/components/Counter";
import CountUp from "@/components/CountUp";
import { DuplicateDialog } from "@/components/projects/duplicate-dialog";
import { ChecklistTrack, StatusPill } from "@/components/projects/project-bits";
import { type CardActions, openOnClick } from "@/components/projects/project-card";
import { ProjectSheet } from "@/components/projects/project-sheet";
import { ProjectTable } from "@/components/projects/project-table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useClient } from "@/hooks/clients";
import { useSetArchived, useSetPinned } from "@/hooks/projects";
import { useMembers } from "@/hooks/queries";
import { fmt, t } from "@/i18n";
import { ApiError } from "@/lib/api";
import { formatDay, todayLocal } from "@/lib/dates";
import type { ClientContact, ClientDetail } from "@/server/clients";
import type { ProjectSummary } from "@/server/projects";

const c = t.clients;

export function ClientView({ name }: { name: string }) {
  const q = useClient(name);
  const members = useMembers();
  const setPinned = useSetPinned();
  const setArchived = useSetArchived();
  const [openId, setOpenId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<ProjectSummary | null>(null);
  const today = todayLocal();
  const ownerName = useCallback((id: string | null) => (id ? (members.data?.find((m) => m.id === id)?.name ?? null) : null), [members.data]);
  const actions: CardActions = useMemo(
    () => ({
      open: setOpenId,
      pin: (p) => setPinned.mutate({ id: p.id, pinned: !p.pinned }),
      duplicate: setDuplicating,
      archive: (p) => setArchived.mutate({ id: p.id, archived: true, name: p.name }),
    }),
    // Mutation objects change identity every render; their `mutate` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const notFound = q.error instanceof ApiError && q.error.status === 404;
  const data = q.data;
  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <div className="flex flex-col gap-2">
        <BackButton />
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{data?.name ?? name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? (data.lastActivityAt ? fmt(c.lastActivity, { date: formatDay(todayLocal(new Date(data.lastActivityAt)), today) ?? "" }) : c.noActivity) : c.subline}
          </p>
        </header>
      </div>

      {notFound ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{c.notFound}</p>
          <p className="mt-1">{c.notFoundHint}</p>
        </div>
      ) : q.isError ? (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm">
          <span>{c.loadError}</span>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            {t.common.retry}
          </Button>
        </div>
      ) : (
        <>
          <Stats data={data} />

          <Panel title={c.activeSection} hint={data ? String(data.active.length) : ""}>
            {!data ? (
              <Skeleton className="h-40 w-full" />
            ) : data.active.length ? (
              <ProjectTable projects={data.active} ownerName={ownerName} today={today} actions={actions} />
            ) : (
              <p className="text-sm text-muted-foreground">{c.noActive}</p>
            )}
          </Panel>

          <Panel title={c.contacts} hint={c.contactsHint}>
            {!data ? <Skeleton className="h-16 w-full" /> : <Contacts contacts={data.contacts} />}
          </Panel>

          {!!data?.archived.length && (
            <Panel title={c.archivedSection} hint={`${data.archived.length} · ${c.archivedHint}`}>
              <ul className="rounded-lg border bg-card">
                {data.archived.map((p) => (
                  <li key={p.id} className="flex min-h-14 items-center gap-4 border-b px-4 py-2.5 last:border-0">
                    <a
                      href={`/projects/${p.id}`}
                      onClick={(e) => openOnClick(e, () => setOpenId(p.id))}
                      className="min-w-0 flex-1 truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {p.name}
                    </a>
                    <div className="hidden w-32 sm:block">
                      <ChecklistTrack done={p.doneCount} total={p.taskCount} />
                    </div>
                    <StatusPill status={p.status} />
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
      <ProjectSheet projectId={openId} onClose={() => setOpenId(null)} />
      <DuplicateDialog project={duplicating} onClose={() => setDuplicating(null)} />
    </div>
  );
}

function Stats({ data }: { data: ClientDetail | undefined }) {
  return (
    <section className="grid grid-cols-2 border-y sm:grid-cols-4 [&>*]:border-b sm:[&>*]:border-b-0 [&>*:not(:last-child)]:sm:border-r [&>*:nth-child(odd)]:border-r">
      <Kpi label={c.open}>{data ? <Counter value={data.counts.open} fontSize="inherit" intro={false} motionBlur={false} fade={0} /> : null}</Kpi>
      <Kpi label={c.completed}>{data ? <Counter value={data.counts.completed} fontSize="inherit" intro={false} motionBlur={false} fade={0} /> : null}</Kpi>
      <Kpi label={c.onTime} hint={data && (data.onTime.total ? fmt(c.onTimeHint, { onTime: data.onTime.onTime, total: data.onTime.total }) : c.noData)}>
        {data ? data.onTime.rate === null ? "—" : <CountUp to={data.onTime.rate} suffix="%" trigger="load" /> : null}
      </Kpi>
      <Kpi label={c.overdue} hint={c.overdueHint} negative={!!data?.overdueSteps}>
        {data ? <Counter value={data.overdueSteps} fontSize="inherit" intro={false} motionBlur={false} fade={0} /> : null}
      </Kpi>
    </section>
  );
}

function Contacts({ contacts }: { contacts: ClientContact[] }) {
  if (!contacts.length) return <p className="text-sm text-muted-foreground">{c.noContacts}</p>;
  return (
    <ul className="rounded-lg border bg-card">
      {contacts.map((k, i) => {
        const who = k.name ?? k.email ?? k.phone ?? c.unnamed;
        return (
          <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3 text-sm last:border-0">
            <div className="min-w-0 flex-1 basis-48">
              <div className="truncate font-medium">{who}</div>
              <div className="truncate text-xs text-muted-foreground">{fmt(c.onProjects, { projects: k.projects.map((p) => p.name).join(", ") })}</div>
            </div>
            {k.phone && (
              <a href={`tel:${k.phone.replace(/[^+\d]/g, "")}`} aria-label={fmt(c.call, { name: who })} className="num inline-flex items-center gap-1.5 rounded-md py-1 hover:underline focus-visible:underline focus-visible:outline-none">
                <Phone className="size-4 text-muted-foreground" aria-hidden />
                {k.phone}
              </a>
            )}
            {k.email && (
              <a href={`mailto:${k.email}`} aria-label={fmt(c.write, { name: who })} className="inline-flex min-w-0 items-center gap-1.5 rounded-md py-1 hover:underline focus-visible:underline focus-visible:outline-none">
                <Mail className="size-4 flex-none text-muted-foreground" aria-hidden />
                <span className="truncate">{k.email}</span>
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
