import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { safeReturnTo } from "./google";
import { assertSameOrigin } from "./http";

describe("Google returnTo", () => {
  it("only allows same-site paths", () => {
    expect(safeReturnTo("/settings/integrations?x=1")).toBe("/settings/integrations?x=1");
    for (const evil of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "https://evil.example", "/%09/x\\y"]) {
      expect(new URL(safeReturnTo(evil), "https://app.test").origin).toBe("https://app.test");
    }
  });
});

describe("cross-site writes", () => {
  const req = (method: string, headers: Record<string, string>) => new NextRequest("https://app.test/api/x", { method, headers });
  it("refuses a foreign Origin or a cross-site fetch", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "https://evil.example" }))).toThrow(/Cross-site/);
    expect(() => assertSameOrigin(req("PATCH", { "sec-fetch-site": "cross-site" }))).toThrow(/Cross-site/);
  });
  it("allows same-origin writes and any read", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "https://app.test" }))).not.toThrow();
    expect(() => assertSameOrigin(req("GET", { origin: "https://evil.example" }))).not.toThrow();
  });
});

describe("bootstrap admin", () => {
  it("never revives a removed member", async () => {
    process.env.BOOTSTRAP_ADMIN_EMAILS = "boot@test.local";
    const { vi } = await import("vitest");
    vi.resetModules();
    vi.doMock("@/lib/auth/session", () => ({
      getAuthUserId: async () => "test:boot-new",
      getAuthProfile: async () => ({ id: "test:boot-new", email: "boot@test.local", name: null }),
    }));
    const { ensureDefaultWorkspace, getCtx } = await import("./context");
    const ws = await ensureDefaultWorkspace();
    await db.insert(memberships).values({ workspaceId: ws.id, email: "boot@test.local", userId: "test:boot-old", role: "admin", status: "removed" }).onConflictDoNothing();
    expect(await getCtx()).toBeNull();
    const [m] = await db.select().from(memberships).where(and(eq(memberships.workspaceId, ws.id), eq(memberships.email, "boot@test.local")));
    expect(m).toMatchObject({ status: "removed", userId: "test:boot-old" });
    vi.doUnmock("@/lib/auth/session");
  });
});
