import { route, uuidParam } from "@/server/http";
import { downloadUrl } from "@/server/documents";

/** Authorises the caller, then redirects to a 60-second signed URL (or the external link). ?inline=1 for preview. */
export const GET = route(async ({ ctx, req, params }) => {
  const inline = req.nextUrl.searchParams.get("inline") === "1";
  const url = await downloadUrl(ctx, uuidParam(params.id, "Document"), { inline });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
});
