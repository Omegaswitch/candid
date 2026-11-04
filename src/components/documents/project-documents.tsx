"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { formatBytes } from "./file-types";
import { AddDocumentMenu, DocIcon, DocLink, DocRowMenu, DocumentPreview, typeLabel } from "./parts";
import { dragHasFiles, useDocuments, useUpload, type DocumentDto } from "./use-documents";

const s = t.documents;

/** Documents associated with one project, shown inside the project panel. */
export function ProjectDocuments({ projectId }: { projectId: string }) {
  const docs = useDocuments();
  const upload = useUpload();
  const [preview, setPreview] = useState<DocumentDto | null>(null);
  const [dragging, setDragging] = useState(false);
  const list = (docs.data ?? []).filter((d) => d.projectId === projectId);

  return (
    <section
      aria-labelledby={`project-docs-${projectId}`}
      className={cn("flex flex-col gap-1.5 rounded-md outline-1 outline-transparent transition-colors", dragging && "bg-muted outline-dashed outline-border")}
      onDragOver={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        upload(Array.from(e.dataTransfer.files), { projectId });
      }}
    >
      <h3 id={`project-docs-${projectId}`} className="text-sm font-medium">
        {s.title}
      </h3>
      {docs.isPending ? (
        <div className="-mx-2 flex flex-col" aria-busy aria-label={t.common.loading}>
          {[0, 1].map((i) => (
            <div key={i} className="flex h-8 items-center gap-2.5 px-2">
              <Skeleton className="size-4" />
              <Skeleton className="h-3.5 w-1/2" />
            </div>
          ))}
        </div>
      ) : docs.isError ? (
        <p className="text-sm text-muted-foreground">
          {s.loadError}{" "}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => docs.refetch()}>
            {t.common.retry}
          </button>
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">{s.projectEmpty}</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {list.map((d) => (
            <li key={d.id} className="group flex items-center rounded-md hover:bg-muted">
              <DocLink doc={d} onPreview={setPreview} className="flex h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-sm">
                <DocIcon doc={d} />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="num shrink-0 text-xs text-muted-foreground">{d.kind === "link" ? typeLabel(d) : formatBytes(d.sizeBytes)}</span>
              </DocLink>
              <DocRowMenu doc={d} />
            </li>
          ))}
        </ul>
      )}
      <div>
        <AddDocumentMenu projectId={projectId}>
          <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
            <Plus aria-hidden />
            {s.add}
          </Button>
        </AddDocumentMenu>
      </div>
      {preview && <DocumentPreview doc={preview} docs={list} onClose={() => setPreview(null)} />}
    </section>
  );
}
