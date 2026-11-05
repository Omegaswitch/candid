import "server-only";
import { and, asc, desc, eq, getTableColumns, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { documents, favorites, projects, type Document } from "@/db/schema";
import { FILE_TYPES, MAX_UPLOAD_BYTES, PREVIEWABLE, extensionOf, fileTypeOfMime, fileTypeOfName, type FileType } from "@/components/documents/file-types";
import { logActivity } from "./activity";
import type { Ctx } from "./context";
import { AppError, conflict, notFound } from "./errors";
import { loadProject } from "./projects";
import { extractPdfText, isPdf } from "./pdf-text";
import { newIncomingKey, newStorageKey, storage, type PresignedUpload } from "./storage";

/** What the browser sees. Never includes `storageKey`. */
export type DocumentDto = {
  id: string;
  kind: "file" | "link";
  name: string;
  url: string | null; // links only
  fileType: FileType | null; // files only
  mimeType: string | null;
  sizeBytes: number | null;
  projectId: string | null;
  projectName: string | null;
  position: number;
  version: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

/** `reason` lets the client show a precise message: type | too_large | verification | missing. */
const reject = (code: "unsupported" | "too_large" | "invalid", reason: string, message: string) => new AppError(code, message, { reason });

const name = z.string().trim().min(1).max(255);
const projectId = z.uuid().nullish();

export const uploadInput = z.object({
  name,
  mimeType: z.string().max(200),
  size: z.int().min(0),
  projectId,
  replaceId: z.uuid().optional(),
});
export const linkInput = z.object({
  name,
  url: z
    .url({ protocol: /^https?$/, error: "Use a web address that starts with http:// or https://" })
    .max(2000),
  projectId,
});
export const documentPatch = z.object({ name: name.optional(), projectId, version: z.int() });

// ---------------------------------------------------------------- validation

/** Throws when the declared name/MIME/size are not acceptable. Returns the canonical type. */
export function checkDeclared(fileName: string, mimeType: string, size: number): FileType {
  const type = fileTypeOfName(fileName);
  if (!type) throw reject("unsupported", "type", `“.${extensionOf(fileName) || "?"}” files are not allowed. Upload PDF, DOCX, XLSX, CSV, PNG or JPEG.`);
  if (!FILE_TYPES[type].declared.includes(mimeType.toLowerCase())) {
    throw reject("unsupported", "type", `The file says it is “${mimeType || "unknown"}”, which does not match its .${extensionOf(fileName)} name.`);
  }
  if (size > MAX_UPLOAD_BYTES) throw reject("too_large", "too_large", "The file is larger than 25 MB.");
  if (size < 1) throw reject("invalid", "verification", "The file is empty.");
  return type;
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

/** Plausible text: no NUL, and valid UTF-8 or plausible Windows-1250 (no control or unassigned bytes). */
function looksLikeText(b: Uint8Array) {
  if (b.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b, { stream: true });
    return true;
  } catch {
    const unassigned = new Set([0x81, 0x83, 0x88, 0x90, 0x98]);
    return b.every((c) => (c >= 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) && c !== 0x7f && !unassigned.has(c));
  }
}

/** Checks the first bytes of a stored file against its claimed type. */
export function magicMatches(type: FileType, head: Uint8Array) {
  switch (type) {
    case "pdf":
      return startsWith(head, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case "docx":
    case "xlsx":
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]); // zip
    case "png":
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpeg":
      return startsWith(head, [0xff, 0xd8, 0xff]);
    case "csv":
      return looksLikeText(head.subarray(0, 4096));
  }
}

// ---------------------------------------------------------------- reads

/** Every column except the (large) extracted text, which only search reads. */
const { contentText: _contentText, ...docColumns } = getTableColumns(documents);
type DocumentRow = Omit<Document, "contentText">;

function toDto(d: DocumentRow, extra: { pinned: boolean; projectName: string | null }): DocumentDto {
  return {
    id: d.id,
    kind: d.kind,
    name: d.name,
    url: d.kind === "link" ? d.url : null,
    fileType: d.kind === "file" ? fileTypeOfMime(d.mimeType) : null,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    projectId: d.projectId,
    projectName: extra.projectName,
    position: d.position,
    version: d.version,
    pinned: extra.pinned,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

const visible = or(eq(documents.kind, "link"), isNotNull(documents.uploadedAt));

/** Workspace documents (uploaded files and links), not removed, in shelf order. */
export async function listDocuments(ctx: Ctx, opts: { projectId?: string; ids?: string[] } = {}): Promise<DocumentDto[]> {
  const where: SQL[] = [eq(documents.workspaceId, ctx.workspaceId), isNull(documents.deletedAt), visible!];
  if (opts.projectId) where.push(eq(documents.projectId, opts.projectId));
  if (opts.ids) where.push(inArray(documents.id, opts.ids));
  const rows = await db
    .select({
      d: docColumns,
      projectName: projects.name,
      pinned: sql<boolean>`exists (select 1 from ${favorites} f where f.membership_id = ${ctx.membershipId}
        and f.kind = 'document' and f.entity_id = ${documents.id})`,
    })
    .from(documents)
    .leftJoin(projects, and(eq(projects.id, documents.projectId), eq(projects.workspaceId, ctx.workspaceId)))
    .where(and(...where))
    .orderBy(asc(documents.position), desc(documents.createdAt));
  return rows.map(({ d, ...extra }) => toDto(d, extra));
}

async function getDto(ctx: Ctx, id: string) {
  const [d] = await listDocuments(ctx, { ids: [id] });
  if (!d) throw notFound("Document");
  return d;
}

/** Any row of this workspace, including pending and removed ones. */
async function loadDocument(ctx: Ctx, id: string) {
  const [d] = await db
    .select(docColumns)
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.workspaceId, ctx.workspaceId)));
  if (!d) throw notFound("Document");
  return d;
}

