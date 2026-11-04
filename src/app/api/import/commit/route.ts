import { route } from "@/server/http";
import { commitImport } from "@/server/import";
import { readJson } from "../read-json";

/** Body: ImportCommitRequest. Same idempotencyKey twice → the first run's result, nothing imported twice. */
export const POST = route(async ({ ctx, req }) => ({ result: await commitImport(ctx, await readJson(req)) }));
