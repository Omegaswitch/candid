import { z } from "zod";
import { body, route, uuidParam } from "@/server/http";
import { setArchived } from "@/server/projects";

export const POST = route(async ({ ctx, req, params }) => {
  const { archived } = await body(req, z.object({ archived: z.boolean() }));
  return { project: await setArchived(ctx, uuidParam(params.id, "Project"), archived) };
});
