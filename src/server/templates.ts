import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type Tx } from "@/db";
import { projectTemplates, templateTasks } from "@/db/schema";
import { logActivity } from "./activity";
import type { Ctx } from "./context";
import { AppError, conflict, notFound } from "./errors";

export type TemplateTaskDto = { id: string; title: string; note: string };
export type TemplateDto = { id: string; name: string; description: string | null; version: number; isDefault: boolean; tasks: TemplateTaskDto[] };

const DEFAULT_TEMPLATES = [
  {
    name: "Recruitment",
    description: "Standard checklist for a recruitment project",
    tasks: ["Candidate outreach", "Write email", "Invoicing", "Presentation"],
  },
];

export const templateInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((s) => s || null),
  tasks: z
    .array(z.object({ title: z.string().trim().min(1, "Task title is required").max(200), note: z.string().max(2000).default("") }))
    .max(100),
});
export const templatePatch = templateInput.extend({ version: z.number().int().positive() });

const requireAdmin = (ctx: Ctx) => {
  if (ctx.role !== "admin") throw new AppError("forbidden", "Only admins can change templates");
};

export async function listTemplates(ctx: Ctx, tx: Tx | typeof db = db): Promise<TemplateDto[]> {
  const tpls = await tx
    .select()
    .from(projectTemplates)
    .where(and(eq(projectTemplates.workspaceId, ctx.workspaceId), isNull(projectTemplates.archivedAt)))
    .orderBy(desc(projectTemplates.isDefault), asc(projectTemplates.name));
  if (!tpls.length) return [];
  const rows = await tx
    .select()
    .from(templateTasks)
    .where(inArray(templateTasks.templateId, tpls.map((t) => t.id)))
    .orderBy(asc(templateTasks.position));
  return tpls.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    version: t.version,
    isDefault: t.isDefault,
    tasks: rows.filter((r) => r.templateId === t.id).map((r) => ({ id: r.id, title: r.title, note: r.note })),
  }));
}

async function getTemplate(ctx: Ctx, id: string, tx: Tx | typeof db = db) {
  const t = (await listTemplates(ctx, tx)).find((x) => x.id === id);
  if (!t) throw notFound("Template");
  return t;
}

/**
 * Seeds the default "Recruitment" template for a workspace that has never had any.
 * Deleted templates are archived, so deleting the default does not bring it back.
 */
export async function ensureDefaultTemplates(ctx: Ctx) {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(projectTemplates)
    .where(eq(projectTemplates.workspaceId, ctx.workspaceId));
  if (n > 0) return;
  await db.transaction(async (tx) => {
    for (const d of DEFAULT_TEMPLATES) {
      const [tpl] = await tx
        .insert(projectTemplates)
        .values({ workspaceId: ctx.workspaceId, name: d.name, description: d.description, isDefault: true })
        .onConflictDoNothing()
        .returning();
      if (!tpl) continue; // a concurrent request seeded it
      await tx.insert(templateTasks).values(d.tasks.map((title, i) => ({ templateId: tpl.id, title, position: i })));
    }
  });
}

/** Makes one template the checklist every new project starts with (one default per workspace). */
export async function setDefaultTemplate(ctx: Ctx, id: string) {
  requireAdmin(ctx);
  await db.transaction(async (tx) => {
    await getTemplate(ctx, id, tx);
    await tx.update(projectTemplates).set({ isDefault: false }).where(and(eq(projectTemplates.workspaceId, ctx.workspaceId), eq(projectTemplates.isDefault, true)));
    await tx.update(projectTemplates).set({ isDefault: true, updatedAt: new Date() }).where(and(eq(projectTemplates.id, id), eq(projectTemplates.workspaceId, ctx.workspaceId)));
    await logActivity(ctx, { entityType: "template", entityId: id, action: "made_default" }, tx);
  });
}

