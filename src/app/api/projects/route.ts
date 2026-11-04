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

const createBody = projectInput.extend({ templateId: z.uuid().nullish() });
export const POST = route(async ({ ctx, req }) => ({ project: await createProject(ctx, await body(req, createBody)) }));
