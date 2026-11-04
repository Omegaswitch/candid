import { body, route, uuidParam } from "@/server/http";
import { documentPatch, setDocumentRemoved, updateDocument } from "@/server/documents";

/** { name?, projectId?, version } */
export const PATCH = route(async ({ ctx, req, params }) => ({
  document: await updateDocument(ctx, uuidParam(params.id, "Document"), await body(req, documentPatch)),
}));
/** Soft delete; POST ./restore undoes it. */
export const DELETE = route(async ({ ctx, params }) => {
  await setDocumentRemoved(ctx, uuidParam(params.id, "Document"), true);
});
