import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

await vi.hoisted(async () => {
  const [{ mkdtemp }, { tmpdir }, { join }] = await Promise.all([import("node:fs/promises"), import("node:os"), import("node:path")]);
  process.env.STORAGE_DRIVER = "local";
  process.env.LOCAL_STORAGE_DIR = await mkdtemp(join(tmpdir(), "candid-docs-"));
  process.env.TOKEN_ENCRYPTION_KEY ||= "test-key";
});
const auth = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth/session", () => ({
  authMode: "dev",
  getAuthUserId: async () => auth.userId,
  getAuthProfile: async () => null,
}));

import { db } from "@/db";
import { documents } from "@/db/schema";
import { makeCtx } from "../../test/factory";
import type { Ctx } from "./context";
import {
  checkDeclared,
  createLink,
  createUpload,
  downloadUrl,
  finalizeUpload,
  listDocuments,
  magicMatches,
  purgeRemovedDocuments,
  setDocumentRemoved,
  updateDocument,
} from "./documents";
import { contentDisposition, localPut, storage, verifyLocalToken } from "./storage";
import { GET as downloadRoute } from "@/app/api/documents/[id]/download/route";

const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n");
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

/** Runs the real two-step flow against the local driver, writing `bytes` where the browser would. */
async function upload(ctx: Ctx, name: string, mimeType: string, bytes: Uint8Array, replaceId?: string) {
  const { uploadId, upload } = await createUpload(ctx, { name, mimeType, size: bytes.length, replaceId });
  const token = verifyLocalToken(new URL(upload.url, "http://x").searchParams.get("token"))!;
  expect(token.op).toBe("put");
  await localPut(token.key, bytes);
  return finalizeUpload(ctx, uploadId, { replaceId });
}

