import { createApiToken, listApiTokens, tokenInput } from "@/server/api-tokens";
import { body, route } from "@/server/http";

export const GET = route(async ({ ctx }) => ({ tokens: await listApiTokens(ctx), endpoint: endpointUrl() }));
/** The plain token is in this response only; it is never stored or shown again. */
export const POST = route(async ({ ctx, req }) => ({ token: await createApiToken(ctx, await body(req, tokenInput)) }));

const endpointUrl = () => (process.env.APP_URL ? new URL("/api/mcp", process.env.APP_URL).toString() : null);
