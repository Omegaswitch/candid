import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { SessionProvider } from "@/components/app/session";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { qk } from "@/lib/query-keys";
import { t } from "@/i18n";
import { authMode, getAuthProfile, getAuthUserId } from "@/lib/auth/session";
import { NotMember } from "@/components/app/not-member";
import { getCtx } from "@/server/context";
import { listMembers } from "@/server/members";
import { getPrefs } from "@/server/preferences";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!(await getAuthUserId())) redirect("/sign-in");
  const ctx = await getCtx();
  if (!ctx) {
    if (authMode === "clerk") return <NotMember email={(await getAuthProfile())?.email ?? null} />;
    return <main className="mx-auto max-w-md p-10 text-base">{t.common.notMember}</main>;
  }
  const [prefs, members, [ws]] = await Promise.all([
    getPrefs(ctx),
    listMembers(ctx),
    db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId)),
  ]);
  // Seed the client cache so the shell renders without a loading flash.
  const qc = new QueryClient();
  qc.setQueryData(qk.prefs(), prefs);
  qc.setQueryData(qk.members(), members);

  return (
    <SessionProvider value={{ membershipId: ctx.membershipId, role: ctx.role, name: ctx.name, email: ctx.email, workspaceName: ws?.name ?? "", authMode }}>
      <HydrationBoundary state={dehydrate(qc)}>
        <AppShell>{children}</AppShell>
      </HydrationBoundary>
    </SessionProvider>
  );
}
