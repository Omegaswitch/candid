import { completeFollowUp } from "@/server/follow-ups";
import { route, uuidParam } from "@/server/http";

/** `[id]` is the project id. DELETE marks the follow-up done: clears it and writes a history entry. */
export const DELETE = route(async ({ ctx, params }) => ({ project: await completeFollowUp(ctx, uuidParam(params.id, "Project")) }));
