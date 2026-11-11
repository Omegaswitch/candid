import { z } from "zod";
import { listDueFollowUps } from "@/server/follow-ups";
import { route } from "@/server/http";
import { isoDate } from "@/server/projects";

const query = z.object({ today: isoDate });
/** Follow-ups due today or earlier, for the "Contact today" list. */
export const GET = route(async ({ ctx, req }) => ({
  items: await listDueFollowUps(ctx, query.parse(Object.fromEntries(req.nextUrl.searchParams)).today),
}));
