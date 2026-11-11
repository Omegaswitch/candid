import { route, uuidParam } from "@/server/http";
import { revokeGrant } from "@/server/oauth";

/** Disconnects an app the caller connected through OAuth (Claude, ChatGPT). */
export const DELETE = route(async ({ ctx, params }) => {
  await revokeGrant(ctx, uuidParam(params.id, "Connection"));
});
