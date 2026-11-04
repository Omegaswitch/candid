import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { purgeRemovedDocuments } from "@/server/documents";
import { purgeTrash } from "@/server/trash";

/** Daily job (vercel.json). Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    return new NextResponse(null, { status: 401 });
  }
  // Daily: erase what has been in the trash for more than 10 days.
  const [docs, trash] = await Promise.all([purgeRemovedDocuments(), purgeTrash()]);
  return NextResponse.json({ ...docs, ...trash });
}
