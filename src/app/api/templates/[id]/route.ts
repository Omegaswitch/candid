import { body, route, uuidParam } from "@/server/http";
import { deleteTemplate, templatePatch, updateTemplate } from "@/server/templates";

export const PUT = route(
  async ({ ctx, req, params }) => ({ template: await updateTemplate(ctx, uuidParam(params.id, "Template"), await body(req, templatePatch)) }),
  { role: "admin" },
);

export const DELETE = route(async ({ ctx, params }) => {
  await deleteTemplate(ctx, uuidParam(params.id, "Template"));
}, { role: "admin" });
