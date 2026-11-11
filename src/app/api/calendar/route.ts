import { calendarRange } from "@/server/calendar";
import { route } from "@/server/http";

export const GET = route(async ({ ctx, req }) => calendarRange(ctx, Object.fromEntries(req.nextUrl.searchParams)));
