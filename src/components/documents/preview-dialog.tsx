"use client";

import { ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmt, t } from "@/i18n";
import { PREVIEWABLE, formatBytes } from "./file-types";
import { typeLabel } from "./parts";
import { downloadHref, type DocumentDto } from "./use-documents";

const s = t.documents;

/**
 * Attachment viewer: PDF in a frame, PNG/JPEG as an image, CSV as a table; other types show their
 * details and Download. With `docs`, arrows (and ← → keys) step through the other attachments.
 */
export default function PreviewDialog({ doc, docs, onClose }: { doc: DocumentDto | null; docs?: DocumentDto[]; onClose: () => void }) {
  const files = (docs ?? (doc ? [doc] : [])).filter((d) => d.kind === "file");
  const [current, setCurrent] = useState(doc);
  useEffect(() => setCurrent(doc), [doc]);
  const i = current ? files.findIndex((d) => d.id === current.id) : -1;
  const go = (d: -1 | 1) => files.length > 1 && setCurrent(files[(i + d + files.length) % files.length]);

  const d = current;
  const canPreview = !!d?.fileType && (PREVIEWABLE.includes(d.fileType) || d.fileType === "csv");
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={canPreview ? "flex h-[92vh] max-w-[min(1200px,96vw)] flex-col sm:max-w-[min(1200px,96vw)]" : "sm:max-w-md"}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") go(-1);
          if (e.key === "ArrowRight") go(1);
        }}
      >
        {d && (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle className="truncate">{d.name}</DialogTitle>
              <DialogDescription className="num">
                {fmt(s.preview.details, { type: typeLabel(d), size: formatBytes(d.sizeBytes) ?? t.common.none })}
                {files.length > 1 && i >= 0 && ` · ${i + 1} / ${files.length}`}
              </DialogDescription>
            </DialogHeader>

            <div className="relative min-h-0 flex-1">
              {d.fileType === "pdf" ? (
                <iframe key={d.id} src={downloadHref(d, true)} title={d.name} className="size-full min-h-[50vh] rounded-md border bg-muted" />
              ) : d.fileType === "png" || d.fileType === "jpeg" ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not an optimisable asset
                <img key={d.id} src={downloadHref(d, true)} alt={d.name} className="mx-auto max-h-full max-w-full rounded-md border object-contain" />
              ) : d.fileType === "csv" ? (
                <CsvTable key={d.id} doc={d} />
              ) : (
                <p className="text-muted-foreground">{s.preview.noPreview}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1">
                {files.length > 1 && (
                  <>
                    <Button variant="outline" size="icon" aria-label={s.preview.previous} onClick={() => go(-1)}>
                      <ChevronLeft />
                    </Button>
                    <Button variant="outline" size="icon" aria-label={s.preview.next} onClick={() => go(1)}>
                      <ChevronRight />
                    </Button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {canPreview && (
                  <Button asChild variant="outline">
                    <a href={downloadHref(d, true)} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden />
                      {s.preview.newTab}
                    </a>
                  </Button>
                )}
                <Button asChild variant={canPreview ? "outline" : "default"}>
                  <a href={downloadHref(d)} download>
                    <Download aria-hidden />
                    {s.preview.download}
                  </a>
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** First 200 rows of a CSV, read through the signed download link (never executed, shown as text). */
function CsvTable({ doc }: { doc: DocumentDto }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [res, Papa] = await Promise.all([fetch(downloadHref(doc, true)), import("papaparse")]);
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        const parsed = Papa.default.parse<string[]>(text, { preview: 200, skipEmptyLines: true });
        if (live) setRows(parsed.data);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [doc]);
  if (failed) return <p className="text-muted-foreground">{s.preview.noPreview}</p>;
  if (!rows) return <p className="text-muted-foreground">{t.common.loading}</p>;
  const [head, ...body] = rows;
  return (
    <div className="size-full overflow-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
          <tr>{head?.map((h, k) => <th key={k} className="whitespace-nowrap border-b px-3 py-2 font-normal">{h}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((r, n) => (
            <tr key={n} className="border-b last:border-0">
              {r.map((c, k) => <td key={k} className="whitespace-nowrap px-3 py-1.5">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
