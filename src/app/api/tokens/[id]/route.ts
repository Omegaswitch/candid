import { revokeApiToken } from "@/server/api-tokens";
import { route, uuidParam } from "@/server/http";

export const DELETE = route(async ({ ctx, params }) => {
  await revokeApiToken(ctx, uuidParam(params.id, "Token"));
});
