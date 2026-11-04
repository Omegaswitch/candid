"use client";

import { ClipboardPaste, FileSpreadsheet, Sheet as SheetIcon, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { GoogleSheetPicker } from "@/components/google/google-sheet-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fmt, plural, t } from "@/i18n";
import { parseDate } from "@/lib/import/dates";
import { mappingIsUsable } from "@/lib/import/mapping";
import { ParseError, parseFile, parsePaste } from "@/lib/import/parse";
import { IMPORT_FIELDS, type Cell, type DateOrder, type ImportField, type ImportMode, type ParsedWorkbook } from "@/lib/import/types";
import { cn } from "@/lib/utils";
import { Choice } from "./export-dialog";
import type { DateQuestion } from "./import-wizard";

const s = t.importExport;

// ------------------------------------------------------------------------------------ 1 Source

export function SourceStep(props: {
  wb: ParsedWorkbook | null;
  sheetIdx: number;
  rowCount: number;
  onLoaded: (wb: ParsedWorkbook) => void;
  onSheet: (i: number) => void;
}) {
  const { wb } = props;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState("");

  async function read(file: File) {
    setBusy(file.name);
    setError(null);
    try {
      props.onLoaded(await parseFile(file));
    } catch (e) {
      setError(e instanceof ParseError ? s.source.errors[e.code] : s.source.errors.unreadable);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      <Tabs defaultValue={wb?.source === "paste" ? "paste" : wb?.source === "google" ? "google" : "upload"}>
        <TabsList>
          <TabsTrigger value="upload">
            <Upload className="size-4" />
            {s.source.upload}
          </TabsTrigger>
          <TabsTrigger value="paste">
            <ClipboardPaste className="size-4" />
            {s.source.paste}
          </TabsTrigger>
          <TabsTrigger value="google">
            <SheetIcon className="size-4" />
            {s.source.google}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="pt-3">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) read(f);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center transition-colors duration-150",
              dragging ? "border-foreground bg-muted" : "border-border",
            )}
          >
            <FileSpreadsheet className="size-6 text-muted-foreground" aria-hidden />
            <div className="grid gap-1">
              <p className="font-medium">{s.source.dropTitle}</p>
              <p className="max-w-md text-xs text-muted-foreground">{s.source.dropHint}</p>
            </div>
            <input
              ref={input}
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) read(f);
              }}
            />
            <Button variant="outline" onClick={() => input.current?.click()} disabled={!!busy}>
              {s.source.choose}
            </Button>
            {busy && <p className="text-xs text-muted-foreground">{fmt(s.source.reading, { name: busy })}</p>}
          </div>
        </TabsContent>

        <TabsContent value="paste" className="grid gap-2 pt-3">
          <Label htmlFor="import-paste">{s.source.pasteLabel}</Label>
          <Textarea
            id="import-paste"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder={s.source.pastePlaceholder}
            className="field-sizing-fixed h-48 font-mono text-xs"
            spellCheck={false}
          />
          <div>
            <Button variant="outline" disabled={!paste.trim()} onClick={() => props.onLoaded(parsePaste(paste))}>
              {s.source.usePaste}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="google" className="pt-3">
          <GoogleSheetPicker onLoaded={props.onLoaded} />
        </TabsContent>
      </Tabs>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {wb && (
        <div className="grid gap-3 rounded-lg border bg-card p-3">
          <p className="text-sm">
            {fmt(s.source.loaded, { name: wb.label, rows: plural(props.rowCount, s.result.rows) })}
          </p>
          {wb.sheets.length > 1 && (
            <div className="grid max-w-xs gap-1.5">
              <Label htmlFor="import-sheet">{s.source.sheet}</Label>
              <Select value={String(props.sheetIdx)} onValueChange={(v) => props.onSheet(Number(v))}>
                <SelectTrigger id="import-sheet" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {wb.sheets.map((sh, i) => (
                    <SelectItem key={sh.name + i} value={String(i)}>
                      {sh.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {props.rowCount === 0 && <p className="text-sm text-negative">{s.source.errors.noRows}</p>}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <a href="/api/import/template" download className="underline underline-offset-3 hover:text-foreground">
          {s.source.template}
        </a>
      </p>
    </div>
  );
}

// ------------------------------------------------------------------------------------ 2 Columns

const SKIP = "__skip";
const preview = (c: Cell | undefined) =>
  c === null || c === undefined ? null : typeof c === "object" ? `=${c.formula}` : typeof c === "boolean" ? String(c) : String(c);

export function ColumnsStep(props: {
  header: string[];
  rows: Cell[][];
  mapping: (ImportField | null)[];
  onMapping: (m: (ImportField | null)[]) => void;
  questions: DateQuestion[];
  dateOrders: Partial<Record<DateQuestion["field"], DateOrder>>;
  onDateOrder: (f: DateQuestion["field"], o: DateOrder) => void;
}) {
  const sample = (i: number) => preview(props.rows.find((r) => r[i] !== null && r[i] !== undefined && r[i] !== "")?.[i]);
  const set = (i: number, f: ImportField | null) =>
    props.onMapping(props.mapping.map((x, j) => (j === i ? f : f && x === f ? null : x)));

  return (
    <div className="grid gap-5">
      <p className="text-muted-foreground">{s.columns.intro}</p>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-normal">{s.columns.column}</th>
              <th scope="col" className="px-3 py-2 font-normal max-sm:hidden">{s.columns.sample}</th>
              <th scope="col" className="px-3 py-2 font-normal">{s.columns.field}</th>
            </tr>
          </thead>
          <tbody>
            {props.header.map((h, i) => {
              const v = sample(i);
              return (
                <tr key={i} className="border-t">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    <span className="block max-w-48 truncate">{h || `#${i + 1}`}</span>
                    <span className="block max-w-48 truncate text-xs font-normal text-muted-foreground sm:hidden">{v ?? s.review.empty}</span>
                  </th>
                  <td className="max-w-56 truncate px-3 py-2 text-muted-foreground max-sm:hidden">{v ?? s.review.empty}</td>
                  <td className="px-3 py-1.5">
                    <Select value={props.mapping[i] ?? SKIP} onValueChange={(val) => set(i, val === SKIP ? null : (val as ImportField))}>
                      <SelectTrigger className="w-full min-w-40" aria-label={`${s.columns.field}: ${h || `#${i + 1}`}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SKIP}>{s.columns.skip}</SelectItem>
                        {IMPORT_FIELDS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {s.fields[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!mappingIsUsable(props.mapping) && (
        <p role="alert" className="text-sm text-negative">
          {s.columns.required}
        </p>
      )}

      {props.questions.map((q) =>
        q.mixed ? (
          <p key={q.field} className="text-sm text-warning">
            {fmt(s.columns.mixed, { column: q.column })}
          </p>
        ) : (
          <fieldset key={q.field} className="grid gap-1.5 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">{fmt(s.columns.dateTitle, { column: q.column })}</legend>
            <p className="text-xs text-muted-foreground">{fmt(s.columns.dateHint, { example: q.example })}</p>
            {(["dmy", "mdy"] as const).map((o) => {
              const r = parseDate(q.example, o);
              return (
                <Choice
                  key={o}
                  name={`date-${q.field}`}
                  value={o}
                  checked={props.dateOrders[q.field] === o}
                  onChange={() => props.onDateOrder(q.field, o)}
                  label={fmt(s.columns[o], { example: q.example, [o]: r.ok && r.value ? r.value : "" })}
                />
              );
            })}
            {!props.dateOrders[q.field] && <p className="text-xs text-muted-foreground">{s.columns.dateRequired}</p>}
          </fieldset>
        ),
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------ 3 Mode

export function ModeStep(props: {
  mode: ImportMode;
  onMode: (m: ImportMode) => void;
  createMissing: boolean;
  onCreateMissing: (v: boolean) => void;
  strict: boolean;
  onStrict: (v: boolean) => void;
  hasIds: boolean;
}) {
  return (
    <div className="grid max-w-xl gap-5">
      <fieldset className="grid gap-1.5">
        <legend className="mb-2 font-medium">{s.mode.legend}</legend>
        <Choice name="import-mode" value="create" checked={props.mode === "create"} onChange={() => props.onMode("create")} label={s.mode.create} hint={s.mode.createHint} />
        <Choice name="import-mode" value="update" checked={props.mode === "update"} onChange={() => props.onMode("update")} label={s.mode.update} hint={s.mode.updateHint} />
      </fieldset>
      {props.hasIds && <p className="text-xs text-muted-foreground">{s.mode.suggestUpdate}</p>}
      <div className="grid gap-3">
        {props.mode === "update" && (
          <Toggle id="import-create-missing" checked={props.createMissing} onChange={props.onCreateMissing} label={s.mode.createMissing} hint={s.mode.createMissingHint} />
        )}
        <Toggle id="import-strict" checked={props.strict} onChange={props.onStrict} label={s.mode.strict} hint={s.mode.strictHint} />
      </div>
    </div>
  );
}

function Toggle(props: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div className="flex items-start gap-2 px-2">
      <Checkbox id={props.id} checked={props.checked} onCheckedChange={(v) => props.onChange(v === true)} className="mt-0.5" />
      <div className="grid gap-0.5">
        <Label htmlFor={props.id} className="font-normal">
          {props.label}
        </Label>
        <p className="text-xs text-muted-foreground">{props.hint}</p>
      </div>
    </div>
  );
}
