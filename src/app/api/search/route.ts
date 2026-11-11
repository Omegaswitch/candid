import { route } from "@/server/http";
import { recentProjects, search } from "@/server/search";

/**
 * GET /api/search?q=…&today=YYYY-MM-DD&tz=Europe/Prague
 *   `today` is the viewer's local date and `tz` their time zone (for "po termínu", "7d", "upraveno:dnes").
 * GET /api/search?recent=id1,id2,…   the listed projects (for "Naposledy otevřené"), in that order.
 */
export const GET = route(async ({ ctx, req }) => {
  const p = req.nextUrl.searchParams;
  const recent = p.get("recent");
  if (recent !== null) return { projects: await recentProjects(ctx, recent.split(",").filter(Boolean).slice(0, 20)) };
  return search(ctx, p.get("q") ?? "", { today: p.get("today") || undefined, tz: p.get("tz") || undefined });
});
