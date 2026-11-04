"use client";

import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { Mark } from "./app-shell";

/** Signed in, but not in this workspace: say so and offer a way back to the sign-in page. */
export function NotMember({ email }: { email: string | null }) {
  const clerk = useClerk();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6 text-base">
      <Mark className="size-10" />
      <h1 className="text-2xl font-semibold">{t.common.notMemberTitle}</h1>
      <p className="text-muted-foreground">{t.common.notMember}</p>
      {email && <p className="text-sm">{email}</p>}
      <Button className="w-fit" onClick={() => clerk.signOut({ redirectUrl: "/sign-in" })}>
        {t.common.signOutSwitch}
      </Button>
    </main>
  );
}
