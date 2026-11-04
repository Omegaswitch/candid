"use client";

import Link from "next/link";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { AddDocumentMenu, AddIconButton, DocIcon, DocLink, DocumentPreview } from "./parts";
import { dragHasFiles, useDocuments, useUpload, type DocumentDto } from "./use-documents";

const s = t.documents;
const SHELF_SIZE = 5;

/** Sidebar group: the caller's pinned documents (or the most recent), add, drop to upload, View all. */
export function DocumentShelf() {
  const docs = useDocuments();
  const upload = useUpload();
  const [preview, setPreview] = useState<DocumentDto | null>(null);
  const [dragging, setDragging] = useState(false);

  const all = docs.data ?? [];
  const pinned = all.filter((d) => d.pinned);
  const shown = (pinned.length ? pinned : [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt))).slice(0, SHELF_SIZE);

  return (
    <section
      aria-label={s.shelfRegion}
      className={cn("-mx-1 flex flex-col gap-0.5 rounded-md px-1 py-1 outline-1 outline-transparent transition-colors", dragging && "bg-sidebar-accent outline-dashed outline-border")}
      onDragOver={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
      onDrop={(e) => {
        if (!dragHasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        upload(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="flex h-6 items-center justify-between pl-2.5">
        <h2 className="text-xs text-muted-foreground">
          {dragging ? s.dropToUpload : s.shelfLabel}
        </h2>
        <AddDocumentMenu align="end">
          <AddIconButton label={s.add} />
        </AddDocumentMenu>
      </div>
      {docs.isPending ? (
        <div className="flex flex-col gap-0.5" aria-busy aria-label={t.common.loading}>
          {[0, 1].map((i) => (
            <div key={i} className="flex h-8 items-center gap-2.5 px-2.5">
              <Skeleton className="size-4" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          ))}
        </div>
      ) : docs.isError ? (
        <p className="px-2.5 py-1 text-xs text-muted-foreground">
          {s.loadError}{" "}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => docs.refetch()}>
            {t.common.retry}
          </button>
        </p>
      ) : shown.length === 0 ? (
        <p className="px-2.5 py-1 text-xs text-muted-foreground">{s.shelfEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {shown.map((d) => (
            <li key={d.id}>
              <DocLink
                doc={d}
                onPreview={setPreview}
                className="flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              >
                <DocIcon doc={d} />
                <span className="truncate">{d.name}</span>
              </DocLink>
            </li>
          ))}
        </ul>
      )}
      <Link href="/documents" className="flex h-7 items-center rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
        {s.viewAll}
      </Link>
      {preview && <DocumentPreview doc={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
