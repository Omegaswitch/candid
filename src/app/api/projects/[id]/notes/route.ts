import { z } from "zod";
import { body, route, uuidParam } from "@/server/http";
import { updateProjectNotes } from "@/server/projects";

const schema = z.object({ notes: z.string(), notesVersion: z.int() });
export const PUT = route(async ({ ctx, req, params }) => {
  const { notes, notesVersion } = await body(req, schema);
  return updateProjectNotes(ctx, uuidParam(params.id, "Project"), notes, notesVersion);
});
