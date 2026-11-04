/**
 * DEVELOPMENT DEMO DATA ONLY. Run with `npm run db:seed` against a local or preview database.
 * Refuses to run when NODE_ENV=production unless SEED_FORCE=1. Safe to re-run: it resets the
 * demo workspace "main" only.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../src/db/schema";

if (process.env.NODE_ENV === "production" && process.env.SEED_FORCE !== "1") {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: s });
const today = new Date();
const day = (n: number) => {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + n));
  return d.toISOString().slice(0, 10);
};
const authId = (email: string) => (process.env.AUTH_MODE === "dev" ? `dev:${email}` : null);

async function main() {
  await db.delete(s.workspaces).where(eq(s.workspaces.slug, "main"));
  await db.delete(s.workspaces).where(eq(s.workspaces.slug, "other")); // second workspace for isolation tests
  const [ws] = await db.insert(s.workspaces).values({ name: "Candid recruitment", slug: "main" }).returning();

  const people = [
    { email: "jana.novakova@example.com", displayName: "Jana Nováková", role: "admin" as const },
    { email: "petr.dvorak@example.com", displayName: "Petr Dvořák", role: "member" as const },
    { email: "eva.svobodova@example.com", displayName: "Eva Svobodová", role: "member" as const },
    { email: "tomas.kral@example.com", displayName: "Tomáš Král", role: "member" as const },
  ];
  const members = await db
    .insert(s.memberships)
    .values(people.map((p) => ({ ...p, workspaceId: ws.id, userId: authId(p.email), status: (authId(p.email) ? "active" : "invited") as "active" | "invited" })))
    .returning();
  const [jana, petr, eva, tomas] = members;

  const [tpl] = await db
    .insert(s.projectTemplates)
    .values({ workspaceId: ws.id, name: "Recruitment", description: "Default recruitment checklist", createdBy: jana.id })
    .returning();
  const recruitment = ["Candidate outreach", "Write email", "Invoicing", "Presentation"];
  await db.insert(s.templateTasks).values(recruitment.map((title, i) => ({ templateId: tpl.id, title, position: i })));

  type T = { title: string; done?: boolean; assignee?: string; due?: string | null; waiting?: string; note?: string };
  const projects: { name: string; client?: string; owner?: string; status?: "active" | "waiting" | "completed"; priority?: "normal" | "high"; due?: string | null; notes?: string; tasks: T[]; archived?: boolean }[] = [
    {
      name: "Bricklayer recruitment", client: "Example Construction", owner: jana.id, due: day(12), status: "waiting",
      notes: "Waiting for client feedback on the first shortlist.",
      tasks: [
        { title: "Candidate outreach", done: true, assignee: petr.id },
        { title: "Write email", done: true, assignee: jana.id },
        { title: "Invoicing", assignee: eva.id, due: day(9) },
        { title: "Presentation", assignee: jana.id, due: day(5), waiting: "Client feedback on the shortlist" },
      ],
    },
    {
      name: "Warehouse forklift drivers", client: "Logistika Brno s.r.o.", owner: petr.id, priority: "high", due: day(3),
      notes: "Night shift only. Licence category B required.",
      tasks: [
        { title: "Publish job ad on jobs.cz", done: true, assignee: petr.id },
        { title: "Screen 14 applicants", assignee: petr.id, due: day(-2) },
        { title: "Book interviews for Thursday", assignee: tomas.id, due: day(1) },
        { title: "Send shortlist to client", assignee: petr.id, due: day(3) },
      ],
    },
    {
      name: "Electricians for Ostrava site", client: "Example Construction", owner: eva.id, due: day(21),
      tasks: [
        { title: "Candidate outreach", assignee: eva.id, due: day(6) },
        { title: "Write email", assignee: eva.id },
        { title: "Invoicing" },
        { title: "Presentation" },
      ],
    },
    {
      name: "Office manager, Praha 2", client: "Kancelář Vinohrady", owner: tomas.id, status: "completed", due: day(-10),
      notes: "Placed: candidate starts on the 1st.",
      tasks: [
        { title: "Candidate outreach", done: true, assignee: tomas.id },
        { title: "Three interviews", done: true, assignee: tomas.id },
        { title: "Invoicing", done: true, assignee: eva.id },
      ],
    },
    {
      name: "Seasonal kitchen staff", client: "Hotel Šumava", owner: jana.id, due: day(-1), priority: "high",
      tasks: [
        { title: "Confirm headcount with the chef", assignee: jana.id, due: day(-4), waiting: "Chef is on holiday until Monday" },
        { title: "Post ads in Klatovy and Sušice", assignee: tomas.id, due: day(-1) },
      ],
    },
    { name: "Internal: update interview scorecard", owner: petr.id, tasks: [] },
    {
      name: "Crane operators 2025", client: "Example Construction", owner: jana.id, archived: true, status: "completed",
      tasks: [{ title: "Invoicing", done: true, assignee: eva.id }],
    },
  ];

  for (const [i, p] of projects.entries()) {
    const [row] = await db
      .insert(s.projects)
      .values({
        workspaceId: ws.id, name: p.name, client: p.client ?? null, ownerId: p.owner ?? null, status: p.status ?? "active",
        priority: p.priority ?? "normal", dueDate: p.due ?? null, notes: p.notes ?? "", position: i, createdBy: jana.id,
        archivedAt: p.archived ? new Date() : null, archivedBy: p.archived ? jana.id : null,
      })
      .returning();
    if (p.tasks.length) {
      await db.insert(s.tasks).values(
        p.tasks.map((t, j) => ({
          workspaceId: ws.id, projectId: row.id, title: t.title, position: j, done: !!t.done,
          completedAt: t.done ? new Date() : null, completedBy: t.done ? (t.assignee ?? jana.id) : null,
          assigneeId: t.assignee ?? null, dueDate: t.due ?? null, waiting: !!t.waiting, waitingReason: t.waiting ?? null, note: t.note ?? "",
        })),
      );
    }
    await db.insert(s.activityEvents).values({ workspaceId: ws.id, actorId: jana.id, projectId: row.id, entityType: "project", entityId: row.id, action: "created" });
  }
  await db.insert(s.favorites).values({ workspaceId: ws.id, membershipId: jana.id, kind: "project", entityId: (await db.select().from(s.projects).where(eq(s.projects.name, "Bricklayer recruitment")))[0].id });

  // A second workspace, so isolation can be tested: its member must never see "main" data.
  const [other] = await db.insert(s.workspaces).values({ name: "Other agency", slug: "other" }).returning();
  const [outsider] = await db
    .insert(s.memberships)
    .values({ workspaceId: other.id, email: "outsider@example.org", displayName: "Olga Outsider", role: "admin", status: authId("outsider@example.org") ? "active" : "invited", userId: authId("outsider@example.org") })
    .returning();
  await db.insert(s.projects).values({ workspaceId: other.id, name: "Other agency project", createdBy: outsider.id });

  console.log(`Seeded workspace "${ws.name}" with ${projects.length} projects and ${members.length} people.`);
}

main().finally(() => pool.end());
