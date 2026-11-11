import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Mark } from "@/components/app/app-shell";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { fmt, t } from "@/i18n";
import { getAuthUserId } from "@/lib/auth/session";
import { getCtx } from "@/server/context";
import { baseUrl, checkAuthorizeRequest } from "@/server/oauth";

export const dynamic = "force-dynamic";
export const generateMetadata = (): Metadata => ({ title: t.oauth.title });

/** Parameters the consent form passes on to /oauth/authorize/decision, which checks them all again. */
const FORWARDED = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"];

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6 text-base">
      <Mark className="size-10" />
      {children}
    </main>
  );
}

/**
 * OAuth authorization endpoint with the consent screen. The proxy sends signed-out visitors to
 * sign-in first (with this URL to come back to); the dev stand-in is handled here.
 */
export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") params.set(k, v);
  const o = t.oauth;

  if (!(await getAuthUserId())) redirect(`/sign-in?redirect_url=${encodeURIComponent(`/oauth/authorize?${params}`)}`);
  const ctx = await getCtx();
  if (!ctx)
    return (
      <Frame>
        <h1 className="text-2xl font-semibold">{t.common.notMemberTitle}</h1>
        <p className="text-muted-foreground">{o.notMember}</p>
      </Frame>
    );

  const h = await headers();
  const base = baseUrl(new Request(`${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`));
  const check = await checkAuthorizeRequest(params, base);
  if (!check.ok) {
    if (check.redirect) redirect(check.redirect);
    return (
      <Frame>
        <h1 className="text-2xl font-semibold">{o.errorTitle}</h1>
        <p className="text-muted-foreground">{check.message === "unknown_client" ? o.unknownClient : o.badRedirect}</p>
      </Frame>
    );
  }

  const { client, redirectUri } = check.request;
  const target = new URL(redirectUri);
  const loopback = target.protocol === "http:";
  const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId));

  return (
    <Frame>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold break-words">{fmt(o.heading, { client: client.name })}</h1>
        <p className="text-muted-foreground">{fmt(o.body, { workspace: ws?.name ?? t.common.appName })}</p>
      </div>
      <dl className="grid gap-3 rounded-lg border bg-card p-4 text-sm">
        <div>
          <dt className="text-muted-foreground">{o.redirectsTo}</dt>
          <dd className="font-mono font-medium break-all">{target.host}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{o.signedInAs}</dt>
          <dd className="break-all">{ctx.email}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">{loopback ? o.loopbackWarning : o.unverifiedName}</p>
      <form method="post" action="/oauth/authorize/decision" className="flex flex-wrap gap-2">
        {FORWARDED.map((k) => {
          const v = params.get(k);
          return v === null ? null : <input key={k} type="hidden" name={k} value={v} />;
        })}
        <Button type="submit" name="decision" value="allow" size="lg">
          {o.allow}
        </Button>
        <Button type="submit" name="decision" value="deny" variant="outline" size="lg">
          {o.deny}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">{o.revokeLater}</p>
    </Frame>
  );
}
