import { ClerkDegraded, ClerkFailed, ClerkLoaded, ClerkLoading, SignIn } from "@clerk/nextjs";
import { Mark } from "@/components/app/app-shell";
import { t } from "@/i18n";

/**
 * The sign-in page is the Clerk widget. It never leaves the page empty: while the widget loads
 * the app name and a placeholder show, and if Clerk's script cannot load (blocked network, an
 * extension) a plain message says so instead of a blank screen.
 */
export function ClerkSignIn() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-2.5">
        <Mark className="size-6" />
        <span className="text-lg font-semibold">{t.common.appName}</span>
      </div>
      <ClerkLoading>
        <div aria-busy="true" className="h-[420px] w-full max-w-[400px] rounded-lg border bg-card" />
        <p className="text-sm text-muted-foreground">{t.common.loading}</p>
      </ClerkLoading>
      <ClerkLoaded>
        <SignIn />
      </ClerkLoaded>
      <ClerkDegraded>
        <p role="status" className="max-w-md text-center text-sm text-muted-foreground">
          {t.common.signInDegraded}
        </p>
      </ClerkDegraded>
      <ClerkFailed>
        <p role="alert" className="max-w-md text-center text-sm">
          {t.common.signInFailed}
        </p>
      </ClerkFailed>
    </main>
  );
}
