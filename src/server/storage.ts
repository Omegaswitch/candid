import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { assertLocalStandInAllowed } from "@/lib/auth/stand-in";

/**
 * Private object storage. Two drivers, chosen by STORAGE_DRIVER:
 * - `s3`: any S3-compatible private bucket (Cloudflare R2, AWS S3, Backblaze B2). The browser uploads
 *   straight to the bucket with a presigned POST and downloads through 60-second presigned GETs.
 * - `local`: a development stand-in that keeps files under LOCAL_STORAGE_DIR and signs its own
 *   short-lived URLs to /api/storage-local/*. It refuses to run on Vercel.
 * Credentials and object keys stay on the server.
 */
/** POST = form upload (local driver); PUT = raw body with the signed headers (S3/R2: R2 has no presigned POST). */
export type PresignedUpload = { url: string; fields: Record<string, string>; method?: "POST" | "PUT"; headers?: Record<string, string> };
export type Storage = {
  presignUpload(key: string, opts: { contentType: string; maxBytes: number; size: number }): Promise<PresignedUpload>;
  downloadUrl(key: string, opts: { filename: string; contentType: string; inline: boolean }): Promise<string>;
  /** Size of the stored object, or null when it does not exist. */
  head(key: string): Promise<{ size: number } | null>;
  /** The first `n` bytes (fewer if the object is shorter). */
  readStart(key: string, n: number): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
  /** Moves an object to a new key (the old key stops existing). */
  move(from: string, to: string): Promise<void>;
};

export const UPLOAD_EXPIRES_S = 5 * 60;
export const DOWNLOAD_EXPIRES_S = 60;

export const newStorageKey = (workspaceId: string) => `ws/${workspaceId}/${randomUUID()}`;
/** Browsers upload here; finalize moves the object to a fresh `ws/…` key no upload policy covers.
 *  Add a bucket lifecycle rule expiring `incoming/` after 1 day to clear abandoned uploads. */
export const newIncomingKey = (workspaceId: string) => `incoming/ws/${workspaceId}/${randomUUID()}`;

