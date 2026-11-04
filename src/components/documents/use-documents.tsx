"use client";

import { compressForUpload } from "./compress";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fmt, t } from "@/i18n";
import { ApiError, api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { DocumentDto } from "@/server/documents";
import { FILE_TYPES, MAX_UPLOAD_BYTES, fileTypeOfName, formatBytes } from "./file-types";

export type { DocumentDto };

const s = t.documents;

/** All workspace documents in shelf order; project views filter this one cached list. */
export function useDocuments() {
  return useQuery({
    queryKey: qk.documents(),
    queryFn: () => api<{ documents: DocumentDto[] }>("/api/documents").then((r) => r.documents),
  });
}

export const downloadHref = (d: { id: string }, inline = false) => `/api/documents/${d.id}/download${inline ? "?inline=1" : ""}`;

function patchCache(qc: QueryClient, fn: (list: DocumentDto[]) => DocumentDto[]) {
  const prev = qc.getQueryData<DocumentDto[]>(qk.documents());
  if (prev) qc.setQueryData(qk.documents(), fn(prev));
  return prev;
}

const errorText = (e: unknown) => (e instanceof ApiError && e.isOffline ? t.common.offline : e instanceof Error ? e.message : t.common.errorGeneric);

/** Optimistic rename / project change. A conflict shows the server copy. */
export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; version: number; name?: string; projectId?: string | null }) =>
      api<{ document: DocumentDto }>(`/api/documents/${v.id}`, { method: "PATCH", json: { name: v.name, projectId: v.projectId, version: v.version } }).then(
        (r) => r.document,
      ),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.documents() });
      const prev = patchCache(qc, (l) => l.map((d) => (d.id === v.id ? { ...d, ...(v.name !== undefined && { name: v.name }), ...(v.projectId !== undefined && { projectId: v.projectId }) } : d)));
      return { prev };
    },
    onError: (e, _v, c) => {
      if (c?.prev) qc.setQueryData(qk.documents(), c.prev);
      toast.error(e instanceof ApiError && e.isConflict ? t.common.conflict.title : errorText(e));
      if (e instanceof ApiError && e.isConflict) qc.invalidateQueries({ queryKey: qk.documents() });
    },
    onSuccess: (doc) => patchCache(qc, (l) => l.map((d) => (d.id === doc.id ? doc : d))),
  });
}

/** Optimistic soft delete with an Undo toast. */
export function useRemoveDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: DocumentDto) => api(`/api/documents/${d.id}`, { method: "DELETE" }),
    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: qk.documents() });
      return { prev: patchCache(qc, (l) => l.filter((x) => x.id !== d.id)) };
    },
    onError: (e, _d, c) => {
      if (c?.prev) qc.setQueryData(qk.documents(), c.prev);
      toast.error(errorText(e));
    },
    onSuccess: (_r, d) => {
      toast(fmt(s.removed, { name: d.name }), {
        action: {
          label: t.common.undo,
          onClick: () => {
            patchCache(qc, (l) => [...l.filter((x) => x.id !== d.id), d].sort((a, b) => a.position - b.position || b.createdAt.localeCompare(a.createdAt)));
            api(`/api/documents/${d.id}/restore`, { method: "POST" })
              .catch((e) => toast.error(errorText(e)))
              .finally(() => qc.invalidateQueries({ queryKey: qk.documents() }));
          },
        },
      });
    },
  });
}

export function usePinDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) => api("/api/favorites", { method: "POST", json: { kind: "document", entityId: v.id, pinned: v.pinned } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: qk.documents() });
      return { prev: patchCache(qc, (l) => l.map((d) => (d.id === v.id ? { ...d, pinned: v.pinned } : d))) };
    },
    onError: (e, _v, c) => {
      if (c?.prev) qc.setQueryData(qk.documents(), c.prev);
      toast.error(errorText(e));
    },
  });
}

export function useReorderDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api("/api/documents/reorder", { method: "POST", json: { ids } }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: qk.documents() });
      const prev = patchCache(qc, (l) => {
        const byId = new Map(l.map((d) => [d.id, d]));
        return ids.map((id, i) => ({ ...byId.get(id)!, position: i })).concat(l.filter((d) => !ids.includes(d.id)));
      });
      return { prev };
    },
    onError: (e, _v, c) => {
      if (c?.prev) qc.setQueryData(qk.documents(), c.prev);
      toast.error(errorText(e));
    },
  });
}

