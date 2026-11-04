import { body, route } from "@/server/http";
import { bulkPatch, bulkUpdateTasks } from "@/server/tasks";

export const POST = route(async ({ ctx, req }) => bulkUpdateTasks(ctx, await body(req, bulkPatch)));
