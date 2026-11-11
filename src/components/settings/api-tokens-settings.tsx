"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt, t } from "@/i18n";
import { api } from "@/lib/api";
import { formatInstant, formatRelative } from "@/lib/dates";
import { qk } from "@/lib/query-keys";
import type { ApiTokenDto } from "@/server/api-tokens";
import type { OAuthGrantDto } from "@/server/oauth";
import { SettingsSection } from "./settings-section";

const s = t.settings.apiTokens;

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code aria-label={label} className="min-w-0 flex-1 rounded-md border bg-raised px-2 py-1.5 font-mono text-xs break-all">
        {value}
      </code>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        {copied ? s.copied : s.copy}
      </Button>
    </div>
  );
}

/** A destructive ghost button behind a confirmation dialog (revoke a token, disconnect an app). */
function ConfirmRevoke({ label, ariaLabel, title, body, onConfirm }: { label: string; ariaLabel: string; title: string; body: string; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-negative hover:text-negative" aria-label={ariaLabel}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * The MCP endpoint: apps connected through OAuth (Claude, ChatGPT) and personal access tokens for
 * clients that cannot sign in. Every member sees and manages only their own.
 */
export function ApiTokensSettings() {
  const qc = useQueryClient();
  const nameId = useId();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);

  const list = useQuery({
    queryKey: qk.apiTokens(),
    queryFn: () => api<{ tokens: ApiTokenDto[]; grants: OAuthGrantDto[]; endpoint: string | null }>("/api/tokens"),
  });
  const create = useMutation({
    mutationFn: (n: string) => api<{ token: ApiTokenDto & { token: string } }>("/api/tokens", { method: "POST", json: { name: n } }),
    onSuccess: (r) => {
      setFresh(r.token.token);
      setName("");
      qc.invalidateQueries({ queryKey: qk.apiTokens() });
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (tok: ApiTokenDto) => api(`/api/tokens/${tok.id}`, { method: "DELETE" }),
    onSuccess: (_, tok) => {
      toast.success(fmt(s.revoked, { name: tok.name }));
      qc.invalidateQueries({ queryKey: qk.apiTokens() });
    },
    onError: (e) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: (g: OAuthGrantDto) => api(`/api/oauth-grants/${g.id}`, { method: "DELETE" }),
    onSuccess: (_, g) => {
      toast.success(fmt(s.disconnected, { name: g.clientName }));
      qc.invalidateQueries({ queryKey: qk.apiTokens() });
    },
    onError: (e) => toast.error(e.message),
  });

  // Data only exists in the browser, so reading `location` here never causes a hydration mismatch.
  const endpoint = list.data ? (list.data.endpoint ?? `${window.location.origin}/api/mcp`) : null;

  return (
    <SettingsSection
      title={s.title}
      description={s.help}
      aside={
        <>
          <p className="font-medium text-foreground">{s.howTitle}</p>
          <p className="mt-1">{s.howClaude}</p>
          <p className="mt-2">{s.howHeader}</p>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-muted-foreground">{s.endpoint}</span>
          {endpoint ? <CopyField value={endpoint} label={s.endpoint} /> : <Skeleton className="h-8 w-full" />}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-medium">{s.appsTitle}</h3>
          {list.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : list.isError ? (
            <p className="text-negative">{s.appsLoadError}</p>
          ) : list.data.grants.length === 0 ? (
            <p className="text-muted-foreground">{s.appsEmpty}</p>
          ) : (
            <ul className="divide-y">
              {list.data.grants.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{g.clientName}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.redirectHost && <code className="font-mono">{g.redirectHost}</code>}
                      {g.redirectHost && " · "}
                      {fmt(s.connectedAt, { date: formatInstant(g.createdAt) })} ·{" "}
                      {g.lastUsedAt ? fmt(s.lastUsed, { when: formatRelative(g.lastUsedAt) }) : s.neverUsed}
                    </p>
                  </div>
                  <ConfirmRevoke
                    label={s.disconnect}
                    ariaLabel={fmt(s.disconnectFor, { name: g.clientName })}
                    title={fmt(s.disconnectTitle, { name: g.clientName })}
                    body={s.disconnectBody}
                    onConfirm={() => disconnect.mutate(g)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-1 border-t pt-4">
          <h3 className="font-medium">{s.listTitle}</h3>
          <p className="text-muted-foreground">{s.tokensHelp}</p>
        </div>

        {fresh && (
          <div role="status" className="flex flex-col gap-2 rounded-md border border-warning/40 bg-pill-warning/40 p-3">
            <p className="font-medium">{s.createdTitle}</p>
            <p className="text-muted-foreground">{s.createdBody}</p>
            <CopyField value={fresh} label={s.createdTitle} />
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setFresh(null)}>
                {s.done}
              </Button>
            </div>
          </div>
        )}

        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate(name.trim());
          }}
        >
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <Label htmlFor={nameId}>{s.name}</Label>
            <Input id={nameId} value={name} maxLength={100} placeholder={s.namePlaceholder} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" size="lg" disabled={!name.trim() || create.isPending}>
            {create.isPending ? s.creating : s.create}
          </Button>
        </form>

        <div className="flex flex-col gap-2">
          {list.isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : list.isError ? (
            <p className="text-negative">{s.loadError}</p>
          ) : list.data.tokens.length === 0 ? (
            <p className="text-muted-foreground">{s.empty}</p>
          ) : (
            <ul className="divide-y">
              {list.data.tokens.map((tok) => (
                <li key={tok.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{tok.name}</p>
                    <p className="text-xs text-muted-foreground">
                      <code className="font-mono">{tok.prefix}…</code> · {fmt(s.createdAt, { date: formatInstant(tok.createdAt) })} ·{" "}
                      {tok.lastUsedAt ? fmt(s.lastUsed, { when: formatRelative(tok.lastUsedAt) }) : s.neverUsed}
                    </p>
                  </div>
                  <ConfirmRevoke
                    label={s.revoke}
                    ariaLabel={fmt(s.revokeFor, { name: tok.name })}
                    title={fmt(s.revokeTitle, { name: tok.name })}
                    body={s.revokeBody}
                    onConfirm={() => revoke.mutate(tok)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
