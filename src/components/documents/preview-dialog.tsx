"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmt, t } from "@/i18n";
import { PREVIEWABLE, formatBytes } from "./file-types";
import { typeLabel } from "./parts";
import { downloadHref, type DocumentDto } from "./use-documents";

const s = t.documents;

/** PDF in an iframe, PNG/JPEG as an image; other types show their details and a Download button. */
export default function PreviewDialog({ doc, onClose }: { doc: DocumentDto | null; onClose: () => void }) {
  const canPreview = !!doc?.fileType && PREVIEWABLE.includes(doc.fileType);
  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={canPreview ? "sm:max-w-4xl" : "sm:max-w-md"}>
        {doc && (
          <>
            <DialogHeader className="pr-8">
              <DialogTitle className="truncate">{doc.name}</DialogTitle>
              <DialogDescription className="num">
                {fmt(s.preview.details, { type: typeLabel(doc), size: formatBytes(doc.sizeBytes) ?? t.common.none })}
              </DialogDescription>
            </DialogHeader>
            {doc.fileType === "pdf" ? (
              <iframe src={downloadHref(doc, true)} title={doc.name} className="h-[70vh] w-full rounded-md border bg-muted" />
            ) : canPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not an optimisable asset
              <img src={downloadHref(doc, true)} alt={doc.name} className="max-h-[70vh] w-full rounded-md border bg-muted object-contain" />
            ) : (
              <p className="text-muted-foreground">{s.preview.noPreview}</p>
            )}
            <DialogFooter>
              <Button asChild variant={canPreview ? "outline" : "default"}>
                <a href={downloadHref(doc)} download>
                  <Download aria-hidden />
                  {s.preview.download}
                </a>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
