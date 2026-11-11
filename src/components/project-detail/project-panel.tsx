"use client";

import { ProjectDocuments } from "@/components/documents/project-documents";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProject, useProjectActions } from "@/hooks/project-detail";
import { t } from "@/i18n";
import { ApiError } from "@/lib/api";
import { Checklist } from "./checklist";
import { ContactCard } from "./contact";
import { ContactLog, FollowUpCard } from "./follow-up";
import { ProjectLabels } from "./labels";
import { History } from "./history";
import { ProjectNotes } from "./notes";
import { PanelHeader } from "./panel-header";

const p = t.tasks.panel;

/** Contents of the project side panel. The caller provides the Sheet; this renders inside it. */
export function ProjectPanel({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const q = useProject(projectId);
  const actions = useProjectActions(projectId);

  if (q.isPending) return <PanelSkeleton />;
  if (q.isError) {
    const missing = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="flex h-full flex-col gap-4 p-5">
        <h2 className="pt-1 pr-10 text-lg font-semibold">{missing ? p.notFound : p.loadError}</h2>
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
    <div className="grid gap-6 p-5 pb-10">
      <PanelHeader data={data} actions={actions} />
      <ProjectLabels projectId={projectId} labelIds={data.labelIds ?? []} />
      {allDone && pr.status !== "completed" && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2.5">
          <p className="text-sm">{p.allDone}</p>
          <Button size="sm" onClick={() => actions.save({ status: "completed" })}>
            {p.markCompleted}
          </Button>
        </div>
      )}
      <Checklist projectId={projectId} tasks={data.tasks} />
      <ContactCard project={pr} onSave={actions.save} />
      <FollowUpCard project={pr} onSave={actions.save} />
      <ContactLog projectId={projectId} />
      <ProjectNotes key={projectId} projectId={projectId} notes={pr.notes} notesVersion={pr.notesVersion} />
      <ProjectDocuments projectId={projectId} />
      <History projectId={projectId} />
    </div>
  );
}

/** The final layout with flat grey bars (PanelHeader, Checklist, Notes, Documents, History), so nothing moves when the data lands. */
function PanelSkeleton() {
  return (
    <div className="grid gap-6 p-5 pb-10" aria-busy aria-label={t.common.loading}>
      <div className="grid gap-4">
        <div className="grid gap-1 pr-10">
          <div className="flex h-[25px] items-center"><Skeleton className="h-5 w-2/3" /></div>
          <div className="flex h-5 items-center"><Skeleton className="h-3.5 w-1/3" /></div>
        </div>
        <div className="grid gap-1">
          {[p.owner, p.status, p.priority, p.due].map((label) => (
            <div key={label} className="grid h-8 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
              <span className="text-sm text-muted-foreground">{label}</span>
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
        <div className="flex h-4 items-center"><Skeleton className="h-3 w-64" /></div>
      </div>
      <div className="grid gap-3">
        <div className="flex h-7 items-center">
          <h3 className="text-sm font-medium">{t.tasks.checklist}</h3>
        </div>
        {/* Progress: the 64px ring beside "n of m completed" and "Next: …". */}
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="grid gap-0.5">
            <div className="flex h-5 items-center"><Skeleton className="h-3.5 w-32" /></div>
            <div className="flex h-5 items-center"><Skeleton className="h-3.5 w-40" /></div>
          </div>
        </div>
        <div className="-mx-1 grid gap-1">
          <ul className="grid gap-px">
            {[0, 1].map((i) => (
              <li key={i} className="flex h-[60px] items-center gap-1.5 px-1">
                <span className="w-4" />
                <span className="flex w-6 justify-center"><Skeleton className="size-4 rounded-full" /></span>
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className={`h-3.5 ${i % 2 ? "w-1/2" : "w-2/3"}`} />
                  <Skeleton className="h-3 w-24" />
                </div>
              </li>
            ))}
          </ul>
          {/* "Show n completed" toggle */}
          <div className="flex h-7 items-center px-2.5"><Skeleton className="h-3 w-28" /></div>
        </div>
        <div className="h-8" />
      </div>
      <div className="grid gap-1.5">
        <div className="flex h-5 items-center"><h3 className="text-sm font-medium">{p.notes}</h3></div>
        <Skeleton className="min-h-28 w-full rounded-lg" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">{p.documents}</h3>
        <div className="-mx-2 flex flex-col">
          {[0].map((i) => (
            <div key={i} className="flex h-8 items-center gap-2.5 px-2">
              <Skeleton className="size-4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          ))}
        </div>
        <div className="h-7" />
      </div>
      <div className="flex h-5 items-center">
        <h3 className="text-sm font-medium">{p.history}</h3>
      </div>
    </div>
  );
}
