import { db } from "@/db";
import { memberships, workspaces } from "@/db/schema";
import type { Ctx } from "@/server/context";

/** A fresh, isolated workspace + admin per call, so tests never see each other's data. */
export async function makeCtx(role: "admin" | "member" = "admin", workspaceId?: string): Promise<Ctx> {
  const wsId =
    workspaceId ??
    (await db.insert(workspaces).values({ name: "Test", slug: `t-${crypto.randomUUID()}` }).returning())[0].id;
  const email = `${crypto.randomUUID()}@test.local`;
  const [m] = await db
    .insert(memberships)
    .values({ workspaceId: wsId, email, userId: `test:${email}`, displayName: "Test Person", role, status: "active" })
    .returning();
  return { userId: m.userId!, membershipId: m.id, workspaceId: wsId, role, name: "Test Person", email };
}
