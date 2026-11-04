import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, favorites, projects } from "@/db/schema";
import type { Ctx } from "./context";
import { notFound } from "./errors";

export type FavoriteKind = "project" | "document";

/** Personal pins. The pinned entity must belong to the caller's workspace. */
export async function setPinned(ctx: Ctx, kind: FavoriteKind, entityId: string, pinned: boolean) {
  const table = kind === "project" ? projects : documents;
  const [owned] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.workspaceId, ctx.workspaceId)));
  if (!owned) throw notFound(kind === "project" ? "Project" : "Document");
  if (!pinned) {
    await db.delete(favorites).where(and(eq(favorites.membershipId, ctx.membershipId), eq(favorites.kind, kind), eq(favorites.entityId, entityId)));
    return;
  }
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${favorites.position}), -1)` })
    .from(favorites)
    .where(eq(favorites.membershipId, ctx.membershipId));
  await db
    .insert(favorites)
    .values({ workspaceId: ctx.workspaceId, membershipId: ctx.membershipId, kind, entityId, position: max + 1 })
    .onConflictDoNothing();
}

export async function listFavorites(ctx: Ctx, kind: FavoriteKind) {
  return db
    .select({ entityId: favorites.entityId, position: favorites.position })
    .from(favorites)
    .where(and(eq(favorites.membershipId, ctx.membershipId), eq(favorites.workspaceId, ctx.workspaceId), eq(favorites.kind, kind)))
    .orderBy(asc(favorites.position));
}

export async function reorderFavorites(ctx: Ctx, kind: FavoriteKind, orderedIds: string[]) {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx
        .update(favorites)
        .set({ position: i })
        .where(and(eq(favorites.membershipId, ctx.membershipId), eq(favorites.kind, kind), eq(favorites.entityId, id)));
    }
  });
}