/** The default template's steps, for new projects created without an explicit checklist. */
export async function defaultTemplateId(ctx: Ctx, tx: Tx | typeof db = db) {
  const [d] = await tx
    .select({ id: projectTemplates.id })
    .from(projectTemplates)
    .where(and(eq(projectTemplates.workspaceId, ctx.workspaceId), eq(projectTemplates.isDefault, true), isNull(projectTemplates.archivedAt)));
  return d?.id ?? null;
}

/** Archived templates keep their row; free the name so a new template can use it. */
async function freeName(ctx: Ctx, name: string, exceptId: string | null, tx: Tx) {
  const clash = await tx
    .select({ id: projectTemplates.id, archivedAt: projectTemplates.archivedAt })
    .from(projectTemplates)
    .where(and(eq(projectTemplates.workspaceId, ctx.workspaceId), eq(projectTemplates.name, name)));
  for (const c of clash) {
    if (c.id === exceptId) continue;
    if (!c.archivedAt) throw new AppError("invalid", "A template with this name already exists");
    await tx.delete(projectTemplates).where(and(eq(projectTemplates.id, c.id), isNotNull(projectTemplates.archivedAt)));
  }
}

const taskRows = (templateId: string, tasks: { title: string; note: string }[]) =>
  tasks.map((t, i) => ({ templateId, title: t.title, note: t.note, position: i }));

export async function createTemplate(ctx: Ctx, raw: z.input<typeof templateInput>): Promise<TemplateDto> {
  requireAdmin(ctx);
  const input = templateInput.parse(raw);
  return db.transaction(async (tx) => {
    await freeName(ctx, input.name, null, tx);
    const [tpl] = await tx
      .insert(projectTemplates)
      .values({ workspaceId: ctx.workspaceId, name: input.name, description: input.description, createdBy: ctx.membershipId })
      .returning();
    if (input.tasks.length) await tx.insert(templateTasks).values(taskRows(tpl.id, input.tasks));
    await logActivity(ctx, { entityType: "template", entityId: tpl.id, action: "created", data: { name: tpl.name, tasks: input.tasks.length } }, tx);
    return getTemplate(ctx, tpl.id, tx);
  });
}

/** Replaces name, description and the whole task list in one transaction; a stale `version` is a 409. */
export async function updateTemplate(ctx: Ctx, id: string, raw: z.input<typeof templatePatch>): Promise<TemplateDto> {
  requireAdmin(ctx);
  const { version, ...input } = templatePatch.parse(raw);
  return db.transaction(async (tx) => {
    await getTemplate(ctx, id, tx);
    await freeName(ctx, input.name, id, tx);
    const [tpl] = await tx
      .update(projectTemplates)
      .set({ name: input.name, description: input.description, version: sql`${projectTemplates.version} + 1`, updatedAt: new Date() })
      .where(
        and(
          eq(projectTemplates.id, id),
          eq(projectTemplates.workspaceId, ctx.workspaceId),
          isNull(projectTemplates.archivedAt),
          eq(projectTemplates.version, version),
        ),
      )
      .returning();
    if (!tpl) throw conflict(await getTemplate(ctx, id, tx));
    await tx.delete(templateTasks).where(eq(templateTasks.templateId, id));
    if (input.tasks.length) await tx.insert(templateTasks).values(taskRows(id, input.tasks));
    await logActivity(ctx, { entityType: "template", entityId: id, action: "updated", data: { name: tpl.name, tasks: input.tasks.length } }, tx);
    return getTemplate(ctx, id, tx);
  });
}

/** Archives the template. Projects created from it keep their copied tasks. */
export async function deleteTemplate(ctx: Ctx, id: string) {
  requireAdmin(ctx);
  const [tpl] = await db
    .update(projectTemplates)
    .set({ archivedAt: new Date(), isDefault: false, updatedAt: new Date() })
    .where(and(eq(projectTemplates.id, id), eq(projectTemplates.workspaceId, ctx.workspaceId), isNull(projectTemplates.archivedAt)))
    .returning();
  if (!tpl) throw notFound("Template");
  await logActivity(ctx, { entityType: "template", entityId: id, action: "deleted", data: { name: tpl.name } });
}
