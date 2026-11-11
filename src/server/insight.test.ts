import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { activityEvents, projects, tasks } from "@/db/schema";
import { daysSince, IDLE_DAYS, idleDays, needsAttention } from "@/lib/insight";
import { makeCtx } from "../../test/factory";
import { avgDaysInStatus } from "./analytics";
import { getClient } from "./clients";
import { prefsSchema } from "./preferences";
import { createProject, getProject, listProjectSummaries, updateProject } from "./projects";

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const TODAY = new Date().toISOString().slice(0, 10);

/** Backdates a project (and its history) so "N days ago" is deterministic. */
async function backdate(id: string, createdDays: number) {
  await db.update(projects).set({ createdAt: ago(createdDays), lastActivityAt: ago(createdDays) }).where(eq(projects.id, id));
  await db.update(activityEvents).set({ createdAt: ago(createdDays) }).where(eq(activityEvents.projectId, id));
}
async function changeStatusAt(ctx: Awaited<ReturnType<typeof makeCtx>>, id: string, status: "active" | "waiting" | "completed", days: number) {
  const p = (await getProject(ctx, id)).project;
  await updateProject(ctx, id, { status, version: p.version });
  // The newest status_changed row is the one just written.
  await db.execute(sql`update activity_events set created_at = now() - make_interval(days => ${days})
    where id = (select id from activity_events where project_id = ${id} and action = 'status_changed' order by created_at desc, id desc limit 1)`);
}

describe("insight rules", () => {
  it("idle needs an open project and IDLE_DAYS without movement", () => {
    const now = Date.now();
    const base = { status: "active" as const, lastActivityAt: ago(IDLE_DAYS).toISOString(), overdueCount: 0 };
    expect(IDLE_DAYS).toBe(14);
    expect(idleDays(base, now)).toBe(14);
    expect(idleDays({ ...base, lastActivityAt: ago(13).toISOString() }, now)).toBeNull();
    expect(idleDays({ ...base, status: "waiting", lastActivityAt: ago(20).toISOString() }, now)).toBe(20);
    expect(idleDays({ ...base, status: "completed", lastActivityAt: ago(90).toISOString() }, now)).toBeNull();
    expect(daysSince(new Date(now + DAY).toISOString(), now)).toBe(0);
  });

  it("needs attention when idle or overdue, never when completed", () => {
    const fresh = { status: "active" as const, lastActivityAt: new Date().toISOString(), overdueCount: 0 };
    expect(needsAttention(fresh)).toBe(false);
    expect(needsAttention({ ...fresh, overdueCount: 2 })).toBe(true);
    expect(needsAttention({ ...fresh, lastActivityAt: ago(30).toISOString() })).toBe(true);
    expect(needsAttention({ ...fresh, status: "completed", overdueCount: 2 })).toBe(false);
  });

  it("saved filters from before the attention flag still parse", () => {
    const parsed = prefsSchema.parse({ filters: { ownerId: null, mine: true } });
    expect(parsed.filters).toMatchObject({ mine: true, attention: false });
    expect(prefsSchema.parse({ sort: "status" }).sort).toBe("status");
  });
});

describe("statusSince", () => {
  it("falls back to createdAt, then follows the last status change", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Fresh", tasks: [] });
    await backdate(p.id, 30);
    const [before] = await listProjectSummaries(ctx);
    expect(daysSince(before.statusSince)).toBe(30);

    await changeStatusAt(ctx, p.id, "waiting", 12);
    const [after] = await listProjectSummaries(ctx);
    expect(daysSince(after.statusSince)).toBe(12);
    // Editing something else is movement, but not a status change.
    const cur = (await getProject(ctx, p.id)).project;
    await updateProject(ctx, p.id, { name: "Renamed", version: cur.version });
    const [renamed] = await listProjectSummaries(ctx);
    expect(renamed.statusSince).toBe(after.statusSince);
    expect(daysSince(renamed.lastActivityAt)).toBe(0);
  });

  it("lastActivityAt counts history entries as movement", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Quiet", tasks: [] });
    await backdate(p.id, 20);
    expect(idleDays((await listProjectSummaries(ctx))[0])).toBe(20);
    await db.insert(activityEvents).values({ workspaceId: ctx.workspaceId, projectId: p.id, entityType: "project", entityId: p.id, action: "edited" });
    expect(idleDays((await listProjectSummaries(ctx))[0])).toBeNull();
  });
});

