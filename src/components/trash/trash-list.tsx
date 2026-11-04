"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, FolderKanban, ListChecks, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt, plural, t } from "@/i18n";
import { api } from "@/lib/api";
import type { TrashItem } from "@/server/trash";

const ICON = { project: FolderKanban, task: ListChecks, document: FileText };

/** Koš: everything deleted in the last 10 days, each with Restore and the day it will be erased. */
export function TrashList() {
  const s = t.trash;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["trash"], queryFn: () => api<{ items: TrashItem[] }>("/api/trash").then((r) => r.items) });
  const restore = useMutation({
    mutationFn: (it: TrashItem) => api("/api/trash/restore", { method: "POST", json: { kind: it.kind, id: it.id } }),
    onSuccess: (_d, it) => {
      toast.success(fmt(s.restored, { name: it.name }));
      for (const k of ["trash", "projects", "tasks", "documents", "counts"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error(e.message),
  });
  const daysLeft = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{s.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{s.subline}</p>
      </header>
      {q.isPending ? (
        <div className="rounded-lg border bg-card">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex h-14 items-center gap-3 border-b px-4 last:border-0">
              <Skeleton className="size-4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : q.isError ? (
        <div className="flex items-center gap-3 rounded-lg border bg-card p-4 text-sm">
          {t.common.errorGeneric}
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>{t.common.retry}</Button>
        </div>
      ) : !q.data.length ? (
        <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{s.empty}</div>
      ) : (
        <ul className="rounded-lg border bg-card">
          {q.data.map((it) => {
            const Icon = ICON[it.kind];
            const left = daysLeft(it.purgeOn);
            return (
              <li key={`${it.kind}-${it.id}`} className="flex min-h-14 items-center gap-3 border-b px-4 py-2.5 last:border-0">
                <Icon className="size-4 flex-none text-muted-foreground" aria-hidden />
                <div className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{it.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {s.kinds[it.kind]}
                    {it.context ? ` · ${it.context}` : ""}
                  </span>
                </div>
                <span className={left <= 2 ? "num text-xs text-negative" : "num text-xs text-muted-foreground"}>
                  {plural(left, s.daysLeft)}
                </span>
                <Button variant="outline" size="sm" onClick={() => restore.mutate(it)} disabled={restore.isPending}>
                  <RotateCcw aria-hidden />
                  {s.restore}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
