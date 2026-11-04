import { downloadHeaders, templateXlsx, XLSX_TYPE } from "@/server/export";
import { route } from "@/server/http";

/** The import template: header, two example rows and an Instructions sheet. */
export const GET = route(async ({ ctx }) => {
  const bytes = await templateXlsx(ctx.email);
  return new Response(bytes as BodyInit, { headers: downloadHeaders("candid-import-template.xlsx", XLSX_TYPE) });
});
