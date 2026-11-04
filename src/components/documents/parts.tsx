"use client";

import { FileImage, FileSpreadsheet, FileText, Link2, Plus, Upload } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { t } from "@/i18n";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ACCEPT } from "./file-types";
import { useAddLink, useUpload, type DocumentDto } from "./use-documents";

const s = t.documents;

export function DocIcon({ doc, className }: { doc: Pick<DocumentDto, "kind" | "fileType">; className?: string }) {
  const Icon = doc.kind === "link" ? Link2 : doc.fileType === "png" || doc.fileType === "jpeg" ? FileImage : doc.fileType === "xlsx" || doc.fileType === "csv" ? FileSpreadsheet : FileText;
  return <Icon className={cn("size-4 shrink-0 text-muted-foreground", className)} strokeWidth={1.6} aria-hidden />;
}

export const typeLabel = (d: Pick<DocumentDto, "kind" | "fileType">) => (d.kind === "link" ? s.types.link : d.fileType ? s.types[d.fileType] : t.common.none);

/** The preview dialog's code loads only when someone opens a preview. */
export const DocumentPreview = dynamic(() => import("./preview-dialog"), { ssr: false });

/** Hidden file input + a way to open it. */
export function useFilePicker(onFiles: (files: File[]) => void, multiple = true) {
  const ref = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      accept={ACCEPT}
      multiple={multiple}
      className="hidden"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length) onFiles(files);
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

export function LinkDialog({ open, onOpenChange, projectId }: { open: boolean; onOpenChange: (o: boolean) => void; projectId?: string | null }) {
  const add = useAddLink();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!/^https?:\/\/\S+$/i.test(trimmed)) return setError(s.link.invalid);
    setError(null);
    add.mutate(
      { name: name.trim() || trimmed.replace(/^https?:\/\//i, "").slice(0, 255), url: trimmed, projectId },
      {
        onSuccess: () => {
          setName("");
          setUrl("");
          onOpenChange(false);
        },
        onError: (err) => setError(err instanceof ApiError && err.status === 422 ? s.link.invalid : err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{s.link.title}</DialogTitle>
            <DialogDescription>{s.link.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="doc-link-url">{s.link.url}</Label>
            <Input
              id="doc-link-url"
              type="url"
              inputMode="url"
              autoFocus
              placeholder={s.link.urlPlaceholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "doc-link-error" : undefined}
            />
            {error && (
              <p id="doc-link-error" className="text-xs text-negative">
                {error}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="doc-link-name">{s.link.name}</Label>
            <Input id="doc-link-name" placeholder={s.link.namePlaceholder} value={name} maxLength={255} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? t.common.saving : s.link.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Add" menu: upload a file or add a link, optionally pre-associated with a project. */
export function AddDocumentMenu({ projectId, children, align = "start" }: { projectId?: string | null; children: ReactNode; align?: "start" | "end" }) {
  const upload = useUpload();
  const picker = useFilePicker((files) => upload(files, { projectId }));
  const [linkOpen, setLinkOpen] = useState(false);
  return (
    <>
      {picker.input}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent align={align}>
          <DropdownMenuItem onSelect={picker.open}>
            <Upload className="size-4" aria-hidden />
            {s.uploadFile}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setLinkOpen(true)}>
            <Link2 className="size-4" aria-hidden />
            {s.addLink}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <LinkDialog open={linkOpen} onOpenChange={setLinkOpen} projectId={projectId} />
    </>
  );
}

export function AddIconButton({ label, ...props }: { label: string } & React.ComponentProps<typeof Button>) {
  return (
    <Button variant="ghost" size="icon-xs" aria-label={label} className="text-muted-foreground" {...props}>
      <Plus />
    </Button>
  );
}

/** A real link: files open the preview (middle-click opens the file), links open in a new tab. */
export function DocLink({ doc, onPreview, className, children }: { doc: DocumentDto; onPreview: (d: DocumentDto) => void; className?: string; children: ReactNode }) {
  if (doc.kind === "link") {
    return (
      <a href={doc.url ?? "#"} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <a
      href={`/api/documents/${doc.id}/download?inline=1`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        onPreview(doc);
      }}
    >
      {children}
    </a>
  );
}