describe("document validation", () => {
  it("accepts allowed types and rejects others by extension, MIME and size", () => {
    expect(checkDeclared("Smlouva.pdf", "application/pdf", 10)).toBe("pdf");
    expect(checkDeclared("data.csv", "application/vnd.ms-excel", 10)).toBe("csv");
    expect(() => checkDeclared("setup.exe", "application/octet-stream", 10)).toThrow(/not allowed/);
    expect(() => checkDeclared("photo.png", "application/pdf", 10)).toThrow(/does not match/);
    expect(() => checkDeclared("big.pdf", "application/pdf", 25 * 1024 * 1024 + 1)).toThrow(/25 MB/);
    expect(() => checkDeclared("big.pdf", "application/pdf", 25 * 1024 * 1024 + 1)).toThrow(expect.objectContaining({ code: "too_large" }));
  });

  it("checks magic bytes", () => {
    expect(magicMatches("pdf", PDF)).toBe(true);
    expect(magicMatches("pdf", EXE)).toBe(false);
    expect(magicMatches("png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(magicMatches("jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(magicMatches("docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(magicMatches("csv", new TextEncoder().encode("jméno;částka\nŽluťoučký kůň;12\n"))).toBe(true);
    expect(magicMatches("csv", new Uint8Array([0x8a, 0x65, 0x3b, 0x31, 0x0a]))).toBe(true); // Windows-1250 "Še;1"
    expect(magicMatches("csv", EXE)).toBe(false);
  });

  it("encodes Czech file names for Content-Disposition", () => {
    expect(contentDisposition("Žádost č. 1.pdf", false)).toBe(
      `attachment; filename="Zadost c. 1.pdf"; filename*=UTF-8''%C5%BD%C3%A1dost%20%C4%8D.%201.pdf`,
    );
  });
});

describe("document uploads", () => {
  it("verifies and lists an uploaded file without exposing its storage key", async () => {
    const ctx = await makeCtx();
    const doc = await upload(ctx, "Nabídka.pdf", "application/pdf", PDF);
    expect(doc).toMatchObject({ name: "Nabídka.pdf", fileType: "pdf", sizeBytes: PDF.length, pinned: false });
    expect(doc).not.toHaveProperty("storageKey");
    expect((await listDocuments(ctx)).map((d) => d.id)).toEqual([doc.id]);
  });

  it("rejects a renamed executable: deletes the object and the pending row, returns 422", async () => {
    const ctx = await makeCtx();
    const { uploadId, upload: up } = await createUpload(ctx, { name: "invoice.pdf", mimeType: "application/pdf", size: EXE.length });
    const key = verifyLocalToken(new URL(up.url, "http://x").searchParams.get("token"))!.key;
    await localPut(key, EXE);
    const err = await finalizeUpload(ctx, uploadId).catch((e) => e);
    expect(err).toMatchObject({ code: "invalid", status: 422, details: { reason: "verification" } });
    expect(await storage().head(key)).toBeNull();
    expect(await db.select().from(documents).where(eq(documents.id, uploadId))).toHaveLength(0);
  });

  it("pending uploads are hidden until finalized", async () => {
    const ctx = await makeCtx();
    await createUpload(ctx, { name: "a.pdf", mimeType: "application/pdf", size: 5 });
    expect(await listDocuments(ctx)).toHaveLength(0);
  });

  it("replace swaps the object, bumps the version and deletes the old object", async () => {
    const ctx = await makeCtx();
    const doc = await upload(ctx, "Plan.pdf", "application/pdf", PDF);
    const [before] = await db.select().from(documents).where(eq(documents.id, doc.id));
    const next = await upload(ctx, "Plan v2.pdf", "application/pdf", new TextEncoder().encode("%PDF-2.0 longer"), doc.id);
    expect(next).toMatchObject({ id: doc.id, name: "Plan.pdf", version: doc.version + 1, sizeBytes: 15 });
    expect(await storage().head(before.storageKey!)).toBeNull();
    expect(await listDocuments(ctx)).toHaveLength(1);
  });

  it("purge deletes objects of documents removed more than 7 days ago", async () => {
    const ctx = await makeCtx();
    const doc = await upload(ctx, "Old.pdf", "application/pdf", PDF);
    const [row] = await db.select().from(documents).where(eq(documents.id, doc.id));
    await setDocumentRemoved(ctx, doc.id, true);
    await purgeRemovedDocuments({ now: new Date(Date.now() + 8 * 86_400_000) });
    expect(await storage().head(row.storageKey!)).toBeNull();
    expect(await db.select().from(documents).where(eq(documents.id, doc.id))).toHaveLength(0);
  });
});

describe("document links", () => {
  it("accepts http(s) and rejects other protocols", async () => {
    const ctx = await makeCtx();
    const d = await createLink(ctx, { name: "Spec", url: "https://example.com/spec" });
    expect(d).toMatchObject({ kind: "link", url: "https://example.com/spec" });
    for (const url of ["javascript:alert(1)", "ftp://example.com/x", "file:///etc/passwd", "data:text/html,hi", "not a url"]) {
      await expect(createLink(ctx, { name: "x", url })).rejects.toThrow();
    }
  });
});

describe("document access", () => {
  it("another workspace cannot read, rename, delete or download a document", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    const doc = await upload(a, "Private.pdf", "application/pdf", PDF);
    expect(await listDocuments(b)).toHaveLength(0);
    await expect(updateDocument(b, doc.id, { name: "Mine", version: doc.version })).rejects.toMatchObject({ code: "not_found" });
    await expect(setDocumentRemoved(b, doc.id, true)).rejects.toMatchObject({ code: "not_found" });
    await expect(downloadUrl(b, doc.id, { inline: false })).rejects.toMatchObject({ code: "not_found" });
    await expect(createUpload(b, { name: "x.pdf", mimeType: "application/pdf", size: 5, replaceId: doc.id })).rejects.toMatchObject({ code: "not_found" });
    expect((await listDocuments(a))[0].name).toBe("Private.pdf");
  });

  it("download route: 401 without a session, 404 for another workspace, 302 for a member", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    const doc = await upload(a, "Report.pdf", "application/pdf", PDF);
    const call = () =>
      downloadRoute(new NextRequest(`http://localhost/api/documents/${doc.id}/download?inline=1`), { params: Promise.resolve({ id: doc.id }) });

    auth.userId = null;
    expect((await call()).status).toBe(401);

    auth.userId = b.userId;
    expect((await call()).status).toBe(404);

    auth.userId = a.userId;
    const res = await call();
    expect(res.status).toBe(302);
    const location = res.headers.get("location")!;
    expect(location).toMatch(/^\/api\/storage-local\/object\?token=/);
    const token = verifyLocalToken(new URL(location, "http://x").searchParams.get("token"));
    expect(token).toMatchObject({ op: "get", contentType: "application/pdf" });
    expect(token && "disposition" in token && token.disposition).toMatch(/^inline;/);
  });
});

describe("security regressions (audit)", () => {
  it("a second POST with the same upload link cannot swap a verified file", async () => {
    const ctx = await makeCtx();
    const { uploadId, upload: up } = await createUpload(ctx, { name: "ok.pdf", mimeType: "application/pdf", size: PDF.length });
    const token = verifyLocalToken(new URL(up.url, "http://x").searchParams.get("token"))!;
    await localPut(token.key, PDF);
    const doc = await finalizeUpload(ctx, uploadId);
    await localPut(token.key, EXE); // replay of the presigned upload after verification
    const [row] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(row.storageKey).not.toBe(token.key);
    expect(await storage().readStart(row.storageKey!, 4)).toEqual(PDF.subarray(0, 4));
  });
});
