import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// AES-256-GCM for OAuth tokens at rest. Format: v1.<iv>.<tag>.<ciphertext>, each base64url.
// A fresh 12-byte IV per value; the auth tag makes any tampering fail decryption.

function key(): Buffer {
  const k = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 random bytes, base64-encoded");
  return k;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(value: string): string {
  const [v, iv, tag, ct] = value.split(".");
  if (v !== "v1" || !iv || !tag || ct === undefined) throw new Error("Unrecognised encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

/** HMAC-SHA256 with a key derived from the encryption key, so the two uses never share a key. */
export function sign(data: string): string {
  const k = createHmac("sha256", key()).update("candid:hmac").digest();
  return createHmac("sha256", k).update(data).digest("base64url");
}

export function verifySignature(data: string, signature: string): boolean {
  const a = Buffer.from(sign(data));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
