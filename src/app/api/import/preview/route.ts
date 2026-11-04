import { route } from "@/server/http";
import { previewImport } from "@/server/import";
import { readJson } from "../read-json";

/** Body: ImportRequest (src/lib/import/types.ts). Returns the ImportPlan; changes nothing. */
export const POST = route(async ({ ctx, req }) => ({ plan: await previewImport(ctx, await readJson(req)) }));
