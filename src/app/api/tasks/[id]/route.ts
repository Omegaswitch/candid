import { body, route, uuidParam } from "@/server/http";
import { setTaskRemoved, taskPatch, updateTask } from "@/server/tasks";

export const PATCH = route(async ({ ctx, req, params }) => ({
  task: await updateTask(ctx, uuidParam(params.id, "Task"), await body(req, taskPatch)),
}));
/** Soft delete; POST ./restore undoes it. */
export const DELETE = route(async ({ ctx, params }) => ({ task: await setTaskRemoved(ctx, uuidParam(params.id, "Task"), true) }));
