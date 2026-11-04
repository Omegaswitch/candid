import { z } from "zod";
import { route } from "@/server/http";
import { listDocuments } from "@/server/documents";

/** Workspace documents in shelf order, with the caller's `pinned` flag. Optional ?projectId=. */
export const GET = route(async ({ ctx, req }) => {
  const projectId = z.uuid().optional().parse(req.nextUrl.searchParams.get("projectId") ?? undefined);
  return { documents: await listDocuments(ctx, { projectId }) };
});
