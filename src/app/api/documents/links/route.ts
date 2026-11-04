import { body, route } from "@/server/http";
import { createLink, linkInput } from "@/server/documents";

export const POST = route(async ({ ctx, req }) => ({ document: await createLink(ctx, await body(req, linkInput)) }));
