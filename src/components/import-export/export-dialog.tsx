"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { fmt, t } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { todayLocal } from "@/lib/dates";
import type { ExportScope } from "@/lib/import/types";
import { cn } from "@/lib/utils";

type Scope = ExportScope["scope"];
type Format = "csv" | "xlsx" | "google";
export type ExportPreset = { scope: Scope; projectIds?: string[] };

const SCOPES: Scope[] = ["project", "selected", "view", "active", "workspace"];

/**
 * Export dialog. Open it with a preset to offer "This project", "Selected" or "Current view":
 * `<ExportDialog open onOpenChange={…} preset={{ scope: "view", projectIds }} />`.
 */
export function ExportDialog({ open, onOpenChange, preset }: { open: boolean; onOpenChange: (open: boolean) => void; preset?: ExportPreset }) {
  const s = t.importExport.export;
  const presetIds = preset?.projectIds ?? [];
  const available = (k: Scope) => (k === "project" || k === "selected" || k === "view" ? preset?.scope === k && presetIds.length > 0 : true);
  const [scope, setScope] = useState<Scope>(preset && available(preset.scope) ? preset.scope : "active");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [format, setFormat] = useState<Format>("xlsx");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleOff, setGoogleOff] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);

  const body: ExportScope = {
    scope,
    ids: scope === "project" ? presetIds.slice(0, 1) : scope === "selected" || scope === "view" ? presetIds : [],
    includeArchived: scope === "workspace" && includeArchived,
  };

  async function run() {
    setBusy(true);
    setError(null);
    setSheetUrl(null);
    try {
      if (format === "google") {
        const r = await api<{ url: string }>(`/api/google/export?today=${todayLocal()}`, { method: "POST", json: { target: "new", scope: body } });
        setSheetUrl(r.url);
        window.open(r.url, "_blank", "noopener");
        return;
      }
      const res = await fetch(`/api/export?today=${todayLocal()}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, format }),
      }).catch(() => null);
      if (!res) throw new ApiError(0, "offline", t.common.offline);
      if (!res.ok) {
        const e = (await res.json().catch(() => null))?.error;
        throw new ApiError(res.status, e?.code ?? "server", e?.message ?? s.failed);
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `candid-export.${format}`;
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onOpenChange(false);
    } catch (e) {
      if (format === "google" && e instanceof ApiError && e.status === 404) {
        setGoogleOff(true);
        setFormat("xlsx");
        setError(null);
      } else {
        setError(e instanceof ApiError && e.isOffline ? t.common.offline : e instanceof Error ? e.message : s.failed);
      }
    } finally {
      setBusy(false);
    }
  }

  const scopeLabel = (k: Scope) =>
    k === "selected" || k === "view" ? fmt(s.scopes[k], { n: available(k) ? presetIds.length : 0 }) : s.scopes[k];

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{s.title}</DialogTitle>
          <DialogDescription>{s.description}</DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-xs text-muted-foreground">{s.scope}</legend>
          {SCOPES.map((k) => (
            <Choice key={k} name="export-scope" value={k} checked={scope === k} disabled={!available(k)} onChange={() => setScope(k)} label={scopeLabel(k)} />
          ))}
          <div className={cn("flex items-center gap-2 pl-6 pt-1", scope !== "workspace" && "opacity-50")}>
            <Checkbox id="export-archived" checked={includeArchived} disabled={scope !== "workspace"} onCheckedChange={(v) => setIncludeArchived(v === true)} />
            <Label htmlFor="export-archived" className="font-normal">
              {s.includeArchived}
            </Label>
          </div>
        </fieldset>

        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-xs text-muted-foreground">{s.format}</legend>
          {(["csv", "xlsx", "google"] as const).map((f) => (
            <Choice
              key={f}
              name="export-format"
              value={f}
              checked={format === f}
              disabled={f === "google" && googleOff}
              onChange={() => setFormat(f)}
              label={s.formats[f]}
              hint={f === "google" && googleOff ? s.googleUnavailable : undefined}
            />
          ))}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-negative">
            {error}
          </p>
        )}
        {sheetUrl && (
          <p role="status" className="flex items-center gap-2 text-sm">
            <span className="text-positive">{s.googleDone}</span>
            <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-3">
              {s.openSheet}
              <ExternalLink className="size-3.5" />
            </a>
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t.common.cancel}
          </Button>
          <Button onClick={run} disabled={busy} aria-busy={busy}>
            {busy && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
            {busy ? s.exporting : s.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Native radio with a label: keyboard and screen readers work without extra code. */
export function Choice(props: { name: string; value: string; checked: boolean; disabled?: boolean; onChange: () => void; label: string; hint?: string }) {
  const id = `${props.name}-${props.value}`;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
        props.disabled ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer hover:bg-muted",
      )}
    >
      <input
        id={id}
        type="radio"
        name={props.name}
        value={props.value}
        checked={props.checked}
        disabled={props.disabled}
        onChange={props.onChange}
        className="mt-0.5 size-4 shrink-0 accent-foreground outline-none"
      />
      <span className="grid gap-0.5">
        <span>{props.label}</span>
        {props.hint && <span className="text-xs text-muted-foreground">{props.hint}</span>}
      </span>
    </label>
  );
}
