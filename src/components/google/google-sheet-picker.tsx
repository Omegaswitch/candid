"use client";

import { useMutation } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fmt, plural, t } from "@/i18n";
import { api } from "@/lib/api";
import type { ParsedWorkbook } from "@/lib/import/types";
import { ConnectGoogleButton, GoogleErrorNote, useGoogleStatus } from "./google-client";

type Inspected = { title: string; sheets: { title: string; rowCount: number }[] };
const s = t.google.picker;

/** Import source step: connect Google if needed, pick a spreadsheet, return its evaluated values. */
export function GoogleSheetPicker({ onLoaded }: { onLoaded: (wb: ParsedWorkbook) => void }) {
  const status = useGoogleStatus();
  const id = useId();
  const [spreadsheet, setSpreadsheet] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const inspect = useMutation({
    mutationFn: (v: string) => api<Inspected>("/api/google/sheets/inspect", { method: "POST", json: { spreadsheet: v } }),
    onSuccess: (r) => setPicked(r.sheets.map((x) => x.title)),
  });
  const read = useMutation({
    mutationFn: () => api<ParsedWorkbook>("/api/google/sheets/read", { method: "POST", json: { spreadsheet, sheetTitles: picked } }),
    onSuccess: onLoaded,
  });

  if (status.isPending) return <Skeleton className="h-24 w-full" />;
  if (status.isError) return <GoogleErrorNote error={status.error} onRetry={() => status.refetch()} />;
  const g = status.data;
  if (!g.configured) return <p className="text-muted-foreground">{t.google.notConfigured}</p>;
  if (!g.connected) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">{g.status === "revoked" ? t.google.revokedNote : t.google.notConnectedNote}</p>
        <ConnectGoogleButton reconnect={g.status === "revoked"} />
      </div>
    );
  }

  const meta = inspect.data;
  return (
    <div className="flex flex-col gap-4">
      {g.email && <p className="text-xs text-muted-foreground">{fmt(s.connectedAs, { email: g.email })}</p>}

      {!meta ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (spreadsheet.trim()) inspect.mutate(spreadsheet.trim());
          }}
        >
          <Label htmlFor={`${id}-url`}>{s.spreadsheet}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`${id}-url`}
              className="h-9 flex-1"
              value={spreadsheet}
              onChange={(e) => setSpreadsheet(e.target.value)}
              placeholder={s.placeholder}
              aria-describedby={`${id}-hint`}
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" size="lg" disabled={!spreadsheet.trim() || inspect.isPending}>
              {inspect.isPending ? s.inspecting : s.inspect}
            </Button>
          </div>
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {s.spreadsheetHint}
          </p>
          {inspect.isError && <GoogleErrorNote error={inspect.error} />}
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-base font-medium">{meta.title}</p>
            <Button
              variant="link"
              className="h-auto p-0"
              onClick={() => {
                inspect.reset();
                read.reset();
              }}
            >
              {s.change}
            </Button>
          </div>
          {meta.sheets.length === 0 ? (
            <p className="text-muted-foreground">{s.noSheets}</p>
          ) : (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-2 font-medium">{s.worksheets}</legend>
              {meta.sheets.map((sh, i) => (
                <label key={sh.title} htmlFor={`${id}-s${i}`} className="flex h-9 items-center gap-3 rounded-md px-2 hover:bg-muted">
                  <Checkbox
                    id={`${id}-s${i}`}
                    checked={picked.includes(sh.title)}
                    onCheckedChange={(on) => setPicked((p) => (on ? [...p, sh.title] : p.filter((x) => x !== sh.title)))}
                  />
                  <span className="min-w-0 flex-1 truncate">{sh.title}</span>
                  <span className="num text-xs text-muted-foreground">{plural(sh.rowCount, s.rows)}</span>
                </label>
              ))}
            </fieldset>
          )}
          {read.isError && <GoogleErrorNote error={read.error} onRetry={() => read.mutate()} />}
          <div className="flex items-center gap-3">
            <Button size="lg" disabled={!picked.length || read.isPending} onClick={() => read.mutate()}>
              {read.isPending ? s.loading : s.load}
            </Button>
            {!picked.length && meta.sheets.length > 0 && <span className="text-xs text-muted-foreground">{s.pickOne}</span>}
          </div>
          <p className="sr-only" aria-live="polite">
            {read.isPending ? s.loading : ""}
          </p>
        </div>
      )}
    </div>
  );
}
