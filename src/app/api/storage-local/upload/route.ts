import type { NextRequest } from "next/server";
import { localPut, verifyLocalToken } from "@/server/storage";

// Development stand-in for a bucket's presigned POST (STORAGE_DRIVER=local). The signed token is
// the authorisation, exactly like an S3 policy: it names the key, the Content-Type and the size cap.
const fail = (status: number, message: string) => Response.json({ error: { code: "storage", message } }, { status });

export async function POST(req: NextRequest) {
  if (process.env.STORAGE_DRIVER !== "local") return fail(404, "Not found");
  const length = Number(req.headers.get("content-length") ?? 0);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, "Expected multipart form data");
  }
  const t = verifyLocalToken(form.get("token") as string | null);
  if (!t || t.op !== "put") return fail(403, "Upload link is invalid or has expired");
  if (length > t.maxBytes + 64 * 1024) return fail(413, "File is too large");
  if (form.get("Content-Type") !== t.contentType) return fail(403, "Content-Type does not match the upload policy");
  const file = form.get("file");
  if (!(file instanceof Blob)) return fail(400, "Missing file");
  if (file.size < 1 || file.size > t.maxBytes) return fail(413, "File size is outside the allowed range");
  await localPut(t.key, new Uint8Array(await file.arrayBuffer()));
  return new Response(null, { status: 204 });
}
