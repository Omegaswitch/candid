import "server-only";
import type { NextRequest } from "next/server";
import { AppError } from "@/server/errors";

const MAX_BYTES = 20 * 1024 * 1024;

/** JSON body with a size cap: a sheet too big for one import gets 413 with a message. */
export async function readJson(req: NextRequest): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new AppError("too_large", "This sheet is too large to import at once. Split it into smaller files.");
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError("unsupported", "Request body must be application/json");
  }
  // Stream with a byte cap, so a chunked body without Content-Length cannot exhaust memory.
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new AppError("too_large", "This sheet is too large to import at once. Split it into smaller files.");
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("invalid", "Request body must be JSON");
  }
}
