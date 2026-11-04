import { z } from "zod";
import { route } from "@/server/http";
import { isoDate } from "@/server/projects";
import { listTaskView } from "@/server/tasks";

const query = z.object({
  view: z.enum(["mine", "due-soon", "overdue", "waiting"]),
  today: isoDate,
  days: z.coerce.number().int().min(1).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export const GET = route(async ({ ctx, req }) => {
  const q = query.parse(Object.fromEntries(req.nextUrl.searchParams));
  return { items: await listTaskView(ctx, q.view, q) };
});
