import { authorizationServerMetadata, baseUrl, oauthJson, preflight } from "@/server/oauth";

/** RFC 8414 authorization server metadata. The issuer has no path, so only the root form exists. */
export async function GET(req: Request, ctx: RouteContext<"/.well-known/oauth-authorization-server/[[...path]]">) {
  const { path } = await ctx.params;
  if (path?.length) return oauthJson({ error: "not_found" }, 404);
  return oauthJson(authorizationServerMetadata(baseUrl(req)), 200, "public");
}

export const OPTIONS = preflight;
