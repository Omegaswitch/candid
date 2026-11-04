"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { api } from "@/lib/api";
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
        <div className="mt-1 text-sm text-muted-foreground">
          {q.isPending ? (
            a.subline.split("{n}").map((part, i) => (
              <span key={i}>
                {i > 0 && <Skeleton className="inline-block h-3.5 w-6 align-[-2px]" />}
                {part}
              </span>
            ))
          ) : items.length ? (
            fmt(a.subline, { n: q.hasNextPage ? `${items.length}+` : items.length })
          ) : (
            a.sublineEmpty
          )}
        </div>
      </header>

      {q.isError ? (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm">
          <span>{a.loadError}</span>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            {t.common.retry}
          </Button>
        </div>
      ) : q.isPending ? (
        <div className="rounded-lg border bg-card" aria-busy aria-label={t.common.loading}>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex h-16 items-center gap-4 border-b px-4 last:border-0">
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-1/5" />
              </div>
              <Skeleton className="hidden h-1.5 w-40 sm:block" />
              <Skeleton className="hidden h-5 w-16 rounded-full md:block" />
              <Skeleton className="h-7 w-[72px]" />
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
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setArchived.mutate({ id: p.id, archived: false, name: p.name })}>
                    {a.restore}
                  </Button>
                  <DeleteForever id={p.id} name={p.name} />
                </div>
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

/** Permanent delete: archived projects only, behind a confirmation that names the project. No undo. */
function DeleteForever({ id, name }: { id: string; name: string }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => api(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(fmt(t.projects.archive.deleted, { name }));
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["counts"] });
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-negative hover:text-negative" disabled={del.isPending}>
          {t.projects.archive.delete}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{fmt(t.projects.archive.deleteTitle, { name })}</AlertDialogTitle>
          <AlertDialogDescription>{t.projects.archive.deleteBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => del.mutate()}>
            {t.projects.archive.deleteConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
