import { route } from "@/server/http";
import { search } from "@/server/search";

export const GET = route(async ({ ctx, req }) => search(ctx, req.nextUrl.searchParams.get("q") ?? ""));
