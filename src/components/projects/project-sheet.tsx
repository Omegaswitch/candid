"use client";

import { ProjectPanel } from "@/components/project-detail/project-panel";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useProjects } from "@/hooks/queries";
import { t } from "@/i18n";

/** The project side panel, on the right so the list behind it stays in view. Escape closes it. */
export function ProjectSheet({ projectId, onClose }: { projectId: string | null; onClose: () => void }) {
  const projects = useProjects();
  const name = projects.data?.find((p) => p.id === projectId)?.name ?? t.projects.panelTitle;
  return (
    // Non-modal: no dimming overlay, so the list stays readable beside the panel; Escape and an outside click close it.
    <Sheet modal={false} open={!!projectId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        // Toasts (Undo / Retry) sit outside the non-modal sheet; clicking them must not close it.
        onInteractOutside={(e) => {
          if ((e.target as Element | null)?.closest?.("[data-sonner-toaster]")) e.preventDefault();
        }} aria-describedby={undefined} className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[560px] data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]">
        <SheetTitle className="sr-only">{name}</SheetTitle>
        {projectId && <ProjectPanel key={projectId} projectId={projectId} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}
