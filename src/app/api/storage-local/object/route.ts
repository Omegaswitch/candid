import { readFile } from "node:fs/promises";
import type { NextRequest } from "next/server";
import { localPath, verifyLocalToken } from "@/server/storage";

// Development stand-in for a bucket's presigned GET (STORAGE_DRIVER=local): valid for 60 s.
export async function GET(req: NextRequest) {
  if (process.env.STORAGE_DRIVER !== "local") return new Response("Not found", { status: 404 });
  const t = verifyLocalToken(req.nextUrl.searchParams.get("token"));
  if (!t || t.op !== "get") return new Response("Link is invalid or has expired", { status: 403 });
  let bytes: Buffer;
  try {
    bytes = await readFile(localPath(t.key));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": t.contentType,
      "Content-Disposition": t.disposition,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
