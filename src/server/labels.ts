import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { labels, projectLabels } from "@/db/schema";
import { logActivity } from "./activity";
import type { Ctx } from "./context";
import { AppError, notFound } from "./errors";
import { loadProject, touchProject } from "./projects";

/** Palette keys map to the pill colour tokens in globals.css; never raw CSS. */
const LABEL_COLORS = ["neutral", "hue", "positive", "warning", "negative"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];
export type Label = { id: string; name: string; color: LabelColor };

export const labelInput = z.object({ name: z.string().trim().min(1).max(60), color: z.enum(LABEL_COLORS).default("neutral") });
export const labelPatch = z.object({ name: labelInput.shape.name.optional(), color: z.enum(LABEL_COLORS).optional() });

const cols = { id: labels.id, name: labels.name, color: labels.color };
const duplicate = (e: unknown) => {
  // Unique (workspace, name): a second label with the same name is a user error, not a 500.
  const code = (e as { code?: string; cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
  if (code === "23505") throw new AppError("invalid", "A label with this name already exists");
  throw e;
};

export async function listLabels(ctx: Ctx): Promise<Label[]> {
  return (await db.select(cols).from(labels).where(eq(labels.workspaceId, ctx.workspaceId)).orderBy(asc(labels.name))) as Label[];
}

export async function createLabel(ctx: Ctx, raw: z.input<typeof labelInput>): Promise<Label> {
  const input = labelInput.parse(raw);
  const [l] = await db.insert(labels).values({ ...input, workspaceId: ctx.workspaceId }).returning(cols).catch(duplicate);
  return l as Label;
}

export async function updateLabel(ctx: Ctx, id: string, raw: z.input<typeof labelPatch>): Promise<Label> {
  const patch = labelPatch.parse(raw);
  const [l] = await db
    .update(labels)
    .set(patch)
    .where(and(eq(labels.id, id), eq(labels.workspaceId, ctx.workspaceId)))
    .returning(cols)
    .catch(duplicate);
  if (!l) throw notFound("Label");
  return l as Label;
}

export async function deleteLabel(ctx: Ctx, id: string) {
  const [l] = await db.delete(labels).where(and(eq(labels.id, id), eq(labels.workspaceId, ctx.workspaceId))).returning({ id: labels.id });
  if (!l) throw notFound("Label");
}

/** Replaces the project's labels with exactly `labelIds` (all must belong to this workspace). */
export async function setProjectLabels(ctx: Ctx, projectId: string, labelIds: string[]) {
  const ids = [...new Set(labelIds)];
  await loadProject(ctx, projectId);
  if (ids.length) {
    const owned = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.workspaceId, ctx.workspaceId), inArray(labels.id, ids)));
    if (owned.length !== ids.length) throw notFound("Label");
  }
  await db.transaction(async (tx) => {
    await tx.delete(projectLabels).where(eq(projectLabels.projectId, projectId));
    if (ids.length) await tx.insert(projectLabels).values(ids.map((labelId) => ({ projectId, labelId })));
    await touchProject(ctx, projectId, tx);
    await logActivity(ctx, { projectId, entityType: "project", entityId: projectId, action: "edited", data: { fields: ["labels"] } }, tx);
  });
  return ids;
}
