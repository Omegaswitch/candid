"use client";

import { Check } from "lucide-react";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { fmt, t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Colour scale the ring travels through as stages complete: blue → cyan → teal → green. */
const STOPS: [number, number, number][] = [
  [37, 99, 235],
  [6, 182, 212],
  [20, 184, 166],
  [34, 197, 94],
  [22, 163, 74],
];
/** A colour from the scale at 0..1, interpolated between stops so the change is gradual. */
function stageColour(x: number) {
  const f = Math.min(1, Math.max(0, x)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(f));
  const k = f - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  return `rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * k)).join(" ")})`;
}

/**
 * Step ring (Magic UI animated circular progress bar): the arc animates to the new length and
 * colour whenever a step is ticked. Around it, one tick per step in that step's own colour from
 * the scale, lit when done. Reduced motion removes the animation (globals.css).
 */
/** Trig results differ in the last digits between Node and browsers; rounded, server HTML and hydration agree. */
const px = (v: number) => Math.round(v * 100) / 100;

export function ProgressRing({
  done,
  total,
  size = 44,
  ticks = false,
  caption,
  className,
}: {
  done: number;
  total: number;
  size?: number;
  /** Marks outside the ring, one per step (the large card ring). */
  ticks?: boolean;
  /** A small word under the count, e.g. "done". */
  caption?: string;
  className?: string;
}) {
  const ratio = total ? done / total : 0;
  const complete = total > 0 && done === total;
  const label = total ? fmt(t.projects.checklist, { done, total }) : t.projects.noTasks;
  // The gauge sits inside the tick band on the big ring.
  const inner = ticks ? Math.round(size * 0.78) : size;
  const n = Math.min(total, 60);

  return (
    <div role="img" aria-label={label} className={cn("relative flex-none", className)} style={{ width: size, height: size }}>
      {ticks && n > 0 && (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
          {Array.from({ length: n }, (_, i) => {
            const a = ((i + 0.5) / n) * 2 * Math.PI;
            const r1 = inner / 2 + size * 0.03;
            const r2 = size / 2 - 1;
            const lit = i < Math.round(ratio * n);
            return (
              <line
                key={i}
                x1={px(size / 2 + r1 * Math.cos(a))}
                y1={px(size / 2 + r1 * Math.sin(a))}
                x2={px(size / 2 + r2 * Math.cos(a))}
                y2={px(size / 2 + r2 * Math.sin(a))}
                strokeWidth={2.5}
                strokeLinecap="round"
                className="stroke-border"
                style={{ stroke: lit ? stageColour(n > 1 ? i / (n - 1) : 1) : undefined, transition: "stroke 400ms ease" }}
              />
            );
          })}
        </svg>
      )}
      <AnimatedCircularProgressBar
        value={Math.round(ratio * 100)}
        gaugePrimaryColor={done > 0 ? stageColour(ratio) : "transparent"}
        gaugeSecondaryColor="color-mix(in oklch, var(--foreground) 9%, transparent)"
        className="absolute"
        style={{ width: inner, height: inner, left: (size - inner) / 2, top: (size - inner) / 2 }}
      >
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5" aria-hidden>
          {complete ? (
            <Check style={{ width: inner * 0.36, height: inner * 0.36, color: stageColour(1) }} strokeWidth={2.6} />
          ) : (
            <span className="num font-semibold leading-none tracking-tight" style={{ fontSize: Math.max(11, inner * 0.24) }}>
              {total ? `${done}/${total}` : "–"}
            </span>
          )}
          {caption && total > 0 && size >= 96 && (
            <span className="text-[11px] leading-none text-muted-foreground">{complete ? t.projects.allDoneShort : caption}</span>
          )}
        </span>
      </AnimatedCircularProgressBar>
    </div>
  );
}
