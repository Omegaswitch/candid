"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

// Labels are read at render time (getters), so they follow the active language.
const OPTIONS = [
  { value: "light", icon: Sun, get label() { return t.common.theme.light; } },
  { value: "system", icon: Monitor, get label() { return t.common.theme.system; } },
  { value: "dark", icon: Moon, get label() { return t.common.theme.dark; } },
] as const;

const noop = () => () => {};
/** True after hydration; the stored theme is only known in the browser. */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * Light · System · Dark as one slider: the thumb glides to the chosen position and the page
 * colours cross-fade (see `.theme-fade` in globals.css). A radio group, so arrow keys move it.
 */
export function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? (theme ?? "system") : "system";
  const index = Math.max(0, OPTIONS.findIndex((o) => o.value === current));

  const choose = (value: string) => {
    const root = document.documentElement;
    root.classList.add("theme-fade");
    setTheme(value);
    window.setTimeout(() => root.classList.remove("theme-fade"), 350);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t.common.theme.label}
      className="relative grid h-8 grid-cols-3 rounded-full bg-raised p-0.5"
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const next = OPTIONS[(index + d + OPTIONS.length) % OPTIONS.length];
        choose(next.value);
        (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-full bg-card shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-value={o.value}
          aria-checked={i === index}
          aria-label={o.label}
          title={o.label}
          tabIndex={i === index ? 0 : -1}
          onClick={() => choose(o.value)}
          className={cn(
            "relative z-10 flex w-8 items-center justify-center rounded-full transition-colors duration-200",
            i === index ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <o.icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
