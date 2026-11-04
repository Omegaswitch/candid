import { route } from "@/server/http";
import { isoDate } from "@/server/projects";
import { taskCounts } from "@/server/tasks";

export const GET = route(async ({ ctx, req }) => taskCounts(ctx, isoDate.parse(req.nextUrl.searchParams.get("today"))));