async function loadLive(ctx: Ctx, id: string) {
  const d = await loadDocument(ctx, id);
  if (d.deletedAt || (d.kind === "file" && !d.uploadedAt)) throw notFound("Document");
  return d;
}

async function topPosition(ctx: Ctx) {
  const [{ min }] = await db
    .select({ min: sql<number>`coalesce(min(${documents.position}), 1)` })
    .from(documents)
    .where(eq(documents.workspaceId, ctx.workspaceId));
  return min - 1;
}

// ---------------------------------------------------------------- uploads

const MAX_PENDING_UPLOADS = 20;

/**
 * Step 1 of an upload. Creates a pending row (hidden until finalized) with a fresh storage key and
 * returns a presigned POST for the browser. For a replacement the pending row only carries the new
 * object; finalize with `replaceId` moves it onto the existing document.
 */
export async function createUpload(
  ctx: Ctx,
  raw: z.input<typeof uploadInput>,
): Promise<{ uploadId: string; upload: PresignedUpload }> {
  const input = uploadInput.parse(raw);
  const type = checkDeclared(input.name, input.mimeType, input.size);
  // shortcut: a per-member cap instead of real rate limiting; add a limiter if abuse appears.
  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(eq(documents.createdBy, ctx.membershipId), isNull(documents.uploadedAt), eq(documents.kind, "file"), isNull(documents.deletedAt)));
  if (pending >= MAX_PENDING_UPLOADS) throw new AppError("too_large", "Too many uploads in progress. Wait for them to finish and try again.");
  if (input.replaceId) {
    const target = await loadLive(ctx, input.replaceId);
    if (target.kind !== "file") throw new AppError("invalid", "Only uploaded files can be replaced");
  }
  if (input.projectId) await loadProject(ctx, input.projectId);
  const key = newIncomingKey(ctx.workspaceId);
  const [row] = await db
    .insert(documents)
    .values({
      workspaceId: ctx.workspaceId,
      projectId: input.replaceId ? null : (input.projectId ?? null),
      kind: "file",
      name: input.name,
      storageKey: key,
      mimeType: FILE_TYPES[type].mime,
      sizeBytes: input.size,
      position: await topPosition(ctx),
      createdBy: ctx.membershipId,
    })
    .returning();
  const upload = await storage().presignUpload(key, { contentType: FILE_TYPES[type].mime, maxBytes: MAX_UPLOAD_BYTES, size: input.size });
  return { uploadId: row.id, upload };
}

/**
 * Step 2: the browser has uploaded the object. Verify its size and first bytes; on failure the
 * object and the pending row are deleted. With `replaceId` the verified object replaces that
 * document's file (version +1) and the old object is deleted.
 */
