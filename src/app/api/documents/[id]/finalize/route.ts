import { z } from "zod";
import { route, uuidParam } from "@/server/http";
import { finalizeUpload } from "@/server/documents";

/** PDF text extraction runs inside finalize; give it room on serverless. */
export const maxDuration = 60;

/** `id` is the uploadId from POST /api/documents/uploads. Body { replaceId? } for a replacement. */
export const POST = route(async ({ ctx, req, params }) => {
  const raw = await req.json().catch(() => ({}));
  const { replaceId } = z.object({ replaceId: z.uuid().optional() }).parse(raw ?? {});
  return { document: await finalizeUpload(ctx, uuidParam(params.id, "Upload"), { replaceId }) };
});
