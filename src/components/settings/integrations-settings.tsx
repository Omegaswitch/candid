"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { ConnectGoogleButton, GoogleErrorNote, useDisconnectGoogle, useGoogleStatus } from "@/components/google/google-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { t } from "@/i18n";
import { ApiTokensSettings } from "./api-tokens-settings";
import { Field, PageTitle, SettingsSection } from "./settings-section";

const g = t.google;
const s = t.settings.integrations;

/** `connected` / `callbackError` come from the OAuth callback's redirect (?connected=1, ?google_error=…). */
export function IntegrationsSettings({ connected, callbackError }: { connected: boolean; callbackError: string | null }) {
  const status = useGoogleStatus();
  const disconnect = useDisconnectGoogle();

  useEffect(() => {
    if (!connected && !callbackError) return;
    if (connected) toast.success(g.connectedToast);
    // Drop the one-off flag so a reload does not repeat the toast.
    window.history.replaceState(null, "", window.location.pathname);
  }, [connected, callbackError]);

  const data = status.data;
  const lastError = callbackError ? (g.callbackErrors[callbackError] ?? t.common.errorGeneric) : data?.status === "revoked" ? g.revokedNote : null;

  return (
    <>
      <PageTitle>{s.title}</PageTitle>
      <SettingsSection title={s.googleTitle} description={s.googleHelp} aside={<><p className="font-medium text-foreground">{s.accessTitle}</p><p className="mt-1">{s.accessBody}</p></>}>
        {status.isPending ? (
          <div className="flex flex-col gap-4" aria-busy aria-label={t.common.loading}>
            <dl>
              <Field label={g.status}><Skeleton className="inline-block h-5 w-24 rounded-full align-middle" /></Field>
              <Field label={g.account}><div className="flex h-5 items-center"><Skeleton className="h-3.5 w-48" /></div></Field>
              <Field label={g.lastError}><div className="flex h-5 items-center"><Skeleton className="h-3.5 w-6" /></div></Field>
            </dl>
            <div className="flex justify-end border-t pt-4">
              <Skeleton className="h-9 w-32" />
            </div>
          </div>
        ) : status.isError ? (
          <GoogleErrorNote error={new Error(g.loadError)} onRetry={() => status.refetch()} />
        ) : !data!.configured ? (
          <p className="text-muted-foreground">{g.notConfigured}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <dl>
              <Field label={g.status}>
                {data!.connected ? (
                  <span className="rounded-full bg-pill-positive px-2 py-0.5 text-xs font-medium text-pill-positive-ink">{g.statusConnected}</span>
                ) : data!.status === "revoked" ? (
                  <span className="rounded-full bg-pill-negative px-2 py-0.5 text-xs font-medium text-pill-negative-ink">{g.statusRevoked}</span>
                ) : (
                  <span className="rounded-full bg-pill-neutral px-2 py-0.5 text-xs font-medium text-pill-neutral-ink">{g.statusNotConnected}</span>
                )}
              </Field>
              <Field label={g.account}>{data!.email ?? <span className="text-muted-foreground">{t.common.none}</span>}</Field>
              <Field label={g.lastError}>{lastError ? <span role={callbackError ? "alert" : undefined}>{lastError}</span> : <span className="text-muted-foreground">{t.common.none}</span>}</Field>
            </dl>
            {!data!.connected && !data!.status && <p className="text-muted-foreground">{g.notConnectedNote}</p>}
            {disconnect.isError && <GoogleErrorNote error={disconnect.error} onRetry={() => disconnect.mutate()} />}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
              {data!.status && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="lg" className="text-negative hover:text-negative" disabled={disconnect.isPending}>
                      {disconnect.isPending ? g.disconnecting : g.disconnect}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{g.disconnectTitle}</AlertDialogTitle>
                      <AlertDialogDescription>{g.disconnectBody}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => disconnect.mutate(undefined, { onSuccess: () => toast.success(g.disconnected) })}>
                        {g.disconnect}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {!data!.connected && <ConnectGoogleButton reconnect={data!.status === "revoked"} returnTo="/settings/integrations" />}
            </div>
          </div>
        )}
      </SettingsSection>
      <ApiTokensSettings />
    </>
  );
}