/** RFC 6266 / 5987: an ASCII fallback plus a UTF-8 `filename*`, so Czech names survive. */
export function contentDisposition(filename: string, inline: boolean) {
  const ascii = filename.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

let instance: Storage | null = null;
export function storage(): Storage {
  if (instance) return instance;
  const driver = process.env.STORAGE_DRIVER ?? "s3";
  if (driver === "local") instance = localDriver();
  else if (driver === "s3") instance = s3Storage();
  else throw new Error(`Unknown STORAGE_DRIVER "${driver}" (use "s3" or "local")`);
  return instance;
}

// ---------------------------------------------------------------- s3

function s3Storage(): Storage {
  const env = (name: string) => {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is required for STORAGE_DRIVER=s3`);
    return v;
  };
  const bucket = env("S3_BUCKET");
  // Loaded lazily so the AWS SDK is not pulled into routes that never touch storage.
  const client = import("@aws-sdk/client-s3").then(
    ({ S3Client }) =>
      new S3Client({
        region: process.env.S3_REGION || "auto",
        endpoint: process.env.S3_ENDPOINT || undefined,
        forcePathStyle: !!process.env.S3_ENDPOINT,
        credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") },
      }),
  );
  const s3 = () => Promise.all([client, import("@aws-sdk/client-s3")]);

  return {
    async presignUpload(key, { contentType, maxBytes, size }) {
      // Presigned PUT (works on AWS S3 and Cloudflare R2). Type and exact length are signed, so the
      // browser cannot send another type or size; finalize still re-checks size and content.
      const [[c, { PutObjectCommand }], { getSignedUrl }] = await Promise.all([s3(), import("@aws-sdk/s3-request-presigner")]);
      const length = Math.min(size, maxBytes);
      const url = await getSignedUrl(c, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: length }), {
        expiresIn: UPLOAD_EXPIRES_S,
        signableHeaders: new Set(["content-type", "content-length"]),
      });
      return { url, fields: {}, method: "PUT", headers: { "Content-Type": contentType } };
    },
    async downloadUrl(key, { filename, contentType, inline }) {
      const [[c, { GetObjectCommand }], { getSignedUrl }] = await Promise.all([s3(), import("@aws-sdk/s3-request-presigner")]);
      const cmd = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(filename, inline),
        ResponseContentType: contentType,
      });
      return getSignedUrl(c, cmd, { expiresIn: DOWNLOAD_EXPIRES_S });
    },
    async head(key) {
      const [c, { HeadObjectCommand }] = await s3();
      try {
        const out = await c.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: out.ContentLength ?? 0 };
      } catch (e) {
        const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404) return null;
        throw e;
      }
    },
    async readStart(key, n) {
      const [c, { GetObjectCommand }] = await s3();
      const out = await c.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${n - 1}` }));
      return out.Body ? await out.Body.transformToByteArray() : new Uint8Array();
    },
    async remove(key) {
      const [c, { DeleteObjectCommand }] = await s3();
      await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async move(from, to) {
      const [c, { CopyObjectCommand, DeleteObjectCommand }] = await s3();
      await c.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${bucket}/${from.split("/").map(encodeURIComponent).join("/")}`, Key: to }));
      await c.send(new DeleteObjectCommand({ Bucket: bucket, Key: from }));
    },
  };
}

// ---------------------------------------------------------------- local (development only)

export type LocalToken =
  | { op: "put"; key: string; contentType: string; maxBytes: number; exp: number }
  | { op: "get"; key: string; contentType: string; disposition: string; exp: number };

const hmacKey = () => {
  const k = process.env.TOKEN_ENCRYPTION_KEY;
  if (!k) throw new Error("TOKEN_ENCRYPTION_KEY is required for STORAGE_DRIVER=local");
  return k;
};
// A key derived for this purpose only, never the raw encryption key.
const derivedKey = () => createHmac("sha256", hmacKey()).update("candid:storage-local:v1").digest();
const sign = (payload: string) => createHmac("sha256", derivedKey()).update(payload).digest("base64url");

export function signLocalToken(t: LocalToken) {
  const payload = Buffer.from(JSON.stringify(t)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Returns the token's claims, or null when the signature is wrong or it has expired. */
export function verifyLocalToken(token: string | null): LocalToken | null {
  const [payload, mac] = (token ?? "").split(".");
  if (!payload || !mac) return null;
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const t = JSON.parse(Buffer.from(payload, "base64url").toString()) as LocalToken;
  return t.exp > Date.now() ? t : null;
}

function localRoot() {
  return resolve(process.env.LOCAL_STORAGE_DIR || ".storage");
}

/** Resolves a key inside the storage root; never lets a key escape it. */
export function localPath(key: string) {
  const root = localRoot();
  const p = resolve(root, key);
  if (!p.startsWith(root + sep)) throw new Error("Invalid storage key");
  return p;
}

export async function localPut(key: string, bytes: Uint8Array) {
  const p = localPath(key);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, bytes);
}

function localDriver(): Storage {
  assertLocalStandInAllowed("STORAGE_DRIVER=local");
  hmacKey();
  const exp = (s: number) => Date.now() + s * 1000;
  return {
    async presignUpload(key, { contentType, maxBytes }) {
      const token = signLocalToken({ op: "put", key, contentType, maxBytes, exp: exp(UPLOAD_EXPIRES_S) });
      return { url: `/api/storage-local/upload?token=${encodeURIComponent(token)}`, fields: { "Content-Type": contentType } };
    },
    async downloadUrl(key, { filename, contentType, inline }) {
      const token = signLocalToken({ op: "get", key, contentType, disposition: contentDisposition(filename, inline), exp: exp(DOWNLOAD_EXPIRES_S) });
      return `/api/storage-local/object?token=${encodeURIComponent(token)}`;
    },
    async head(key) {
      try {
        return { size: (await stat(localPath(key))).size };
      } catch {
        return null;
      }
    },
    async readStart(key, n) {
      const f = await open(localPath(key));
      try {
        const buf = new Uint8Array(n);
        const { bytesRead } = await f.read(buf, 0, n, 0);
        return buf.subarray(0, bytesRead);
      } finally {
        await f.close();
      }
    },
    async remove(key) {
      await rm(localPath(key), { force: true });
    },
    async move(from, to) {
      const dest = localPath(to);
      await mkdir(dirname(dest), { recursive: true });
      await rename(localPath(from), dest);
    },
  };
}