export async function finalizeUpload(ctx: Ctx, uploadId: string, opts: { replaceId?: string } = {}): Promise<DocumentDto> {
  const pending = await loadDocument(ctx, uploadId);
  if (pending.kind !== "file" || pending.uploadedAt || !pending.storageKey) throw notFound("Upload");
  let key = pending.storageKey;
  const fail = async (e: AppError) => {
    await storage().remove(key).catch(() => {});
    await db.delete(documents).where(eq(documents.id, pending.id));
    return e;
  };

  const type = fileTypeOfName(pending.name)!;
  // Move off the presigned key before checking: a second POST with the same upload policy can then
  // never swap the object after it has been verified.
  if (!(await storage().head(key))) throw await fail(reject("invalid", "missing", "The upload did not arrive. Try again."));
  const verifiedKey = newStorageKey(ctx.workspaceId);
  await storage().move(key, verifiedKey);
  key = verifiedKey;
  await db.update(documents).set({ storageKey: key }).where(eq(documents.id, pending.id));
  const head = await storage().head(key);
  if (!head) throw await fail(reject("invalid", "missing", "The upload did not arrive. Try again."));
  if (head.size > MAX_UPLOAD_BYTES) throw await fail(reject("too_large", "too_large", "The file is larger than 25 MB."));
  if (head.size < 1) throw await fail(reject("invalid", "verification", "The file is empty."));
  const bytes = await storage().readStart(key, 4096);
  if (!magicMatches(type, bytes)) {
    throw await fail(reject("invalid", "verification", `The file’s contents are not a valid ${type.toUpperCase()} file, so it was not kept.`));
  }

  const text = await textFields(key, pending.mimeType, head.size);

  if (!opts.replaceId) {
    await db.update(documents).set({ uploadedAt: new Date(), sizeBytes: head.size, updatedAt: new Date(), ...text }).where(eq(documents.id, pending.id));
    await logActivity(ctx, {
      projectId: pending.projectId,
      entityType: "document",
      entityId: pending.id,
      action: "uploaded",
      data: { name: pending.name, sizeBytes: head.size },
    });
    return getDto(ctx, pending.id);
  }

  const target = await loadLive(ctx, opts.replaceId).catch(async (e) => {
    throw await fail(e);
  });
  if (target.kind !== "file") throw await fail(new AppError("invalid", "Only uploaded files can be replaced"));
  await db.transaction(async (tx) => {
    await tx.delete(documents).where(eq(documents.id, pending.id));
    await tx
      .update(documents)
      .set({ storageKey: key, mimeType: pending.mimeType, sizeBytes: head.size, ...text, version: sql`${documents.version} + 1`, updatedAt: new Date() })
      .where(eq(documents.id, target.id));
  });
  if (target.storageKey) await storage().remove(target.storageKey).catch((e) => console.error("Could not delete replaced object", e));
  await logActivity(ctx, {
    projectId: target.projectId,
    entityType: "document",
    entityId: target.id,
    action: "replaced",
    data: { name: target.name, sizeBytes: head.size },
  });
  return getDto(ctx, target.id);
}

/**
 * Search text for a verified object. Never throws: an upload must not fail because its text could
 * not be read. A storage read failure leaves `textExtractedAt` null so the backfill retries it; a
 * PDF that cannot be parsed (encrypted, corrupt, timeout) is marked done with no text.
 */
export async function textFields(
  key: string,
  mimeType: string | null,
  size: number,
): Promise<{ contentText: string | null; textExtractedAt: Date | null }> {
  if (!isPdf(mimeType)) return { contentText: null, textExtractedAt: null };
  let bytes: Uint8Array;
  try {
    bytes = await storage().readStart(key, size);
  } catch (e) {
    console.error("Could not read PDF for text extraction", e);
    return { contentText: null, textExtractedAt: null };
  }
  try {
    const text = await extractPdfText(bytes);
    return { contentText: text || null, textExtractedAt: new Date() };
  } catch (e) {
    console.warn("PDF text extraction failed", e instanceof Error ? e.message : e);
    return { contentText: null, textExtractedAt: new Date() };
  }
}

// ---------------------------------------------------------------- links and edits

export async function createLink(ctx: Ctx, raw: z.input<typeof linkInput>) {
  const input = linkInput.parse(raw);
  if (input.projectId) await loadProject(ctx, input.projectId);
  const [d] = await db
    .insert(documents)
    .values({
      workspaceId: ctx.workspaceId,
      projectId: input.projectId ?? null,
      kind: "link",
      name: input.name,
      url: input.url,
      position: await topPosition(ctx),
      createdBy: ctx.membershipId,
    })
    .returning();
  await logActivity(ctx, { projectId: d.projectId, entityType: "document", entityId: d.id, action: "added", data: { name: d.name, kind: "link" } });
  return getDto(ctx, d.id);
}

export async function updateDocument(ctx: Ctx, id: string, raw: z.input<typeof documentPatch>) {
  const { version, ...patch } = documentPatch.parse(raw);
  const before = await loadLive(ctx, id);
  if (patch.projectId) await loadProject(ctx, patch.projectId);
  const [d] = await db
    .update(documents)
    .set({ ...patch, version: sql`${documents.version} + 1`, updatedAt: new Date() })
    .where(and(eq(documents.id, id), eq(documents.workspaceId, ctx.workspaceId), eq(documents.version, version), isNull(documents.deletedAt)))
    .returning();
  if (!d) throw conflict(await getDto(ctx, id));
  if (patch.name !== undefined && patch.name !== before.name) {
    await logActivity(ctx, { projectId: d.projectId, entityType: "document", entityId: id, action: "renamed", data: { from: before.name, to: d.name } });
  }
  if (patch.projectId !== undefined && patch.projectId !== before.projectId) {
    await logActivity(ctx, {
      projectId: d.projectId ?? before.projectId,
      entityType: "document",
      entityId: id,
      action: d.projectId ? "associated" : "unassociated",
      data: { name: d.name },
    });
  }
  return getDto(ctx, id);
}

