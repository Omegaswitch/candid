"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { t } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import type { GoogleStatus } from "@/server/google";

export const googleStatusKey = ["google", "status"] as const;

export function useGoogleStatus() {
  return useQuery({ queryKey: googleStatusKey, queryFn: () => api<GoogleStatus>("/api/google/status"), refetchInterval: false });
}

export function useDisconnectGoogle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api("/api/google/disconnect", { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: googleStatusKey }),
  });
}

/** True for the server's "token expired or revoked" error: show the Reconnect button. */
export const isReconnectError = (e: unknown) =>
  e instanceof ApiError && !!(e.details as { reconnect?: boolean } | undefined)?.reconnect;

/** Same-tab navigation to Google; the callback returns the browser to `returnTo`. */
export const connectHref = (returnTo: string) => `/api/google/connect?returnTo=${encodeURIComponent(returnTo)}`;

export function ConnectGoogleButton({ reconnect = false, returnTo, variant = "default" }: { reconnect?: boolean; returnTo?: string; variant?: "default" | "outline" }) {
  const pathname = usePathname();
  return (
    <Button asChild variant={variant} size="lg">
      {/* A plain link: the OAuth flow is a full-page navigation. */}
      <a href={connectHref(returnTo ?? pathname)}>
        {reconnect && <RefreshCw aria-hidden />}
        {reconnect ? t.google.reconnect : t.google.connect}
      </a>
    </Button>
  );
}

/** Error text inside the block that failed, with Reconnect for token problems. */
export function GoogleErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : t.common.errorGeneric;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-pill-negative bg-pill-negative px-3 py-2 text-pill-negative-ink">
      <p className="min-w-0 flex-1">{message}</p>
      {isReconnectError(error) ? (
        <ConnectGoogleButton reconnect variant="outline" />
      ) : onRetry ? (
        <Button variant="outline" size="lg" onClick={onRetry}>
          {t.common.retry}
        </Button>
      ) : null}
    </div>
  );
}
