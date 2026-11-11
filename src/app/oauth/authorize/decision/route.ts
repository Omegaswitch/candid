import type { NextRequest } from "next/server";
import { t } from "@/i18n";
import { getCtx } from "@/server/context";
import { baseUrl, checkAuthorizeRequest, denyUrl, issueCode } from "@/server/oauth";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Leaves for the client's redirect URI with a JS-free meta refresh (and a link as fallback) rather
 * than a 303: browsers apply CSP form-action to redirects that follow a form submission, and the
 * client's origin (claude.ai, chatgpt.com, localhost:<port>) cannot be listed there in advance.
 */
function navigate(url: string) {
  const u = escapeHtml(url);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${u}"><title>${escapeHtml(t.oauth.continueTitle)}</title></head><body style="font-family:system-ui,sans-serif;padding:2rem"><p>${escapeHtml(t.oauth.continueTitle)}</p><p><a href="${u}">${escapeHtml(t.oauth.continueLink)}</a></p></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

/** The consent form's target. Re-validates the whole authorization request before issuing a code. */
export async function POST(req: NextRequest) {
  // Only our own consent page may post here (SameSite cookies aside): no cross-site consent.
  const origin = req.headers.get("origin");
  if (origin ? origin !== req.nextUrl.origin && origin !== baseUrl(req) : req.headers.get("sec-fetch-site") === "cross-site")
    return text("Cross-site request refused", 403);
  const ctx = await getCtx();
  if (!ctx) return text("Sign in to continue", 401);

  const form = await req.formData();
  const params = new URLSearchParams();
  for (const [k, v] of form) if (typeof v === "string") params.set(k, v);
  const base = baseUrl(req);
  const check = await checkAuthorizeRequest(params, base);
  if (!check.ok) return check.redirect ? navigate(check.redirect) : text("Invalid authorization request", 400);
  return navigate(params.get("decision") === "allow" ? await issueCode(ctx, check.request, base) : denyUrl(check.request, base));
}
