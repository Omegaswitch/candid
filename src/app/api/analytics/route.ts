import { route } from "@/server/http";
import { isoDate } from "@/server/projects";
import { workspaceAnalytics } from "@/server/analytics";

export const GET = route(async ({ ctx, req }) => workspaceAnalytics(ctx, isoDate.parse(req.nextUrl.searchParams.get("today"))));
