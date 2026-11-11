"use client";

import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useRef } from "react";
import { projectQuery } from "@/hooks/project-detail";
import { useProjects } from "@/hooks/queries";
import { t } from "@/i18n";
import { hasUnsaved } from "@/lib/unsaved";

// The panel (checklist, drag and drop, notes, documents, animations) is a separate chunk: it is
// fetched right after hydration, so the list does not wait for it and opening a project is still
// instant.
const loadPanel = () => import("@/components/project-detail/project-panel");
const ProjectPanel = dynamic(() => loadPanel().then((m) => m.ProjectPanel), {
  loading: () => (
    <div className="grid gap-3 p-5 pr-14" aria-busy aria-label={t.common.loading}>
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3.5 w-1/3" />
    </div>
  ),
});

/** The project side panel, on the right so the list behind it stays in view. Escape closes it. */
export function ProjectSheet({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const projects = useProjects();
  const name = projects.data?.find((p) => p.id === projectId)?.name ?? t.projects.panelTitle;
  // The panel opens from a card or a row, not a Radix trigger, so focus is put back by hand.
  const opener = useRef<HTMLElement | null>(null);
  const qc = useQueryClient();
  useEffect(() => {
    if (projectId) opener.current = document.activeElement as HTMLElement | null;
    // Data and code in parallel: on a direct /projects/<id> load the fetch must not wait for the chunk.
    if (projectId) void qc.prefetchQuery(projectQuery(projectId));
  }, [projectId, qc]);
  useEffect(() => {
    void loadPanel();
  }, []);
  const close = () => {
    if (hasUnsaved() && !window.confirm(t.common.unsavedLeave)) return;
    onClose();
  };
  return (
    // Non-modal: no dimming overlay, so the list stays readable beside the panel; Escape and an outside click close it.
    <Sheet modal={false} open={!!projectId} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="right"
        // Toasts (Undo / Retry) sit outside the non-modal sheet; clicking them must not close it.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          opener.current?.focus?.();
        }}
        onInteractOutside={(e) => {
          if ((e.target as Element | null)?.closest?.("[data-sonner-toaster]")) e.preventDefault();
        }} aria-describedby={undefined} className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[560px] data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
        <SheetTitle className="sr-only">{name}</SheetTitle>
        {projectId && <ProjectPanel key={projectId} projectId={projectId} onClose={close} />}
      </SheetContent>
    </Sheet>
  );
}
