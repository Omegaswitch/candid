import { route, uuidParam } from "@/server/http";
import { listProjectActivity } from "@/server/activity-read";

export const GET = route(async ({ ctx, params }) => ({ events: await listProjectActivity(ctx, uuidParam(params.id, "Project")) }));
