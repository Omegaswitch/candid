import { NextResponse, type NextRequest } from "next/server";
import { authMode, DEV_USER_COOKIE } from "@/lib/auth/session";
import { isLocalHost } from "@/lib/auth/stand-in";

const allowed = (req: NextRequest) => {
  const origin = req.headers.get("origin");
  // Same-origin form posts only (no login CSRF), and only on this machine.
  return authMode === "dev" && isLocalHost(req.headers.get("host")) && (!origin || origin === req.nextUrl.origin);
};

/** Development stand-in only. 404 unless AUTH_MODE=dev (which itself refuses to run on Vercel). */
export async function POST(req: NextRequest) {
  if (!allowed(req)) return new NextResponse(null, { status: 404 });
  const form = await req.formData();
  const email = String(form.get("email") ?? "").toLowerCase();
  // Back to where sign-in was asked for (e.g. the OAuth consent screen), but only on this origin.
  const next = new URL(String(form.get("redirect_url") || "/"), req.url);
  const res = NextResponse.redirect(next.origin === req.nextUrl.origin ? next : new URL("/", req.url), 303);
  res.cookies.set(DEV_USER_COOKIE, email, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}

export async function DELETE(req: NextRequest) {
  if (!allowed(req)) return new NextResponse(null, { status: 404 });
  const res = NextResponse.redirect(new URL("/sign-in", req.url), 303);
  res.cookies.delete(DEV_USER_COOKIE);
  return res;
}
