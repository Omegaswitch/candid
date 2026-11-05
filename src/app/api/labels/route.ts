import { body, route } from "@/server/http";
import { createLabel, labelInput, listLabels } from "@/server/labels";

export const GET = route(async ({ ctx }) => ({ labels: await listLabels(ctx) }));
export const POST = route(async ({ ctx, req }) => ({ label: await createLabel(ctx, await body(req, labelInput)) }));
