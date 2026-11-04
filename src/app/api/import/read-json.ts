import "server-only";
import type { NextRequest } from "next/server";
import { AppError } from "@/server/errors";

const MAX_BYTES = 20 * 1024 * 1024;

/** JSON body with a size cap: a sheet too big for one import gets 413 with a message. */
export async function readJson(req: NextRequest): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new AppError("too_large", "This sheet is too large to import at once. Split it into smaller files.");
  const text = await req.text();
  if (text.length > MAX_BYTES) throw new AppError("too_large", "This sheet is too large to import at once. Split it into smaller files.");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("invalid", "Request body must be JSON");
  }
}
