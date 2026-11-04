import { z } from "zod";
import { body, route } from "@/server/http";
import { reorderDocuments } from "@/server/documents";

export const POST = route(async ({ ctx, req }) => {
  const { ids } = await body(req, z.object({ ids: z.array(z.uuid()).min(1).max(1000) }));
  await reorderDocuments(ctx, ids);
});
