// Shared by the server (validation) and the browser (instant feedback before uploading).
// The server re-checks everything, including the file's first bytes after upload.

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type FileType = "pdf" | "docx" | "xlsx" | "csv" | "png" | "jpeg";

export const FILE_TYPES: Record<FileType, { exts: string[]; mime: string; declared: string[] }> = {
  pdf: { exts: ["pdf"], mime: "application/pdf", declared: ["application/pdf"] },
  docx: {
    exts: ["docx"],
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    declared: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  },
  xlsx: {
    exts: ["xlsx"],
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    declared: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  },
  // Windows browsers declare .csv as application/vnd.ms-excel.
  csv: { exts: ["csv"], mime: "text/csv", declared: ["text/csv", "application/vnd.ms-excel", "text/plain"] },
  png: { exts: ["png"], mime: "image/png", declared: ["image/png"] },
  jpeg: { exts: ["jpg", "jpeg"], mime: "image/jpeg", declared: ["image/jpeg"] },
};

export const ACCEPT = Object.values(FILE_TYPES)
  .flatMap((t) => t.exts.map((e) => `.${e}`))
  .join(",");

export const extensionOf = (name: string) => name.match(/\.([^.]+)$/)?.[1]?.toLowerCase() ?? "";

export function fileTypeOfName(name: string): FileType | null {
  const ext = extensionOf(name);
  return (Object.keys(FILE_TYPES) as FileType[]).find((k) => FILE_TYPES[k].exts.includes(ext)) ?? null;
}

export function fileTypeOfMime(mime: string | null | undefined): FileType | null {
  return (Object.keys(FILE_TYPES) as FileType[]).find((k) => FILE_TYPES[k].mime === mime) ?? null;
}

/** Types the browser can show inline in the preview. */
export const PREVIEWABLE: FileType[] = ["pdf", "png", "jpeg"];

export function formatBytes(n: number | null | undefined) {
  if (n == null) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
