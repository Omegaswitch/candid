import { z } from "zod";
import { body, route, uuidParam } from "@/server/http";
import { reorderTasks } from "@/server/tasks";

export const POST = route(async ({ ctx, req, params }) => {
  const { ids } = await body(req, z.object({ ids: z.array(z.uuid()).min(1).max(1000) }));
  await reorderTasks(ctx, uuidParam(params.id, "Project"), ids);
});
