import type { Metadata } from "next";
import { t } from "@/i18n";

export const generateMetadata = (): Metadata => ({ title: t.help.title });

/** The in-app manual: one page, numbered sections, in the app's own style and language. */
export default function HelpPage() {
  const h = t.help;
  return (
    <div className="mx-auto grid max-w-[1100px] gap-8 lg:grid-cols-[220px_1fr]">
      <header className="lg:col-span-2">
        <h1 className="text-2xl font-semibold tracking-tight">{h.title}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{h.intro}</p>
      </header>

      <nav aria-label={h.contents} className="lg:sticky lg:top-20 lg:self-start">
        <p className="mb-2 text-xs text-muted-foreground">{h.contents}</p>
        <ol className="grid gap-0.5 text-sm">
          {h.sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex gap-2 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                <span className="num w-4 text-right">{i + 1}.</span>
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-4">
        {h.sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20 rounded-xl border bg-card p-5">
            <h2 id={`${s.id}-h`} className="flex items-center gap-3 text-base font-semibold">
              <span className="num flex size-7 flex-none items-center justify-center rounded-full bg-raised text-sm">{i + 1}</span>
              {s.title}
            </h2>
            <ul className="mt-3 grid gap-2 pl-10 text-sm leading-relaxed">
              {s.steps.map((step) => (
                <li key={step} className="list-disc marker:text-muted-foreground">
                  {step}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section aria-labelledby="shortcuts-h" className="rounded-xl border bg-card p-5">
          <h2 id="shortcuts-h" className="text-base font-semibold">{h.shortcutsTitle}</h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[180px_1fr]">
            {h.shortcuts.map((k) => (
              <div key={k.keys} className="contents">
                <dt>
                  <kbd className="rounded-md border bg-raised px-2 py-0.5 text-xs">{k.keys}</kbd>
                </dt>
                <dd className="text-muted-foreground">{k.what}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
