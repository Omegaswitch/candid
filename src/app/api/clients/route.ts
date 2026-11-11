import { z } from "zod";
import { getClient } from "@/server/clients";
import { route } from "@/server/http";
import { isoDate } from "@/server/projects";

const nameParam = z.string().trim().min(1).max(200);

// The name travels as a query value, so no path decoding is involved (slashes, %, accents).
export const GET = route(async ({ ctx, req }) => {
  const q = req.nextUrl.searchParams;
  return getClient(ctx, nameParam.parse(q.get("name")), isoDate.parse(q.get("today")));
});
