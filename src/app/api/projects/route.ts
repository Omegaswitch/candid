import { z } from "zod";
import { body, route } from "@/server/http";
import { createProject, isoDate, listProjectSummaries, projectInput } from "@/server/projects";

export const GET = route(async ({ ctx, req }) => {
  const q = req.nextUrl.searchParams;
  const today = isoDate.optional().parse(q.get("today") ?? undefined);
  const archived = q.get("archived") === "1";
  const limit = z.coerce.number().int().min(1).max(500).default(archived ? 50 : 500).parse(q.get("limit") ?? undefined);
  const offset = z.coerce.number().int().min(0).default(0).parse(q.get("offset") ?? undefined);
  return { projects: await listProjectSummaries(ctx, { archived, today, limit, offset }) };
});

// `tasks` is the checklist as the person set it in the dialog (a template is only a starting point).
const createBody = projectInput.extend({
  templateId: z.uuid().nullish(),
  tasks: z.array(z.object({ title: z.string().trim().min(1).max(500), note: z.string().max(20_000).optional() })).max(200).optional(),
});
export const POST = route(async ({ ctx, req }) => ({ project: await createProject(ctx, await body(req, createBody)) }));