/** Soft delete so Undo can restore it; `purgeRemovedDocuments` deletes the object later. */
export async function setDocumentRemoved(ctx: Ctx, id: string, removed: boolean) {
  const d = await loadDocument(ctx, id);
  if (d.kind === "file" && !d.uploadedAt) throw notFound("Document");
  await db
    .update(documents)
    .set({ deletedAt: removed ? new Date() : null, version: sql`${documents.version} + 1`, updatedAt: new Date() })
    .where(eq(documents.id, id));
  await logActivity(ctx, { projectId: d.projectId, entityType: "document", entityId: id, action: removed ? "removed" : "restored", data: { name: d.name } });
  return removed ? undefined : getDto(ctx, id);
}

export async function reorderDocuments(ctx: Ctx, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    const owned = await tx
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.workspaceId, ctx.workspaceId), inArray(documents.id, orderedIds)));
    if (owned.length !== new Set(orderedIds).size) throw notFound("Document");
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(documents).set({ position: i }).where(and(eq(documents.id, id), eq(documents.workspaceId, ctx.workspaceId)));
    }
  });
}

/** Where the browser should go to open this document: a 60-second signed URL, or the external link. */
export async function downloadUrl(ctx: Ctx, id: string, opts: { inline: boolean }) {
  const d = await loadLive(ctx, id);
  if (d.kind === "link") return d.url!;
  const type = fileTypeOfMime(d.mimeType);
  // A renamed file keeps its real extension so it opens in the right app.
  const filename = type && !FILE_TYPES[type].exts.includes(extensionOf(d.name)) ? `${d.name}.${FILE_TYPES[type].exts[0]}` : d.name;
  return storage().downloadUrl(d.storageKey!, {
    filename,
    contentType: d.mimeType ?? "application/octet-stream",
    // Only types the browser renders safely are ever served inline.
    inline: opts.inline && !!type && PREVIEWABLE.includes(type),
  });
}

// ---------------------------------------------------------------- purge

/**
 * Deletes the stored objects and rows of documents removed more than `days` ago, and of uploads
 * that never finished (pending for over a day). Workspace-independent maintenance: it is NOT run
 * automatically — call it from a scheduled job (e.g. a daily Vercel Cron hitting a protected
 * route, or a script). Returns how many rows were purged.
 */
export async function purgeRemovedDocuments(opts: { days?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const removedBefore = new Date(now.getTime() - (opts.days ?? 10) * 86_400_000);
  const pendingBefore = new Date(now.getTime() - 86_400_000);
  const rows = await db
    .select({ id: documents.id, storageKey: documents.storageKey })
    .from(documents)
    .where(
      or(
        lt(documents.deletedAt, removedBefore),
        and(eq(documents.kind, "file"), isNull(documents.uploadedAt), lt(documents.createdAt, pendingBefore)),
      ),
    )
    .limit(500);
  let purged = 0;
  for (const r of rows) {
    try {
      if (r.storageKey) await storage().remove(r.storageKey);
      await db.delete(documents).where(eq(documents.id, r.id));
      await db.delete(favorites).where(and(eq(favorites.kind, "document"), eq(favorites.entityId, r.id)));
      purged++;
    } catch (e) {
      console.error("Could not purge document", r.id, e);
    }
  }
  return { purged };
}

// ---------------------------------------------------------------- usage

/** Storage used by this workspace: live files, plus removed ones still kept until the 7-day purge. */
export async function storageUsage(ctx: Ctx) {
  const [row] = await db
    .select({
      files: sql<number>`count(*) filter (where ${documents.deletedAt} is null)::int`,
      bytes: sql<number>`coalesce(sum(${documents.sizeBytes}) filter (where ${documents.deletedAt} is null), 0)::float8`,
      removedBytes: sql<number>`coalesce(sum(${documents.sizeBytes}) filter (where ${documents.deletedAt} is not null), 0)::float8`,
    })
    .from(documents)
    .where(and(eq(documents.workspaceId, ctx.workspaceId), eq(documents.kind, "file"), isNotNull(documents.uploadedAt)));
  return row;
}
