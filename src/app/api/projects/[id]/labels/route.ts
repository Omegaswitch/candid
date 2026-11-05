import { z } from "zod";
import { body, route, uuidParam } from "@/server/http";
import { setProjectLabels } from "@/server/labels";

/** { labelIds } — the project's complete label set. */
export const PUT = route(async ({ ctx, req, params }) => {
  const b = await body(req, z.object({ labelIds: z.array(z.uuid()).max(50) }));
  return { labelIds: await setProjectLabels(ctx, uuidParam(params.id, "Project"), b.labelIds) };
});
