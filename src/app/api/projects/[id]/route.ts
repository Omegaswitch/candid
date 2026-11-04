import { body, route, uuidParam } from "@/server/http";
import { deleteArchivedProject, getProject, projectPatch, updateProject } from "@/server/projects";

export const GET = route(async ({ ctx, params }) => getProject(ctx, uuidParam(params.id, "Project")));
export const PATCH = route(async ({ ctx, req, params }) => ({
  project: await updateProject(ctx, uuidParam(params.id, "Project"), await body(req, projectPatch)),
}));
/** Permanent; refused (422) unless the project is archived. */
export const DELETE = route(async ({ ctx, params }) => {
  await deleteArchivedProject(ctx, uuidParam(params.id, "Project"));
});
