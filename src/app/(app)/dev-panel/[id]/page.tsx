"use client";
// TEMPORARY — project-detail agent's check page. Delete before finishing.
import { use } from "react";
import { ProjectPanel } from "@/components/project-detail/project-panel";

export default function DevPanel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full border-l bg-popover sm:max-w-xl">
      <ProjectPanel projectId={id} onClose={() => console.log("close")} />
    </div>
  );
}
