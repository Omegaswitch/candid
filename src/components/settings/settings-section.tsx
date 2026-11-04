import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One settings row: label column (title, help, optional summary) beside the panel. Stacks on narrow screens. */
export function SettingsSection({
  title,
  description,
  aside,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = `s-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className={cn("grid gap-4 py-8 [section+&]:border-t lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-10", className)}>
      <div className="flex flex-col gap-1 lg:pt-2">
        <h2 id={headingId} className="text-base font-medium">
          {title}
        </h2>
        {description && <p className="text-muted-foreground">{description}</p>}
        {aside && <div className="mt-3 text-muted-foreground">{aside}</div>}
      </div>
      <div className="min-w-0 self-start rounded-lg border bg-card p-4">{children}</div>
    </section>
  );
}

/** Read-only label + value pair inside a panel. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="text-muted-foreground sm:w-40 sm:shrink-0">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="mb-2 text-2xl font-semibold">{children}</h1>;
}
