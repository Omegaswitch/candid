import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ctxFromToken, rateLimited } from "@/server/api-tokens";
import { buildMcpServer } from "@/server/mcp";

/**
 * Remote MCP server (Streamable HTTP, stateless). Authenticated by a personal access token
 * (Settings → Integrations) instead of the Clerk session, and called by MCP clients rather than
 * our pages, so it skips the same-origin check; everything else goes through the normal services.
 */
const unauthorized = (message: string, status = 401) =>
  Response.json(
    { jsonrpc: "2.0", error: { code: -32001, message }, id: null },
    { status, headers: status === 401 ? { "WWW-Authenticate": 'Bearer realm="candid"' } : undefined },
  );

async function handle(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  const ctx = await ctxFromToken(token);
  if (!ctx) return unauthorized("Missing, invalid or revoked access token");
  if (rateLimited(ctx.tokenId)) return unauthorized("Too many requests, slow down", 429);

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
