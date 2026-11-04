import { route, uuidParam } from "@/server/http";
import { setTaskRemoved } from "@/server/tasks";

export const POST = route(async ({ ctx, params }) => ({ task: await setTaskRemoved(ctx, uuidParam(params.id, "Task"), false) }));
