import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Clerk's middleware reads the session so `auth()` works. Page visits without a session go to
// sign-in with a return URL (auth.protect); API routes answer 401 JSON themselves. Authorisation
// (workspace membership, roles) is enforced in every route handler and page via requireCtx().
// Link-preview files (OG image, icons, manifest) must be public so Discord, Slack and Teams can show them.
const isPublic = createRouteMatcher([
  "/sign-in(.*)",
  "/api/(.*)",
  "/opengraph-image(.*)",
  "/twitter-image(.*)",
  "/icon(.*)",
  "/apple-icon(.*)",
  "/manifest.webmanifest",
]);

export default process.env.AUTH_MODE === "dev"
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, req) => {
      if (isPublic(req)) return;
      // Signed out: redirect to sign-in (also for link-preview bots, which then read its tags),
      // rather than auth.protect(), which answers non-browser requests with a bare 404.
      if (!(await auth()).userId) {
        const url = new URL("/sign-in", req.url);
        url.searchParams.set("redirect_url", req.url);
        return NextResponse.redirect(url);
      }
    });

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
