import { z } from "zod";
import { exportToSheets } from "@/server/google";
import { body, route } from "@/server/http";

const input = z
  .object({
    target: z.enum(["new", "existing"]),
    spreadsheet: z.string().max(2000).optional(),
    sheetTitle: z.string().max(80).optional(),
  })
  .loose()
  .refine((v) => v.target === "new" || !!v.spreadsheet?.trim(), { message: "Paste the spreadsheet to add the worksheets to", path: ["spreadsheet"] });

/**
 * Body: the same scope fields as the CSV/XLSX export, plus target / spreadsheet / sheetTitle.
 * `?today=YYYY-MM-DD` names the export (the client's date).
 */
export const POST = route(async ({ ctx, req }) => {
  const { target, spreadsheet, sheetTitle, ...scope } = await body(req, input);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(req.nextUrl.searchParams.get("today") ?? "")
    ? req.nextUrl.searchParams.get("today")!
    : new Date().toISOString().slice(0, 10);
  // Built by the CSV/XLSX export feature; loaded on demand so this route has no hard dependency at build.
  const { buildExportBundle } = await import("@/server/export");
  const bundle = await buildExportBundle(ctx, (scope as { scope?: unknown }).scope ?? scope);
  return exportToSheets(ctx, bundle, target === "new" ? { target } : { target, spreadsheet: spreadsheet!, sheetTitle }, today);
});
