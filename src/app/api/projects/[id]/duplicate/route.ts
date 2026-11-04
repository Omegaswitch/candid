import { z } from "zod";
import { body, route, uuidParam } from "@/server/http";
import { duplicateProject } from "@/server/projects";

const schema = z.object({ name: z.string().max(200).optional(), includeNotes: z.boolean(), includeDates: z.boolean() });
export const POST = route(async ({ ctx, req, params }) => ({
  project: await duplicateProject(ctx, uuidParam(params.id, "Project"), await body(req, schema)),
}));
