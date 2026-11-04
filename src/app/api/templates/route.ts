import { body, route } from "@/server/http";
import { createTemplate, ensureDefaultTemplates, listTemplates, templateInput } from "@/server/templates";

export const GET = route(async ({ ctx }) => {
  let templates = await listTemplates(ctx);
  if (!templates.length) {
    await ensureDefaultTemplates(ctx);
    templates = await listTemplates(ctx);
  }
  return { templates };
});

export const POST = route(async ({ ctx, req }) => ({ template: await createTemplate(ctx, await body(req, templateInput)) }), { role: "admin" });
