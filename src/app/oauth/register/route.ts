import { rateLimited } from "@/server/api-tokens";
import { clientIp, OAuthError, oauthErrorResponse, oauthJson, preflight, registerClient } from "@/server/oauth";

/** RFC 7591 dynamic client registration (public clients). Open by design, so rate-limited per IP. */
export async function POST(req: Request) {
  try {
    if (rateLimited(`oauth-register:${clientIp(req)}`, Date.now(), 10)) throw new OAuthError("too_many_requests", "Too many registrations, slow down", 429);
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new OAuthError("invalid_client_metadata", "Body must be JSON");
    }
    return oauthJson(await registerClient(json), 201);
  } catch (e) {
    return oauthErrorResponse(e);
  }
}

export const OPTIONS = preflight;
