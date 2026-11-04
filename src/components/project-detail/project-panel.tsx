"use client";

import { X } from "lucide-react";
import { ProjectDocuments } from "@/components/documents/project-documents";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject, useProjectActions } from "@/hooks/project-detail";
import { t } from "@/i18n";
import { ApiError } from "@/lib/api";
import { Checklist } from "./checklist";
import { History } from "./history";
import { ProjectNotes } from "./notes";
import { PanelHeader } from "./panel-header";

const p = t.tasks.panel;

/** Contents of the project side panel. The caller provides the Sheet; this renders inside it. */
export function ProjectPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const q = useProject(projectId);
  const actions = useProjectActions(projectId);

  if (q.isPending) return <PanelSkeleton onClose={onClose} />;
  if (q.isError) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="pt-1 text-lg font-semibold">{missing ? p.notFound : p.loadError}</h2>
          <Button variant="ghost" size="icon" aria-label={p.close} onClick={onClose}>
            <X aria-hidden />
          </Button>
        </div>
        <div className="flex gap-2">
          {!missing && (
            <Button variant="outline" onClick={() => q.refetch()}>
              {t.common.retry}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t.common.close}
          </Button>
        </div>
      </div>
    );
  }

  const data = q.data;
  const pr = data.project;
  const allDone = data.tasks.length > 0 && data.tasks.every((x) => x.done);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid gap-6 p-5 pb-10">
          <PanelHeader data={data} actions={actions} onClose={onClose} />
          {allDone && pr.status !== "completed" && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2.5">
              <p className="text-sm">{p.allDone}</p>
              <Button size="sm" onClick={() => actions.save({ status: "completed" })}>
                {p.markCompleted}
              </Button>
            </div>
          )}
          <Checklist projectId={projectId} tasks={data.tasks} />
          <ProjectNotes key={projectId} projectId={projectId} notes={pr.notes} notesVersion={pr.notesVersion} />
          <ProjectDocuments projectId={projectId} />
          <History projectId={projectId} />
        </div>
      </div>
    </div>
  );
}

/** The final layout with flat grey bars, so nothing moves when the data lands. */
function PanelSkeleton({ onClose }: { onClose: () => void }) {
  const bar = "animate-none";
  return (
    <div className="flex h-full flex-col" aria-busy aria-label={t.common.loading}>
      <div className="grid gap-6 p-5">
        <div className="flex items-start gap-2">
          <div className="grid flex-1 gap-2 pt-1">
            <Skeleton className={`h-6 w-2/3 ${bar}`} />
            <Skeleton className={`h-4 w-1/3 ${bar}`} />
          </div>
          <Button variant="ghost" size="icon" aria-label={p.close} onClick={onClose}>
            <X aria-hidden />
          </Button>
        </div>
        <div className="grid gap-1">
          {[p.owner, p.status, p.priority, p.due].map((label) => (
            <div key={label} className="grid h-8 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Skeleton className={`h-4 w-28 ${bar}`} />
            </div>
          ))}
        </div>
        <div className="grid gap-3">
          <h3 className="text-sm font-medium">{t.tasks.checklist}</h3>
          <Skeleton className={`h-4 w-32 ${bar}`} />
          <Skeleton className={`h-1.5 w-full ${bar}`} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex h-11 items-center gap-3 px-1">
              <Skeleton className={`size-4 rounded-full ${bar}`} />
              <Skeleton className={`h-4 ${i % 2 ? "w-1/2" : "w-2/3"} ${bar}`} />
            </div>
          ))}
        </div>
        <div className="grid gap-1.5">
          <h3 className="text-sm font-medium">{p.notes}</h3>
          <Skeleton className={`h-28 w-full rounded-lg ${bar}`} />
        </div>
      </div>
    </div>
  );
}
