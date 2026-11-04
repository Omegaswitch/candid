"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Stepper from "@/components/Stepper";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmt, t } from "@/i18n";
import { api, ApiError } from "@/lib/api";
import { detectDateColumn } from "@/lib/import/dates";
import { autoMap, mappingIsUsable } from "@/lib/import/mapping";
import { splitHeader } from "@/lib/import/parse";
import type { DateOrder, ImportField, ImportMode, ImportPlan, ImportRequest, ImportResult, ParsedWorkbook } from "@/lib/import/types";
import { qk } from "@/lib/query-keys";
import { ColumnsStep, ModeStep, SourceStep } from "./import-steps";
import { ConfirmStep, ResultStep, ReviewStep } from "./import-review";

const s = t.importExport;
const STEPS = [s.wizard.steps.source, s.wizard.steps.columns, s.wizard.steps.mode, s.wizard.steps.review, s.wizard.steps.confirm, s.wizard.steps.result];
const DATE_FIELDS = ["projectDueDate", "taskDueDate"] as const;

export type DateQuestion = { field: (typeof DATE_FIELDS)[number]; column: string; example: string; mixed: boolean };

/** The import wizard. Mount it fresh for each import: the idempotency key is made on mount. */
export function ImportWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [step, setStep] = useState(0);
  const [wb, setWb] = useState<ParsedWorkbook | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<(ImportField | null)[]>([]);
  const [dateOrders, setDateOrders] = useState<Partial<Record<DateQuestion["field"], DateOrder>>>({});
  const [mode, setMode] = useState<ImportMode>("create");
  const [createMissing, setCreateMissing] = useState(false);
  const [strictEmails, setStrictEmails] = useState(false);
  const [skipRows, setSkipRows] = useState<number[]>([]);
  const [acceptDuplicates, setAcceptDuplicates] = useState<number[]>([]);
  // The last preview answer, tagged with the request (and retry count) it answers.
  const [preview, setPreview] = useState<{ for: ImportRequest; reload: number; plan: ImportPlan | null; error: string | null } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const sheet = wb?.sheets[sheetIdx];
  const table = useMemo(() => splitHeader(sheet?.rows ?? []), [sheet]);
  const hasIds = useMemo(() => {
    const idCols = mapping.flatMap((f, i) => (f === "projectId" || f === "taskId" ? [i] : []));
    return idCols.length > 0 && table.rows.some((r) => idCols.some((i) => typeof r[i] === "string" && r[i] !== ""));
  }, [mapping, table]);

  function loadSheet(next: ParsedWorkbook, idx: number) {
    const tbl = splitHeader(next.sheets[idx]?.rows ?? []);
    const m = autoMap(tbl.header);
    setWb(next);
    setSheetIdx(idx);
    setMapping(m);
    setDateOrders({});
    setSkipRows([]);
    setAcceptDuplicates([]);
    setPreview(null);
    // A sheet with IDs most likely came from an export: suggest updating.
    const idCols = m.flatMap((f, i) => (f === "projectId" || f === "taskId" ? [i] : []));
    setMode(idCols.length && tbl.rows.some((r) => idCols.some((i) => typeof r[i] === "string" && r[i] !== "")) ? "update" : "create");
  }

  const dateQuestions: DateQuestion[] = useMemo(
    () =>
      DATE_FIELDS.flatMap((field) => {
        const i = mapping.indexOf(field);
        if (i < 0) return [];
        const info = detectDateColumn(table.rows.map((r) => r[i] ?? null));
        if (!info.ambiguous && !info.mixed) return [];
        return [{ field, column: table.header[i] || field, example: info.example ?? "", mixed: info.mixed }];
      }),
    [mapping, table],
  );

  const request: ImportRequest | null = useMemo(
    () =>
      wb
        ? {
            source: wb.source,
            label: wb.label,
            header: table.header,
            rows: table.rows,
            firstRow: table.firstRow,
            mapping,
            options: { mode, dateOrders, strictEmails, createMissing: mode === "update" && createMissing, skipRows, acceptDuplicates },
          }
        : null,
    [wb, table, mapping, mode, dateOrders, strictEmails, createMissing, skipRows, acceptDuplicates],
  );

  // Preview whenever the review is shown or its inputs change. Stale answers are ignored.
  const seq = useRef(0);
  const [reload, setReload] = useState(0);
  const current = !!preview && preview.for === request && preview.reload === reload;
  useEffect(() => {
    if (step !== 3 || !request || current) return;
    const n = ++seq.current;
    api<{ plan: ImportPlan }>("/api/import/preview", { method: "POST", json: request })
      .then((r) => n === seq.current && setPreview({ for: request, reload, plan: r.plan, error: null }))
      .catch((e: unknown) => n === seq.current && setPreview((p) => ({ for: request, reload, plan: p?.plan ?? null, error: errorText(e) })));
  }, [step, request, reload, current]);
  const planLoading = step === 3 && !current;
  const planError = current ? preview.error : null;
  // While a new preview loads, the previous plan stays on screen (dimmed).
  const plan = preview?.plan ?? null;

  async function submit() {
    if (!request || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const r = await api<{ result: ImportResult }>("/api/import/commit", { method: "POST", json: { ...request, idempotencyKey } });
      setResult(r.result);
      setStep(5);
      for (const key of [qk.projects(false), qk.projects(true), qk.counts(), ["project"], ["tasks"]]) qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      setSubmitError(e instanceof ApiError && e.isConflict ? s.confirm.conflict : errorText(e));
    } finally {
      setSubmitting(false);
    }
  }

  const canNext = [
    !!sheet && table.rows.length > 0,
    mappingIsUsable(mapping) && dateQuestions.every((q) => q.mixed || dateOrders[q.field]),
    true,
    !!plan && !planLoading && !planError,
    false,
    false,
  ][step];

  const toggle = (list: number[], set: (v: number[]) => void, row: number, on: boolean) =>
    set(on ? [...new Set([...list, row])] : list.filter((r) => r !== row));

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent
        className="flex flex-col gap-0 overflow-hidden p-0 max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:h-[min(52rem,calc(100dvh-4rem))] sm:max-w-4xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="gap-3 border-b px-4 pt-4 pb-3 sm:px-6">
          <div className="grid gap-1 pr-8">
            <DialogTitle className="text-base">{s.wizard.title}</DialogTitle>
            <DialogDescription className="max-sm:sr-only">{s.wizard.description}</DialogDescription>
          </div>
          <Stepper steps={STEPS} current={step} label={s.wizard.title} locked={submitting || step === 5} onSelect={setStep} />
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6" aria-live="polite">
          <h2 className="sr-only">{fmt(s.wizard.stepOf, { n: step + 1, total: STEPS.length })}: {STEPS[step]}</h2>
          {step === 0 && <SourceStep wb={wb} sheetIdx={sheetIdx} rowCount={table.rows.length} onLoaded={(w) => loadSheet(w, 0)} onSheet={(i) => wb && loadSheet(wb, i)} />}
          {step === 1 && (
            <ColumnsStep
              header={table.header}
              rows={table.rows}
              mapping={mapping}
              onMapping={setMapping}
              questions={dateQuestions}
              dateOrders={dateOrders}
              onDateOrder={(f, o) => setDateOrders((d) => ({ ...d, [f]: o }))}
            />
          )}
          {step === 2 && (
            <ModeStep
              mode={mode}
              onMode={setMode}
              createMissing={createMissing}
              onCreateMissing={setCreateMissing}
              strict={strictEmails}
              onStrict={setStrictEmails}
              hasIds={hasIds}
            />
          )}
          {step === 3 && (
            <ReviewStep
              plan={plan}
              loading={planLoading}
              error={planError}
              onRetry={() => setReload((n) => n + 1)}
              skipRows={skipRows}
              acceptDuplicates={acceptDuplicates}
              onSkip={(row, on) => toggle(skipRows, setSkipRows, row, on)}
              onAccept={(row, on) => toggle(acceptDuplicates, setAcceptDuplicates, row, on)}
            />
          )}
          {step === 4 && plan && wb && <ConfirmStep plan={plan} label={wb.label} mode={mode} error={submitError} />}
          {step === 5 && result && <ResultStep result={result} />}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-4 py-3 sm:px-6">
          {step > 0 && step < 5 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={submitting}>
              <ArrowLeft className="size-4" />
              {s.wizard.back}
            </Button>
          ) : (
            <span />
          )}
          {step < 4 && (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
              {s.wizard.next}
              <ArrowRight className="size-4" />
            </Button>
          )}
          {step === 4 && (
            <Button onClick={submit} disabled={submitting || !plan} aria-busy={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />}
              {submitting ? s.confirm.submitting : s.confirm.submit}
            </Button>
          )}
          {step === 5 && <Button onClick={() => onOpenChange(false)}>{s.result.done}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function errorText(e: unknown) {
  if (e instanceof ApiError) {
    if (e.isOffline) return t.common.offline;
    if (e.status === 413) return e.message || fmt(s.confirm.tooLarge, { max: 5000 });
    return e.message;
  }
  return t.common.errorGeneric;
}
