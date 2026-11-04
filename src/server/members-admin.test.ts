import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { integrationConnections, memberships } from "@/db/schema";
import { makeCtx } from "../../test/factory";
import { changeRole, inviteMember, removeMember } from "./members-admin";
import { listMembers } from "./members";

describe("member administration", () => {
  it("admins invite by email; the invite waits for first sign-in", async () => {
    const admin = await makeCtx();
    const m = await inviteMember(admin, { email: "  New.Person@Example.com ", role: "member" });
    expect(m).toMatchObject({ email: "new.person@example.com", status: "invited", role: "member" });
    const [row] = await db.select().from(memberships).where(eq(memberships.id, m.id));
    expect(row.userId).toBeNull();
    await expect(inviteMember(admin, { email: "new.person@example.com" })).rejects.toMatchObject({ code: "invalid" });
  });

  it("members cannot invite, change roles or remove", async () => {
    const admin = await makeCtx();
    const member = await makeCtx("member", admin.workspaceId);
    await expect(inviteMember(member, { email: "x@example.com" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(changeRole(member, member.membershipId, { role: "admin" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(removeMember(member, admin.membershipId)).rejects.toMatchObject({ code: "forbidden" });
  });

  it("cannot demote or remove the last admin", async () => {
    const admin = await makeCtx();
    await expect(changeRole(admin, admin.membershipId, { role: "member" })).rejects.toMatchObject({ code: "invalid" });
    await expect(removeMember(admin, admin.membershipId)).rejects.toMatchObject({ code: "invalid" });
    const second = await makeCtx("member", admin.workspaceId);
    await changeRole(admin, second.membershipId, { role: "admin" });
    await changeRole(admin, admin.membershipId, { role: "member" });
    const roles = Object.fromEntries((await listMembers(admin)).map((m) => [m.id, m.role]));
    expect(roles[admin.membershipId]).toBe("member");
    expect(roles[second.membershipId]).toBe("admin");
  });

  it("an invited admin does not count as the remaining admin", async () => {
    const admin = await makeCtx();
    await inviteMember(admin, { email: "pending@example.com", role: "admin" });
    await expect(removeMember(admin, admin.membershipId)).rejects.toMatchObject({ code: "invalid" });
  });

  it("removing marks the membership removed, drops their Google tokens, and re-invite starts over", async () => {
    const admin = await makeCtx();
    const member = await makeCtx("member", admin.workspaceId);
    await db.insert(integrationConnections).values({ workspaceId: admin.workspaceId, membershipId: member.membershipId, provider: "google" });
    await removeMember(admin, member.membershipId);
    expect((await listMembers(admin)).map((m) => m.id)).not.toContain(member.membershipId);
    expect(await db.select().from(integrationConnections).where(eq(integrationConnections.membershipId, member.membershipId))).toHaveLength(0);
    const again = await inviteMember(admin, { email: member.email });
    expect(again).toMatchObject({ id: member.membershipId, status: "invited" });
    const [row] = await db.select().from(memberships).where(and(eq(memberships.id, member.membershipId)));
    expect(row.userId).toBeNull();
  });

  it("cannot touch another workspace's members", async () => {
    const a = await makeCtx();
    const b = await makeCtx();
    await expect(removeMember(b, a.membershipId)).rejects.toMatchObject({ code: "not_found" });
    await expect(changeRole(b, a.membershipId, { role: "member" })).rejects.toMatchObject({ code: "not_found" });
  });
});
