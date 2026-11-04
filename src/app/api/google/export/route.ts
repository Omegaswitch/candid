import { z } from "zod";
import { buildExportBundle, exportScope } from "@/server/export";
import { exportToSheets } from "@/server/google";
import { body, route } from "@/server/http";

const input = exportScope
  .extend({
    target: z.enum(["new", "existing"]),
    spreadsheet: z.string().max(2000).optional(),
    sheetTitle: z.string().max(80).optional(),
  })
  .refine((v) => v.target === "new" || !!v.spreadsheet?.trim(), { message: "Paste the spreadsheet to add the worksheets to", path: ["spreadsheet"] });

/**
 * Body: the CSV/XLSX export scope ({ scope, ids, includeArchived }) plus target / spreadsheet / sheetTitle.
 * `?today=YYYY-MM-DD` dates the spreadsheet / worksheet titles (the client's date). Returns { url }.
 */
export const POST = route(async ({ ctx, req }) => {
  const { target, spreadsheet, sheetTitle, ...scope } = await body(req, input);
  const q = req.nextUrl.searchParams.get("today") ?? "";
  const today = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : new Date().toISOString().slice(0, 10);
  const bundle = await buildExportBundle(ctx, scope);
  return exportToSheets(ctx, bundle, target === "new" ? { target } : { target, spreadsheet: spreadsheet!, sheetTitle }, today);
});
