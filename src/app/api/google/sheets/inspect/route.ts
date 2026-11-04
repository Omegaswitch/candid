import { z } from "zod";
import { inspectSpreadsheet } from "@/server/google";
import { body, route } from "@/server/http";

const input = z.object({ spreadsheet: z.string().min(1).max(2000) });

export const POST = route(async ({ ctx, req }) => {
  const { spreadsheet } = await body(req, input);
  const { title, sheets } = await inspectSpreadsheet(ctx, spreadsheet);
  return { title, sheets: sheets.map((s) => ({ title: s.title, rowCount: s.rowCount })) };
});
