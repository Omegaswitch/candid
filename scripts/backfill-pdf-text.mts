/**
 * Extracts search text for uploaded PDFs that have none yet (documents.text_extracted_at is null),
 * e.g. files uploaded before full-text search existed. Safe to re-run; processes in small batches.
 *
 *   npm run db:backfill-pdf-text            # DATABASE_URL + STORAGE_DRIVER (and S3_* when s3) from .env
 *   npm run db:backfill-pdf-text -- --dry   # only count what would be processed
 *
 * Refuses a non-local database unless BACKFILL_CONFIRM=1 is set.
 * Runs under `--conditions=react-server` so the server modules' `server-only` guard allows it.
 */
import "dotenv/config";
import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../src/db/schema";
import { extractPdfText } from "../src/server/pdf-text";
import { storage } from "../src/server/storage";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const host = new URL(url).hostname;
if (!/^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(host) && process.env.BACKFILL_CONFIRM !== "1") {
  console.error(`Refusing to backfill a non-local database (${host}). Set BACKFILL_CONFIRM=1 if you really mean it.`);
  process.exit(1);
}
const dry = process.argv.includes("--dry");
const BATCH = 20;

const pool = new Pool({ connectionString: url, enableChannelBinding: /channel_binding=require/.test(url) });
const db = drizzle(pool, { schema: s });
const d = s.documents;
const todo = and(
  eq(d.kind, "file"),
  eq(d.mimeType, "application/pdf"),
  isNotNull(d.uploadedAt),
  isNotNull(d.storageKey),
  isNull(d.deletedAt),
  isNull(d.textExtractedAt),
);

const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(d).where(todo);
console.log(`${n} PDF(s) without extracted text.`);
let ok = 0;
let empty = 0;
let failed = 0;
let skipped = 0;
if (!dry) {
  // Keyset pagination by id: rows that fail to read keep a null timestamp and must not loop forever.
  let after = "00000000-0000-0000-0000-000000000000";
  for (;;) {
    const rows = await db
      .select({ id: d.id, name: d.name, key: d.storageKey, size: d.sizeBytes })
      .from(d)
      .where(and(todo, gt(d.id, after)))
      .orderBy(asc(d.id))
      .limit(BATCH);
    if (!rows.length) break;
    for (const r of rows) {
      after = r.id;
      let bytes: Uint8Array;
      try {
        const head = await storage().head(r.key!);
        if (!head) throw new Error("object missing");
        bytes = await storage().readStart(r.key!, head.size);
      } catch (e) {
        // Left unmarked so a later run retries it.
        skipped++;
        console.warn(`skip ${r.id} (${r.name}): ${e instanceof Error ? e.message : e}`);
        continue;
      }
      let text: string | null = null;
      try {
        text = (await extractPdfText(bytes)) || null;
        if (text) ok++;
        else empty++;
      } catch (e) {
        failed++;
        console.warn(`unreadable ${r.id} (${r.name}): ${e instanceof Error ? e.message : e}`);
      }
      // Only rows still unprocessed: an upload replacing the file meanwhile wrote its own text.
      await db
        .update(d)
        .set({ contentText: text, textExtractedAt: new Date() })
        .where(and(eq(d.id, r.id), eq(d.storageKey, r.key!), isNull(d.textExtractedAt)));
    }
  }
  console.log(`Done: ${ok} with text, ${empty} without a text layer, ${failed} unreadable, ${skipped} skipped (retry later).`);
}
await pool.end();