describe("avgDaysInStatus", () => {
  it("rebuilds stays from the history, current stay included, scoped to the workspace", async () => {
    const ctx = await makeCtx();
    const other = await makeCtx();
    const a = await createProject(ctx, { name: "A", tasks: [] });
    await backdate(a.id, 30);
    await changeStatusAt(ctx, a.id, "waiting", 20); // 10 d active, then 20 d waiting (current)
    const b = await createProject(ctx, { name: "B", tasks: [] }); // never changed: one active stay
    await backdate(b.id, 4);
    const t = await createProject(ctx, { name: "Trashed", tasks: [] });
    await backdate(t.id, 100);
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, t.id));
    await createProject(other, { name: "Elsewhere", tasks: [] });

    const rows = await avgDaysInStatus(ctx);
    const by = Object.fromEntries(rows.map((r) => [r.status, r]));
    expect(by.active).toMatchObject({ stays: 2, days: 7 }); // (10 + 4) / 2
    expect(by.waiting).toMatchObject({ stays: 1, days: 20 });
    expect(by.completed).toEqual({ status: "completed", days: null, stays: 0 });
  });
});

describe("getClient", () => {
  it("matches the name ignoring case and accents, and keeps other clients and the trash out", async () => {
    const ctx = await makeCtx();
    const a = await createProject(ctx, { name: "Hall", client: "Novák Stavby", tasks: [{ title: "Call" }] });
    const b = await createProject(ctx, { name: "Bridge", client: " NOVAK stavby ", tasks: [] });
    const c = await createProject(ctx, { name: "Elsewhere", client: "Svoboda", tasks: [] });
    const gone = await createProject(ctx, { name: "Trashed", client: "Novák Stavby", tasks: [] });
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, gone.id));
    await db.update(projects).set({ archivedAt: new Date(), status: "completed" }).where(eq(projects.id, b.id));
    await db.update(projects).set({ contactName: "Jana", contactEmail: "jana@novak.cz", contactPhone: "+420 123 456" }).where(eq(projects.id, a.id));

    const got = await getClient(ctx, "novak STAVBY", TODAY);
    expect(got.name).toBe("Novák Stavby");
    expect(got.active.map((p) => p.id)).toEqual([a.id]);
    expect(got.archived.map((p) => p.id)).toEqual([b.id]);
    expect(got.counts).toEqual({ open: 1, completed: 1, archived: 1 });
    expect(got.contacts).toEqual([{ name: "Jana", email: "jana@novak.cz", phone: "+420 123 456", projects: [{ id: a.id, name: "Hall" }] }]);
    expect(got.lastActivityAt).not.toBeNull();
    expect([...got.active, ...got.archived].some((p) => p.id === c.id || p.id === gone.id)).toBe(false);
  });

  it("counts overdue steps and on-time rate for the client only", async () => {
    const ctx = await makeCtx();
    const p = await createProject(ctx, { name: "Hall", client: "Acme", tasks: [] });
    const q = await createProject(ctx, { name: "Other", client: "Beta", tasks: [] });
    const base = { workspaceId: ctx.workspaceId, projectId: p.id };
    const day = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
    await db.insert(tasks).values([
      { ...base, title: "late open", dueDate: day(-3) },
      { ...base, title: "future open", dueDate: day(3) },
      { ...base, title: "in time", dueDate: day(1), done: true, completedAt: new Date() },
      { ...base, title: "too late", dueDate: day(-5), done: true, completedAt: new Date() },
      { ...base, title: "trashed", dueDate: day(-9), deletedAt: new Date() },
      { workspaceId: ctx.workspaceId, projectId: q.id, title: "elsewhere", dueDate: day(-1), done: true, completedAt: new Date() },
    ]);
    const got = await getClient(ctx, "acme", day(0));
    expect(got.overdueSteps).toBe(1);
    expect(got.onTime).toEqual({ rate: 50, onTime: 1, total: 2 });
  });

  it("is not found for an unknown client or another workspace", async () => {
    const ctx = await makeCtx();
    const other = await makeCtx();
    await createProject(other, { name: "X", client: "Secret Ltd", tasks: [] });
    await expect(getClient(ctx, "Secret Ltd", TODAY)).rejects.toMatchObject({ code: "not_found" });
    await expect(getClient(ctx, "   ", TODAY)).rejects.toMatchObject({ code: "not_found" });
  });
});
