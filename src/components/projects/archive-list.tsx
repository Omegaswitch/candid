"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMembers } from "@/hooks/queries";
import { useArchivedProjects, useSetArchived } from "@/hooks/projects";
import { fmt, plural, t } from "@/i18n";
import { openOnClick } from "./project-card";
import { ChecklistTrack, StatusPill } from "./project-bits";
import { ProjectSheet } from "./project-sheet";

const a = t.projects.archive;
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

export function ArchiveList() {
  const q = useArchivedProjects();
  const members = useMembers();
  const setArchived = useSetArchived();
  const [openId, setOpenId] = useState<string | null>(null);
  const items = q.data?.pages.flat() ?? [];
  const name = (id: string | null) => (id ? members.data?.find((m) => m.id === id)?.name : null) ?? t.common.none;

  return (
    <div className="flex max-w-[1100px] flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{a.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {items.length ? fmt(a.subline, { n: q.hasNextPage ? `${items.length}+` : items.length }) : a.sublineEmpty}
        </p>
      </header>

      {q.isError ? (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm">
          <span>{a.loadError}</span>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            {t.common.retry}
          </Button>
        </div>
      ) : q.isPending ? (
        <div className="rounded-lg border bg-card">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex h-16 items-center gap-4 border-b px-4 last:border-0">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/5" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{a.empty}</div>
      ) : (
        <>
          <ul className="rounded-lg border bg-card">
            {items.map((p) => (
              <li key={p.id} className="flex min-h-16 items-center gap-4 border-b px-4 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <a
                    href={`/projects/${p.id}`}
                    onClick={(e) => openOnClick(e, () => setOpenId(p.id))}
                    className="block truncate font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                  >
                    {p.name}
                  </a>
                  <div className="truncate text-xs text-muted-foreground">
                    {[p.client, name(p.ownerId), p.archivedAt && fmt(a.archivedOn, { date: dayFmt.format(new Date(p.archivedAt)) })]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="hidden w-40 sm:block">
                  <ChecklistTrack done={p.doneCount} total={p.taskCount} />
                  <div className="num mt-1 text-xs text-muted-foreground">
                    {p.taskCount ? fmt(t.projects.progress, { done: p.doneCount, total: p.taskCount }) : t.projects.noTasks}
                  </div>
                </div>
                <StatusPill status={p.status} className="hidden md:inline-flex" />
                <Button variant="outline" size="sm" onClick={() => setArchived.mutate({ id: p.id, archived: false, name: p.name })}>
                  {a.restore}
                </Button>
              </li>
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="flex items-center justify-center gap-3">
              <span className="num text-xs text-muted-foreground">{fmt(a.shown, { n: plural(items.length, t.projects.projectsN) })}</span>
              <Button variant="outline" size="sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                {a.loadMore}
              </Button>
            </div>
          )}
        </>
      )}
      <ProjectSheet projectId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}
