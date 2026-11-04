import { NextResponse } from "next/server";
import { completeConnect, STATE_COOKIE } from "@/server/google";
import { route } from "@/server/http";

/** Google redirects here after consent. Always answers with a redirect back into the app. */
export const GET = route(async ({ ctx, req }) => {
  const q = req.nextUrl.searchParams;
  const { returnTo, error } = await completeConnect(ctx, {
    code: q.get("code"),
    state: q.get("state"),
    error: q.get("error"),
    cookie: req.cookies.get(STATE_COOKIE)?.value,
  });
  const back = new URL(returnTo, process.env.APP_URL ?? req.nextUrl.origin);
  back.searchParams.set(error ? "google_error" : "connected", error ?? "1");
  const res = NextResponse.redirect(back);
  res.cookies.set(STATE_COOKIE, "", { path: "/api/google", maxAge: 0 });
  return res;
});
