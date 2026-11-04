import { z } from "zod";
import { readSpreadsheet } from "@/server/google";
import { body, route } from "@/server/http";

const input = z.object({ spreadsheet: z.string().min(1).max(2000), sheetTitles: z.array(z.string().min(1)).max(200).optional() });

/** Returns a ParsedWorkbook (source "google") of evaluated values. */
export const POST = route(async ({ ctx, req }) => {
  const { spreadsheet, sheetTitles } = await body(req, input);
  return readSpreadsheet(ctx, spreadsheet, sheetTitles);
});
