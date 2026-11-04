import "server-only";
import { cookies } from "next/headers";

export type AuthUser = { id: string; email: string | null; name: string | null };

/**
 * `clerk` (default) uses Clerk, the managed auth provider.
 * `dev` is a local stand-in for automated tests and offline development: it trusts a cookie
 * holding a seeded email. It refuses to run on Vercel, so it can never be the production login.
 */
export const authMode: "clerk" | "dev" = process.env.AUTH_MODE === "dev" ? "dev" : "clerk";
export const DEV_USER_COOKIE = "candid_dev_user";

if (authMode === "dev" && process.env.VERCEL_ENV) {
  throw new Error("AUTH_MODE=dev is a local stand-in and must not be used on a deployment.");
}

/** The signed-in identity, or null. Cheap: Clerk reads the verified session token, no network call. */
export async function getAuthUserId(): Promise<string | null> {
  if (authMode === "dev") {
    const email = (await cookies()).get(DEV_USER_COOKIE)?.value;
    return email ? `dev:${email}` : null;
  }
  const { auth } = await import("@clerk/nextjs/server");
  return (await auth()).userId;
}

/** Full profile; only needed the first time someone signs in (to bind their invite by email). */
export async function getAuthProfile(): Promise<AuthUser | null> {
  if (authMode === "dev") {
    const id = await getAuthUserId();
    if (!id) return null;
    const email = id.slice(4);
    return { id, email, name: null };
  }
  const { currentUser } = await import("@clerk/nextjs/server");
  const u = await currentUser();
  if (!u) return null;
  const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
  // Only a verified address may claim an invite.
  const email = primary?.verification?.status === "verified" ? primary.emailAddress : null;
  return { id: u.id, email, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || null };
}
