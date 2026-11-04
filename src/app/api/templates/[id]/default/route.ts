import { route, uuidParam } from "@/server/http";
import { setDefaultTemplate } from "@/server/templates";

/** POST: use this template for every new project. Admins only. */
export const POST = route(async ({ ctx, params }) => {
  await setDefaultTemplate(ctx, uuidParam(params.id, "Template"));
}, { role: "admin" });
