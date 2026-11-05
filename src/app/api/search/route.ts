import { route } from "@/server/http";
import { search } from "@/server/search";

/** GET /api/search?q=…&today=YYYY-MM-DD (the viewer's local date, for "po termínu"/overdue). */
export const GET = route(async ({ ctx, req }) => {
  const p = req.nextUrl.searchParams;
  return search(ctx, p.get("q") ?? "", { today: p.get("today") || undefined });
});
