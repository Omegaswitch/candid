"use client";

import { Check } from "lucide-react";
import { fmt, t } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * A ring of steps: one arc per checklist item, filling in order as items are ticked. The colour
 * travels from the progress blue to the done green as the project nears completion, and the ring
 * closes with a tick at 100%. Transitions are CSS, so reduced motion turns them off globally.
 */
export function ProgressRing({ done, total, size = 44, className }: { done: number; total: number; size?: number; className?: string }) {
  const stroke = size >= 52 ? 5 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total ? done / total : 0;
  const complete = total > 0 && done === total;
  // Segments read as steps up to ~24; beyond that a continuous arc is clearer.
  const segmented = total > 1 && total <= 24;
  const gap = segmented ? Math.min(4, c / total / 3) : 0;
  const seg = segmented ? c / total : c;
  const colour = complete ? "var(--positive)" : `color-mix(in oklch, var(--positive) ${Math.round(ratio * 70)}%, var(--hue))`;
  const label = total ? fmt(t.projects.checklist, { done, total }) : t.projects.noTasks;

  return (
    <div role="img" aria-label={label} className={cn("relative flex-none", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        {(segmented ? Array.from({ length: total }, (_, i) => i) : [0]).map((i) => {
          const filled = segmented ? i < done : false;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap={segmented ? "butt" : "round"}
              strokeDasharray={`${seg - gap} ${c - seg + gap}`}
              strokeDashoffset={-i * seg}
              className="stroke-raised"
              style={filled ? { stroke: colour, transition: "stroke 250ms ease, opacity 250ms ease" } : { transition: "stroke 250ms ease" }}
            />
          );
        })}
        {!segmented && total > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * ratio} ${c}`}
            style={{ stroke: colour, transition: "stroke-dasharray 300ms ease, stroke 250ms ease" }}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {complete ? (
          <Check className="text-positive" style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={2.6} aria-hidden />
        ) : (
          <span className="num font-medium leading-none" style={{ fontSize: Math.max(11, size * 0.26) }} aria-hidden>
            {total ? `${done}/${total}` : "–"}
          </span>
        )}
      </span>
    </div>
  );
}
