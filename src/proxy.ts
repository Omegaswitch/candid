import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Clerk's middleware reads the session so `auth()` works. Page visits without a session go to
// sign-in with a return URL (auth.protect); API routes answer 401 JSON themselves. Authorisation
// (workspace membership, roles) is enforced in every route handler and page via requireCtx().
const isPublic = createRouteMatcher(["/sign-in(.*)", "/api/(.*)"]);

export default process.env.AUTH_MODE === "dev"
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, req) => {
      if (!isPublic(req)) await auth.protect();
    });

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
