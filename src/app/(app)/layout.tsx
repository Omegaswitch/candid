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
import { listLabels } from "@/server/labels";
import { listProjectSummaries } from "@/server/projects";
import { taskCounts } from "@/server/tasks";
import { viewerToday } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  if (!(await getAuthUserId())) redirect("/sign-in");
  const ctx = await getCtx();
  if (!ctx) {
    if (authMode === "clerk") return <NotMember email={(await getAuthProfile())?.email ?? null} />;
    return <main className="mx-auto max-w-md p-10 text-base">{t.common.notMember}</main>;
  }
  // The viewer's "today" (timezone cookie); unknown on the very first visit, then the
  // date-dependent lists (project cards, sidebar counts) load in the browser as before.
  const today = viewerToday();
  const [prefs, members, [ws], labels, projects, counts] = await Promise.all([
    getPrefs(ctx),
    listMembers(ctx),
    db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, ctx.workspaceId)),
    listLabels(ctx),
    today ? listProjectSummaries(ctx, { today }) : null,
    today ? taskCounts(ctx, today) : null,
  ]);
  // Seed the client cache with what every page's shell and sidebar ask for (pinned projects, counts,
  // labels), so they render at once instead of after a round of API requests. Documents are left to
  // the browser: their timestamps are formatted in the browser's own locale and timezone.
  const qc = new QueryClient();
  qc.setQueryData(qk.prefs(), prefs);
  qc.setQueryData(qk.members(), members);
  qc.setQueryData(qk.labels(), labels);
  if (projects) qc.setQueryData(qk.projects(), projects);
  if (counts) qc.setQueryData(qk.counts(), counts);

  return (
    <SessionProvider value={{ membershipId: ctx.membershipId, role: ctx.role, name: ctx.name, email: ctx.email, workspaceName: ws?.name ?? "", authMode }}>
      <HydrationBoundary state={dehydrate(qc)}>
        <AppShell>{children}</AppShell>
      </HydrationBoundary>
    </SessionProvider>
  );
}
