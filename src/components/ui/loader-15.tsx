import { cn } from "@/lib/utils";

const PATH =
  "m 164,100 c 0,-35.346224 -28.65378,-64 -64,-64 -35.346224,0 -64,28.653776 -64,64 0,35.34622 28.653776,64 64,64 35.34622,0 64,-26.21502 64,-64 0,-37.784981 -26.92058,-64 -64,-64 -37.079421,0 -65.267479,26.922736 -64,64 1.267479,37.07726 26.703171,65.05317 64,64 37.29683,-1.05317 64,-64 64,-64";

/** Gooey looping loader, monochrome: follows the text colour, so it flips with the theme. */
export function Loader({ className, label }: { className?: string; label?: string }) {
  const shape = (
    <>
      <path className="loader15-halvan" d={PATH} />
      <circle className="loader15-strecken" cx={100} cy={100} r={64} />
    </>
  );
  return (
    <div role="status" aria-label={label} className={cn("relative size-[200px] text-foreground", className)}>
      <style>{`
        .loader15-halvan,.loader15-strecken{fill:none;stroke:currentColor;stroke-width:23;stroke-linecap:round}
        .loader15-halvan{stroke-dasharray:180 800;animation:loader15 10s infinite linear}
        .loader15-strecken{stroke-dasharray:26 54;animation:loader15 3s infinite linear}
        @keyframes loader15{to{stroke-dashoffset:-403px}}
        @media (prefers-reduced-motion:reduce){.loader15-halvan,.loader15-strecken{animation-duration:30s}}
      `}</style>
      <svg width={0} height={0} className="absolute" aria-hidden>
        <filter id="loader15-goo">
          <feGaussianBlur in="SourceGraphic" stdDeviation={7} result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 20 -10" result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </svg>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full translate-x-[3px] translate-y-[3px] opacity-20 blur-[5px]" aria-hidden>
        {shape}
      </svg>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full" style={{ filter: "url(#loader15-goo)" }} aria-hidden>
        {shape}
      </svg>
    </div>
  );
}

export default Loader;
