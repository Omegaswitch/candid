import { z } from "zod";
import { body, route } from "@/server/http";
import { restoreFromTrash } from "@/server/trash";

export const POST = route(async ({ ctx, req }) => {
  const b = await body(req, z.object({ kind: z.enum(["project", "task", "document"]), id: z.uuid() }));
  await restoreFromTrash(ctx, b.kind, b.id);
});
