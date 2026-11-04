"use client";

// Step indicator for the import wizard. Replaces the React Bits Stepper, whose hard-coded hex
// themes, gradients, glass frame, spring motion, @hugeicons icons and built-in Back/Continue footer
// (which cannot wait for async steps) did not fit the design rules. This keeps its idea — numbered
// steps, completed ones ticked, earlier ones clickable — as an ordered list with aria-current.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type StepperProps = {
  steps: string[];
  /** 0-based index of the current step. */
  current: number;
  /** Steps before `current` are clickable when given. */
  onSelect?: (index: number) => void;
  /** Disable going back (e.g. while submitting or after the final step). */
  locked?: boolean;
  /** Accessible name of the list, e.g. "Import steps". */
  label: string;
  className?: string;
};

export default function Stepper({ steps, current, onSelect, locked, label, className }: StepperProps) {
  return (
    <ol aria-label={label} className={cn("flex min-w-0 items-center gap-1", className)}>
      {steps.map((title, i) => {
        const state = i < current ? "complete" : i === current ? "active" : "upcoming";
        const clickable = !!onSelect && !locked && i < current;
        const inner = (
          <>
            <span
              aria-hidden
              className={cn(
                "num grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-medium transition-colors duration-150",
                state === "complete" && "border-foreground bg-foreground text-background",
                state === "active" && "border-foreground text-foreground",
                state === "upcoming" && "border-border text-muted-foreground",
              )}
            >
              {state === "complete" ? <Check className="size-3" strokeWidth={2.5} /> : i + 1}
            </span>
            {/* Titles show from md; below that only the active one, so the row never overflows. */}
            <span
              className={cn(
                "truncate text-xs",
                state === "active" ? "font-medium text-foreground" : "hidden text-muted-foreground md:inline",
              )}
            >
              {title}
            </span>
          </>
        );
        return (
          <li key={title} className="flex min-w-0 items-center gap-1" aria-current={state === "active" ? "step" : undefined}>
            {i > 0 && <span aria-hidden className={cn("h-px w-3 shrink-0 md:w-5", i <= current ? "bg-foreground/40" : "bg-border")} />}
            {clickable ? (
              <button
                type="button"
                onClick={() => onSelect(i)}
                className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {inner}
                <span className="sr-only">{`(${i + 1}/${steps.length})`}</span>
              </button>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5 px-1 py-0.5">
                {inner}
                <span className="sr-only">{`(${i + 1}/${steps.length})`}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export { Stepper };