export function useAddLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { name: string; url: string; projectId?: string | null }) =>
      api<{ document: DocumentDto }>("/api/documents/links", { method: "POST", json: v }).then((r) => r.document),
    onSuccess: (doc) => {
      patchCache(qc, (l) => [doc, ...l]);
      qc.invalidateQueries({ queryKey: qk.documents() });
      toast.success(fmt(s.link.added, { name: doc.name }));
    },
  });
}

// ---------------------------------------------------------------- uploads

const reasonText: Record<string, string> = {
  type: s.upload.type,
  too_large: s.upload.tooLarge,
  verification: s.upload.verification,
  missing: s.upload.missing,
};

function uploadError(e: unknown) {
  if (e instanceof ApiError) {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    if (reason && reasonText[reason]) return reasonText[reason];
    if (e.isOffline) return t.common.offline;
    return e.message;
  }
  return e instanceof Error ? e.message : t.common.errorGeneric;
}

function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-hue transition-[width] duration-150" style={{ width: `${value}%` }} />
      </div>
      {label && <span className="num w-10 text-right text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}

/** Browser → bucket, directly, with progress. Resolves when the storage service accepted the file. */
type Upload = { url: string; fields: Record<string, string>; method?: "POST" | "PUT"; headers?: Record<string, string> };
function postToStorage(upload: Upload, file: File, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method ?? "POST", upload.url);
    for (const [k, v] of Object.entries(upload.headers ?? {})) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? s.upload.tooLarge : s.upload.storage)));
    xhr.onerror = () => reject(new Error(s.upload.network));
    xhr.onabort = () => reject(new Error(s.upload.network));
    if (upload.method === "PUT") return xhr.send(file);
    const form = new FormData();
    for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
    form.append("file", file); // must be last for a form upload
    xhr.send(form);
  });
}

/**
 * Upload one file: check type and size at once, ask the server for a presigned POST, send the file
 * straight to storage, then let the server verify it. Progress, success and errors show as one toast.
 */
async function uploadOne(qc: QueryClient, original: File, opts: { projectId?: string | null; replaceId?: string }) {
  let file = original;
  const id = toast.loading(fmt(s.upload.progress, { name: file.name }), { description: <ProgressBar value={0} /> });
  const fail = (msg: string) => toast.error(fmt(s.upload.failed, { name: file.name }), { id, description: msg });
  const type = fileTypeOfName(file.name);
  if (!type) return fail(s.upload.type);
  try {
    // Phase 1: compress photos/screenshots (other types pass straight through).
    file = await compressForUpload(original, (pct) =>
      toast.loading(fmt(s.upload.compressing, { name: original.name }), { id, description: <ProgressBar value={pct} label={`${Math.round(pct)} %`} /> }),
    );
    if (file.size > MAX_UPLOAD_BYTES) return fail(s.upload.tooLarge);
    // Some systems report no type for known extensions; the server still checks the first bytes.
    const mimeType = file.type || FILE_TYPES[type].mime;
    const { uploadId, upload } = await api<{ uploadId: string; upload: Upload }>("/api/documents/uploads", {
      method: "POST",
      json: { name: file.name, mimeType, size: file.size, projectId: opts.projectId ?? undefined, replaceId: opts.replaceId },
    });
    // Phase 2: upload, with its own percentage.
    await postToStorage(upload, file, (pct) =>
      toast.loading(fmt(s.upload.progress, { name: file.name }), { id, description: <ProgressBar value={pct} label={`${pct} %`} /> }),
    );
    toast.loading(fmt(s.upload.verifying, { name: file.name }), { id, description: <ProgressBar value={100} /> });
    const { document } = await api<{ document: DocumentDto }>(`/api/documents/${uploadId}/finalize`, {
      method: "POST",
      json: opts.replaceId ? { replaceId: opts.replaceId } : {},
    });
    const saved = original.size - file.size;
    toast.success(fmt(opts.replaceId ? s.upload.replaced : s.upload.done, { name: document.name }), {
      id,
      description: saved > 0 ? fmt(s.upload.saved, { from: formatBytes(original.size) ?? "", to: formatBytes(file.size) ?? "", pct: Math.round((saved / original.size) * 100) }) : undefined,
    });
  } catch (e) {
    fail(uploadError(e));
  } finally {
    qc.invalidateQueries({ queryKey: qk.documents() });
  }
}

export function useUpload() {
  const qc = useQueryClient();
  return (files: Iterable<File>, opts: { projectId?: string | null; replaceId?: string } = {}) =>
    Promise.all([...files].map((f) => uploadOne(qc, f, opts)));
}

/** True when a drag carries files (not text or a link). */
export const dragHasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
