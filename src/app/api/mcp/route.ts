import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ctxFromToken, rateLimited } from "@/server/api-tokens";
import { buildMcpServer } from "@/server/mcp";
import { baseUrl, ctxFromAccessToken, wwwAuthenticate } from "@/server/oauth";

/**
 * Remote MCP server (Streamable HTTP, stateless). Authenticated by an OAuth access token (Claude /
 * ChatGPT connectors, see src/server/oauth.ts) or a personal access token (Settings → Integrations)
 * instead of the Clerk session, and called by MCP clients rather than our pages, so it skips the
 * same-origin check; everything else goes through the normal services.
 */
const unauthorized = (req: Request, message: string, status = 401, hadToken = false) =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    // The challenge points MCP clients at the protected resource metadata (RFC 9728), which starts OAuth.
    { status, headers: status === 401 ? { "WWW-Authenticate": wwwAuthenticate(baseUrl(req), hadToken ? "invalid_token" : undefined) } : undefined },
  );

async function handle(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  const ctx = token ? ((await ctxFromAccessToken(token, baseUrl(req))) ?? (await ctxFromToken(token))) : null;
  if (!ctx) return unauthorized(req, "Missing, invalid or revoked access token", 401, !!token);
  if (rateLimited(ctx.tokenId)) return unauthorized(req, "Too many requests, slow down", 429);

  // Stateless: a fresh server and transport per request, JSON responses instead of SSE streams.
  const server = buildMcpServer(ctx);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
