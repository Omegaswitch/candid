import { baseUrl, oauthJson, preflight, protectedResourceMetadata } from "@/server/oauth";

/**
 * RFC 9728 protected resource metadata for the MCP endpoint, at the root and path-suffixed
 * (`/.well-known/oauth-protected-resource/api/mcp`) locations MCP clients probe.
 */
export async function GET(req: Request, ctx: RouteContext<"/.well-known/oauth-protected-resource/[[...path]]">) {
  const suffix = (await ctx.params).path?.join("/") ?? "";
  if (suffix !== "" && suffix !== "api/mcp") return oauthJson({ error: "not_found" }, 404);
  return oauthJson(protectedResourceMetadata(baseUrl(req)), 200, "public");
}

export const OPTIONS = preflight;
