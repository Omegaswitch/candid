"use client";

import { Columns3, LayoutGrid, ListFilter, Rows3 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLabels } from "@/hooks/labels";
import { useMembers } from "@/hooks/queries";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Prefs } from "@/server/preferences";

export type Filters = Prefs["filters"];
const ANY = "any";
const f = t.projects.filters;

function FilterSelect<V extends string>({
  label,
  value,
  onChange,
  options,
  anyLabel = f.any,
  wide,
}: {
  label: string;
  value: V | null;
  onChange: (v: V | null) => void;
  options: { value: V; label: string }[];
  anyLabel?: string;
  wide?: boolean;
}) {
  const current = options.find((o) => o.value === value)?.label;
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : (v as V))}>
      <SelectTrigger
        aria-label={label}
        className={cn("h-8 max-w-56 bg-card", value && "border-foreground/40", wide && "w-full max-w-none")}
      >
        <SelectValue>
          <span className="text-muted-foreground">{label}</span>
          <span className="truncate">{current ?? anyLabel}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const activeFilterCount = (fl: Filters) => Object.values(fl).filter((v) => v !== null).length;

function FilterFields({ filters, onChange, wide }: { filters: Filters; onChange: (f: Filters) => void; wide?: boolean }) {
  const members = useMembers();
  const labels = useLabels();
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...filters, [k]: v });
  return (
    <>
      <FilterSelect
        label={f.owner}
        anyLabel={f.anyone}
        wide={wide}
        value={filters.ownerId}
        onChange={(v) => set("ownerId", v)}
        options={(members.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
      />
      <FilterSelect
        label={f.status}
        wide={wide}
        value={filters.status}
        onChange={(v) => set("status", v)}
        options={(["active", "waiting", "completed"] as const).map((s) => ({ value: s, label: t.projects.status[s] }))}
      />
      <FilterSelect
        label={f.due}
        wide={wide}
        value={filters.due}
        onChange={(v) => set("due", v)}
        options={(["overdue", "week", "month", "none"] as const).map((d) => ({ value: d, label: f[d] }))}
      />
      <FilterSelect
        label={f.priority}
        wide={wide}
        value={filters.priority}
        onChange={(v) => set("priority", v)}
        options={(["high", "normal"] as const).map((p) => ({ value: p, label: t.projects.priority[p] }))}
      />
      {!!labels.data?.length && (
        <FilterSelect
          label={f.tag}
          wide={wide}
          value={filters.labelId}
          onChange={(v) => set("labelId", v)}
          options={labels.data.map((l) => ({ value: l.id, label: l.name }))}
        />
      )}
    </>
  );
}

export function ProjectToolbar({
  filters,
  sort,
  view,
  onFilters,
  onSort,
  onView,
}: {
  filters: Filters;
  sort: Prefs["sort"];
  view: Prefs["view"];
  onFilters: (f: Filters) => void;
  onSort: (s: Prefs["sort"]) => void;
  onView: (v: Prefs["view"]) => void;
}) {
  const [sheet, setSheet] = useState(false);
  const n = activeFilterCount(filters);
  const clear = () => onFilters({ ownerId: null, status: null, priority: null, due: null, labelId: null });

  return (
    <div className="flex items-center gap-2">
      {/* Desktop and tablet: the filters read left to right. */}
      <div className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 md:flex">
        <FilterFields filters={filters} onChange={onFilters} />
        {n > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>
            {f.clear}
          </Button>
        )}
      </div>
      {/* Phone: one button opens the filters in a sheet. */}
      <div className="flex flex-1 md:hidden">
        <Button variant="outline" className="h-9 bg-card" onClick={() => setSheet(true)} aria-haspopup="dialog">
          <ListFilter /> {f.label}
          {n > 0 && <span className="num rounded-full bg-foreground px-1.5 text-xs text-background">{n}</span>}
        </Button>
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetContent side="bottom" className="gap-3 rounded-t-xl pb-6">
            <SheetHeader className="pb-0">
              <SheetTitle>{f.label}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-2 px-4">
              <FilterFields filters={filters} onChange={onFilters} wide />
              <div className="mt-2 flex gap-2">
                <Button variant="outline" className="h-10 flex-1" onClick={clear} disabled={!n}>
                  {f.clear}
                </Button>
                <Button className="h-10 flex-1" onClick={() => setSheet(false)}>
                  {t.common.close}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex flex-none items-center gap-2">
        <Label className="sr-only" htmlFor="project-sort">
          {t.projects.sort.label}
        </Label>
        <Select value={sort} onValueChange={(v) => onSort(v as Prefs["sort"])}>
          <SelectTrigger id="project-sort" className="h-9 bg-card md:h-8">
            <SelectValue>
              <span className="hidden text-muted-foreground sm:inline">{t.projects.sort.label}</span>
              {t.projects.sort[sort]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {(["manual", "due", "name", "activity"] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {t.projects.sort[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={view}
          onValueChange={(v) => v && onView(v as Prefs["view"])}
          aria-label={t.projects.view.label}
          className="hidden bg-card sm:flex"
        >
          <ToggleGroupItem value="grid" aria-label={t.projects.view.grid}>
            <LayoutGrid />
          </ToggleGroupItem>
          <ToggleGroupItem value="table" aria-label={t.projects.view.table}>
            <Rows3 />
          </ToggleGroupItem>
          <ToggleGroupItem value="board" aria-label={t.projects.view.board}>
            <Columns3 />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}

