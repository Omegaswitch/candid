import { NextResponse, type NextRequest } from "next/server";
import { authMode, DEV_USER_COOKIE } from "@/lib/auth/session";

/** Development stand-in only. 404 unless AUTH_MODE=dev (which itself refuses to run on Vercel). */
export async function POST(req: NextRequest) {
  if (authMode !== "dev") return new NextResponse(null, { status: 404 });
  const email = String((await req.formData()).get("email") ?? "").toLowerCase();
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(DEV_USER_COOKIE, email, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/sign-in", req.url), 303);
  res.cookies.delete(DEV_USER_COOKIE);
  return res;
}
