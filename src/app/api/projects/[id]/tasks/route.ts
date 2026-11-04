import { body, route, uuidParam } from "@/server/http";
import { createTask, taskInput } from "@/server/tasks";

export const POST = route(async ({ ctx, req, params }) => ({
  task: await createTask(ctx, uuidParam(params.id, "Project"), await body(req, taskInput)),
}));
