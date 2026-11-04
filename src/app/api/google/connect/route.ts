import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { safeReturnTo, startConnect, STATE_COOKIE } from "@/server/google";
import { route } from "@/server/http";

/** Browser navigation: redirects to Google's consent screen. */
export const GET = route(async ({ ctx, req }) => {
  const returnTo = req.nextUrl.searchParams.get("returnTo");
  try {
    const { url, cookie, maxAgeSec } = startConnect(ctx, returnTo);
    const res = NextResponse.redirect(url);
    res.cookies.set(STATE_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax", // sent on Google's top-level redirect back to us
      secure: process.env.APP_URL?.startsWith("https://") ?? false,
      path: "/api/google",
      maxAge: maxAgeSec,
    });
    return res;
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    const back = new URL(safeReturnTo(returnTo), req.nextUrl.origin);
    back.searchParams.set("google_error", "not_configured");
    return NextResponse.redirect(back);
  }
});
