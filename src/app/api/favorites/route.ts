import { z } from "zod";
import { body, route } from "@/server/http";
import { listFavorites, reorderFavorites, setPinned } from "@/server/favorites";

const kind = z.enum(["project", "document"]);

export const GET = route(async ({ ctx, req }) => ({
  favorites: await listFavorites(ctx, kind.parse(req.nextUrl.searchParams.get("kind"))),
}));
/** { kind, entityId, pinned } */
export const POST = route(async ({ ctx, req }) => {
  const b = await body(req, z.object({ kind, entityId: z.uuid(), pinned: z.boolean() }));
  await setPinned(ctx, b.kind, b.entityId, b.pinned);
});
/** { kind, ids } — new order of the caller's pins */
export const PUT = route(async ({ ctx, req }) => {
  const b = await body(req, z.object({ kind, ids: z.array(z.uuid()).max(500) }));
  await reorderFavorites(ctx, b.kind, b.ids);
});
