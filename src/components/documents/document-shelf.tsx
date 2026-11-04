"use client";

import Link from "next/link";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { Pin } from "lucide-react";
import { AddDocumentMenu, AddIconButton, DocIcon, DocLink, DocRowMenu, DocumentPreview } from "./parts";
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
  // Pinned first, then newest; each block shows a handful, "View all" has the rest.
  const pick = (list: DocumentDto[]) =>
    [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)).slice(0, SHELF_SIZE);
  const general = pick(all.filter((d) => !d.projectId));
  const byProject = pick(all.filter((d) => d.projectId));
  const row = (d: DocumentDto) => (
    <li key={d.id} className="group flex items-center rounded-md hover:bg-sidebar-accent">
      <DocLink
        doc={d}
        onPreview={setPreview}
        className="flex min-h-8 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-1 text-[15px] text-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-foreground"
      >
        <DocIcon doc={d} />
        <span className="grid min-w-0">
          {d.projectName && <span className="truncate text-xs leading-tight text-muted-foreground">{d.projectName}</span>}
          <span className="truncate">{d.name}</span>
        </span>
        {d.pinned && <Pin className="size-3 flex-none text-muted-foreground" aria-label={s.pinnedFirst} />}
      </DocLink>
      <DocRowMenu doc={d} />
    </li>
  );

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
      ) : all.length === 0 ? (
        <p className="px-2.5 py-1 text-xs text-muted-foreground">{s.shelfEmpty}</p>
      ) : (
        <>
          <h3 className="mt-1 px-2.5 text-xs font-medium text-muted-foreground">{s.shelfGeneral}</h3>
          {general.length ? <ul className="flex flex-col gap-0.5">{general.map(row)}</ul> : <p className="px-2.5 py-1 text-xs text-muted-foreground">{s.shelfNone}</p>}
          <hr className="mx-2.5 my-2 border-sidebar-border" />
          <h3 className="px-2.5 text-xs font-medium text-muted-foreground">{s.shelfByProject}</h3>
          {byProject.length ? <ul className="flex flex-col gap-0.5">{byProject.map(row)}</ul> : <p className="px-2.5 py-1 text-xs text-muted-foreground">{s.shelfNone}</p>}
        </>
      )}
      <Link href="/documents" className="flex h-7 items-center rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground">
        {s.viewAll}
      </Link>
      {preview && <DocumentPreview doc={preview} docs={all} onClose={() => setPreview(null)} />}
    </section>
  );
}
