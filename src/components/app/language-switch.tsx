"use client";

import { currentLocale, setLocale, type Locale } from "@/i18n";
import { cn } from "@/lib/utils";

// Each language is named in itself, so it is recognisable whichever one is active. Not translated.
const OPTIONS: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "cs", label: "Čeština" },
];

/**
 * English · Čeština as a two-position segmented control (a radio group: arrow keys move it).
 * Choosing writes the `candid_locale` cookie and reloads the page in that language.
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const current = currentLocale();
  const choose = (value: Locale) => {
    if (value !== current) setLocale(value);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Language / Jazyk"
      className={cn("inline-grid h-8 grid-cols-2 rounded-md bg-raised p-0.5", className)}
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        choose(current === "en" ? "cs" : "en");
      }}
    >
      {OPTIONS.map((o) => {
        const active = o.value === current;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            lang={o.value}
            tabIndex={active ? 0 : -1}
            onClick={() => choose(o.value)}
            className={cn(
              "rounded-[5px] px-3 text-xs font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
