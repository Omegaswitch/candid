import { body, route, uuidParam } from "@/server/http";
import { deleteLabel, labelPatch, updateLabel } from "@/server/labels";

export const PATCH = route(async ({ ctx, req, params }) => ({
  label: await updateLabel(ctx, uuidParam(params.id, "Label"), await body(req, labelPatch)),
}));
export const DELETE = route(async ({ ctx, params }) => {
  await deleteLabel(ctx, uuidParam(params.id, "Label"));
});
