import type { ReactNode } from "react";
import { ProgressRing } from "@/components/projects/progress-ring";
import { t } from "@/i18n";
import KineticGrid from "@/components/ui/kinetic-grid";
import { LanguageSwitch } from "./language-switch";
import { Mark } from "./app-shell";

/**
 * The public front door: the Candid mark and name on one side, the sign-in form on the other.
 * Clerk only renders the form inside `children`; everything else here is ours.
 */
export function Landing({ children }: { children: ReactNode }) {
  const l = t.common.landing;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex flex-col justify-between gap-10 border-b bg-card px-6 py-8 sm:px-10 lg:border-b-0 lg:border-r lg:px-16 lg:py-14">
        <div aria-hidden />

        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-5">
            <Mark className="size-16 sm:size-20" />
            <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">{t.common.appName}</h1>
          </div>
          <p className="max-w-md text-lg text-muted-foreground">{t.common.tagline}</p>
          <ul className="grid max-w-md gap-4">
            {[
              { done: 1, total: 4, text: l.point1 },
              { done: 3, total: 4, text: l.point2 },
              { done: 4, total: 4, text: l.point3 },
            ].map((x) => (
              <li key={x.text} className="flex items-center gap-4">
                <ProgressRing done={x.done} total={x.total} size={44} />
                <span>{x.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">{l.footer}</p>
      </section>

      <KineticGrid className="min-h-[560px] lg:min-h-0">
        <section className="relative flex size-full min-h-[560px] flex-col items-center justify-center gap-6 px-6 py-16">
          <div className="absolute right-4 top-4">
            <LanguageSwitch />
          </div>
          {children}
        </section>
      </KineticGrid>
    </main>
  );
}
