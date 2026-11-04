import type { NextRequest } from "next/server";
import { z } from "zod";
import { buildExportBundle, CSV_TYPE, downloadHeaders, exportScope, toCsv, toXlsx, XLSX_TYPE } from "@/server/export";
import { body, route } from "@/server/http";
import type { Ctx } from "@/server/context";

const format = z.enum(["csv", "xlsx"]);
const today = (req: NextRequest) => {
  const v = req.nextUrl.searchParams.get("today");
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : new Date().toISOString().slice(0, 10);
};

async function download(ctx: Ctx, req: NextRequest, fmt: "csv" | "xlsx", scope: z.input<typeof exportScope>) {
  const bundle = await buildExportBundle(ctx, scope);
  const name = `candid-${scope.scope === "workspace" ? "workspace" : "projects"}-${today(req)}.${fmt}`;
  if (fmt === "csv") return new Response(toCsv(bundle.flat), { headers: downloadHeaders(name, CSV_TYPE) });
  return new Response((await toXlsx(bundle)) as BodyInit, { headers: downloadHeaders(name, XLSX_TYPE) });
}

/** GET /api/export?format=csv|xlsx&scope=project|selected|view|active|workspace&ids=a,b&includeArchived=1 */
export const GET = route(async ({ ctx, req }) => {
  const q = req.nextUrl.searchParams;
  const ids = (q.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return download(ctx, req, format.parse(q.get("format") ?? "csv"), {
    scope: exportScope.shape.scope.parse(q.get("scope") ?? "active"),
    ids,
    includeArchived: q.get("includeArchived") === "1",
  });
});

/** Same as GET, for long id lists: body { format, scope, ids, includeArchived }. */
export const POST = route(async ({ ctx, req }) => {
  const { format: f, ...scope } = await body(req, exportScope.extend({ format }));
  return download(ctx, req, f, scope);
});
