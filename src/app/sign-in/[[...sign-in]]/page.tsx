import type { Metadata } from "next";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { authMode } from "@/lib/auth/session";
import { t } from "@/i18n";
import { Landing } from "@/components/app/landing";
import { ClerkSignIn } from "./clerk-sign-in";

export const generateMetadata = (): Metadata => ({ title: t.common.signIn });

export default async function SignInPage() {
  if (authMode === "clerk") return <ClerkSignIn />;

  // Development stand-in: pick a seeded person. Never available on a deployment (see lib/auth/session).
  const people = await db
    .select({
      email: memberships.email,
      name: memberships.displayName,
      role: memberships.role,
    })
    .from(memberships);
  if (!people.length)
    return (
      <main className="p-6">
        Run <code>npm run db:seed</code> to create development people.
      </main>
    );
  return (
    <Landing>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div>
          <h2 className="text-2xl font-semibold">{t.common.devSignInTitle}</h2>
          <p className="mt-1 text-muted-foreground">{t.common.devSignInNote}</p>
        </div>
        <ul className="divide-y rounded-lg border bg-card">
          {people.map((p) => (
            <li key={p.email}>
              <form action="/api/dev/sign-in" method="post">
                <input type="hidden" name="email" value={p.email} />
                <button className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent focus-visible:bg-accent">
                  <span>
                    <span className="block font-medium">
                      {p.name ?? p.email}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {p.email}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.role}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </Landing>
  );
}
