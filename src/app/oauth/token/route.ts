import { rateLimited } from "@/server/api-tokens";
import { baseUrl, clientIp, exchangeToken, OAuthError, oauthErrorResponse, oauthJson, preflight } from "@/server/oauth";

/** OAuth token endpoint: authorization_code (+ PKCE) and refresh_token, form-encoded per RFC 6749. */
export async function POST(req: Request) {
  try {
    if (rateLimited(`oauth-token:${clientIp(req)}`, Date.now(), 60)) throw new OAuthError("slow_down", "Too many requests, slow down", 429);
    if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded"))
      throw new OAuthError("invalid_request", "Body must be application/x-www-form-urlencoded");
    const form = new URLSearchParams(await req.text());
    return oauthJson(await exchangeToken(form, req.headers.get("authorization"), baseUrl(req)));
  } catch (e) {
    return oauthErrorResponse(e);
  }
}

export const OPTIONS = preflight;
