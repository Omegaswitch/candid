import type { Metadata } from "next";
import { fmt, t } from "@/i18n";

const l = t.legal;
const p = l.privacy;

export const generateMetadata = (): Metadata => ({ title: p.title });

const vars = { controller: l.controller, contact: l.contact };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const id = `s-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h2 id={id} className="text-base font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function List({ items }: { items: readonly string[] }) {
  return (
    <ul className="grid list-disc gap-1.5 pl-5">
      {items.map((s) => (
        <li key={s}>{fmt(s, vars)}</li>
      ))}
    </ul>
  );
}

/** The privacy notice. Plain English; every fact in src/i18n/en/legal.ts is checked against the code. */
export default function PrivacyPage() {
  return (
    <article className="mx-auto grid w-full max-w-2xl gap-8 text-sm leading-relaxed">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{p.title}</h1>
        <p className="text-muted-foreground">{fmt(p.lastUpdated, { date: l.lastUpdated })}</p>
        <p className="mt-2">{p.intro}</p>
      </header>
      <Section title={p.controller.title}>
        <p>{fmt(p.controller.body, vars)}</p>
      </Section>
      <Section title={p.data.title}>
        <p>{p.data.intro}</p>
        <List items={p.data.items} />
      </Section>
      <Section title={p.processing.title}>
        <List items={p.processing.items} />
      </Section>
      <Section title={p.cookies.title}>
        <p>{p.cookies.body}</p>
        <List items={p.cookies.items} />
        <p>{p.cookies.none}</p>
      </Section>
      <Section title={p.retention.title}>
        <List items={p.retention.items} />
      </Section>
      <Section title={p.rights.title}>
        <p>{p.rights.intro}</p>
        <List items={p.rights.items} />
      </Section>
    </article>
  );
}
