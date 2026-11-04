/**
 * DEVELOPMENT / PERFORMANCE DATA ONLY. Adds 100 projects × 20 tasks (2,000 tasks) to the demo
 * workspace "main" so the dashboard can be measured at the target size. `--remove` deletes them.
 */
import "dotenv/config";
import { and, eq, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as s from "../src/db/schema";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed load-test data in production.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema: s });
const PREFIX = "Load test ";

async function main() {
  const [ws] = await db.select().from(s.workspaces).where(eq(s.workspaces.slug, "main"));
  if (!ws) throw new Error("Run npm run db:seed first");
  await db.delete(s.projects).where(and(eq(s.projects.workspaceId, ws.id), like(s.projects.name, `${PREFIX}%`)));
  if (process.argv.includes("--remove")) return console.log("Removed load-test projects.");

  const members = await db.select().from(s.memberships).where(eq(s.memberships.workspaceId, ws.id));
  const base = new Date();
  const day = (n: number) => new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate() + n)).toISOString().slice(0, 10);
  const projects = await db
    .insert(s.projects)
    .values(
      Array.from({ length: 100 }, (_, i) => ({
        workspaceId: ws.id,
        name: `${PREFIX}${String(i + 1).padStart(3, "0")} — Stavební dělníci`,
        client: `Klient ${i % 12}`,
        ownerId: members[i % members.length].id,
        status: (["active", "active", "waiting", "completed"] as const)[i % 4],
        priority: i % 7 === 0 ? ("high" as const) : ("normal" as const),
        dueDate: i % 5 === 0 ? null : day((i % 40) - 10),
        position: 100 + i,
      })),
    )
    .returning({ id: s.projects.id });
  const rows = projects.flatMap((p, i) =>
    Array.from({ length: 20 }, (_, j) => ({
      workspaceId: ws.id,
      projectId: p.id,
      title: `Úkol ${j + 1}: oslovit kandidáty`,
      position: j,
      done: j < (i % 21),
      assigneeId: members[(i + j) % members.length].id,
      dueDate: j % 3 === 0 ? day(((i + j) % 30) - 8) : null,
      waiting: j % 17 === 0,
    })),
  );
  for (let k = 0; k < rows.length; k += 500) await db.insert(s.tasks).values(rows.slice(k, k + 500));
  console.log(`Added ${projects.length} projects and ${rows.length} tasks.`);
}
main().finally(() => pool.end());
