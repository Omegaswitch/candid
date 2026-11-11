import { body, route, uuidParam } from "@/server/http";
import { contactInput, logContact } from "@/server/follow-ups";

export const POST = route(async ({ ctx, req, params }) => ({
  project: await logContact(ctx, uuidParam(params.id, "Project"), await body(req, contactInput)),
}));
