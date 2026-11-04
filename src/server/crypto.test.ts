import { describe, expect, it } from "vitest";
import { decrypt, encrypt, sign, verifySignature } from "./crypto";

describe("token encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("ya29.secret-token");
    const b = encrypt("ya29.secret-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret");
    expect(decrypt(a)).toBe("ya29.secret-token");
    expect(decrypt(b)).toBe("ya29.secret-token");
  });

  it("rejects a tampered ciphertext or tag", () => {
    const [v, iv, tag, ct] = encrypt("refresh-token").split(".");
    const flipped = ct.slice(0, -2) + (ct.at(-2) === "A" ? "B" : "A") + ct.at(-1);
    expect(() => decrypt([v, iv, tag, flipped].join("."))).toThrow();
    expect(() => decrypt([v, iv, "A".repeat(tag.length), ct].join("."))).toThrow();
  });

  it("refuses a key that is not 32 bytes", () => {
    const old = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(16).toString("base64");
    try {
      expect(() => encrypt("x")).toThrow(/32/);
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = old;
    }
  });

  it("signs and verifies", () => {
    const s = sign("payload");
    expect(verifySignature("payload", s)).toBe(true);
    expect(verifySignature("payload2", s)).toBe(false);
    expect(verifySignature("payload", s.slice(1))).toBe(false);
  });
});
