import "server-only";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import type { Ctx } from "./context";

/** Per-member UI state: remembered view, filters, sort and sidebar. Unknown keys are dropped. */
export const prefsSchema = z.object({
  view: z.enum(["grid", "table", "board"]).default("grid"),
  sort: z.enum(["manual", "due", "name", "activity"]).default("manual"),
  filters: z
    .object({
      ownerId: z.string().nullable().default(null),
      status: z.enum(["active", "waiting", "completed"]).nullable().default(null),
      priority: z.enum(["normal", "high"]).nullable().default(null),
      due: z.enum(["overdue", "week", "month", "none"]).nullable().default(null),
      labelId: z.string().nullable().default(null),
      /** "Mine": projects I own or where I have open steps. */
      mine: z.boolean().default(false),
    })
    .default({ ownerId: null, status: null, priority: null, due: null, labelId: null, mine: false }),
  sidebarCollapsed: z.boolean().default(false),
  completedCollapsed: z.boolean().default(true),
  checklistByPerson: z.boolean().default(false),
});
export type Prefs = z.infer<typeof prefsSchema>;

export async function getPrefs(ctx: Ctx): Promise<Prefs> {
  const [row] = await db.select().from(userPreferences).where(eq(userPreferences.membershipId, ctx.membershipId));
  const parsed = prefsSchema.safeParse(row?.prefs ?? {});
  return parsed.success ? parsed.data : prefsSchema.parse({});
}

export async function savePrefs(ctx: Ctx, patch: Partial<Prefs>): Promise<Prefs> {
  const next = prefsSchema.parse({ ...(await getPrefs(ctx)), ...patch });
  await db
    .insert(userPreferences)
    .values({ membershipId: ctx.membershipId, workspaceId: ctx.workspaceId, prefs: next })
    .onConflictDoUpdate({ target: userPreferences.membershipId, set: { prefs: next, updatedAt: sql`now()` } });
  return next;
}
