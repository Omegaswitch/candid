import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Clerk needs its middleware to run so `auth()` can read the session. Authorisation itself is
// enforced in every route handler and page via requireCtx(), not here.
export default process.env.AUTH_MODE === "dev" ? () => NextResponse.next() : clerkMiddleware();

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
