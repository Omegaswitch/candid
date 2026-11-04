import { route, uuidParam } from "@/server/http";
import { setDocumentRemoved } from "@/server/documents";

export const POST = route(async ({ ctx, params }) => ({ document: await setDocumentRemoved(ctx, uuidParam(params.id, "Document"), false) }));
