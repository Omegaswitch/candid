import { body, route } from "@/server/http";
import { createUpload, uploadInput } from "@/server/documents";

/** { name, mimeType, size, projectId?, replaceId? } → { uploadId, upload: { url, fields } } */
export const POST = route(async ({ ctx, req }) => createUpload(ctx, await body(req, uploadInput)));
