import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z, type ZodType } from "zod";
import { requireCtx, type Ctx, type Role } from "./context";
import { AppError } from "./errors";

type RouteArgs = { params: Promise<Record<string, string>> };
type Handler = (args: { ctx: Ctx; req: NextRequest; params: Record<string, string> }) => Promise<unknown>;

/**
 * Wraps a route handler: authenticates, checks the role, maps AppError/ZodError to JSON.
 * Return a plain object (sent as JSON), a Response, or undefined (204).
 */
export function route(handler: Handler, opts: { role?: Role } = {}) {
  return async (req: NextRequest, args: RouteArgs) => {
    try {
      assertSameOrigin(req);
      const ctx = await requireCtx(opts.role);
      const params = (await args?.params) ?? {};
      const out = await handler({ ctx, req, params });
      if (out instanceof Response) return out;
      if (out === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
/** CSRF defence beyond SameSite: writes must come from our own pages (Origin), never cross-site. */
export function assertSameOrigin(req: NextRequest) {
  if (SAFE.has(req.method)) return;
  const origin = req.headers.get("origin");
  const allowed = new Set([req.nextUrl.origin, process.env.APP_URL].filter(Boolean));
  if (origin ? !allowed.has(origin) : req.headers.get("sec-fetch-site") === "cross-site") {
    throw new AppError("forbidden", "Cross-site request refused");
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof AppError) {
    return NextResponse.json({ error: { code: e.code, message: e.message, details: e.details } }, { status: e.status });
  }
  if (e instanceof z.ZodError) {
    return NextResponse.json(
      { error: { code: "invalid", message: "Some values are not valid", details: z.flattenError(e) } },
      { status: 422 },
    );
  }
  console.error(e);
  return NextResponse.json({ error: { code: "server", message: "Something went wrong on the server" } }, { status: 500 });
}

export async function body<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  // Only real JSON requests: a plain HTML form (text/plain) cannot reach these endpoints.
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError("unsupported", "Request body must be application/json");
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new AppError("invalid", "Request body must be JSON");
  }
  return schema.parse(json);
}

export const uuidParam = (v: string | undefined, what = "Record") => {
  if (!v || !z.uuid().safeParse(v).success) throw new AppError("not_found", `${what} not found`);
  return v;
};
