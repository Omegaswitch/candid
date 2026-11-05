// No "server-only" here: scripts/backfill-pdf-text.mts imports this module outside Next.
import { getDocumentProxy } from "unpdf";

/** Stored text is capped so one huge PDF cannot bloat the row or slow every search scan. */
export const MAX_PDF_TEXT_CHARS = 200_000;
/** Extraction runs inside the upload request; give up rather than hold it open. */
export const PDF_EXTRACT_TIMEOUT_MS = 20_000;

/** Collapses all whitespace (incl. NBSP and line breaks) to single spaces and trims. */
export function normalizeText(s: string) {
  return s.replace(/[\s ​﻿]+/g, " ").trim();
}

/**
 * Plain text of a PDF, whitespace-normalized and capped at `maxChars`. Throws when the bytes are
 * not a readable PDF (encrypted, corrupt) or extraction exceeds `timeoutMs`. Scanned PDFs without a
 * text layer give "".
 */
export async function extractPdfText(
  bytes: Uint8Array,
  opts: { maxChars?: number; timeoutMs?: number } = {},
): Promise<string> {
  const maxChars = opts.maxChars ?? MAX_PDF_TEXT_CHARS;
  const timeoutMs = opts.timeoutMs ?? PDF_EXTRACT_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`PDF text extraction timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  // pdf.js may detach the buffer it is given; never hand it the caller's bytes.
  const work = (async () => {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    try {
      let out = "";
      for (let i = 1; i <= pdf.numPages && out.length < maxChars; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : "") : ""))
          .join("");
        page.cleanup();
        out = normalizeText(`${out} ${pageText}`);
      }
      return out.slice(0, maxChars).trimEnd();
    } finally {
      await pdf.loadingTask.destroy().catch(() => {});
    }
  })();
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export const isPdf = (mimeType: string | null) => mimeType === "application/pdf";
