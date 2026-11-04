"use client";

import { useRef, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMembers } from "@/hooks/queries";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { useEscapeCancel } from "./inline-text";

/** Quiet controls: they read as values until hovered or focused. */
export const ghostControl =
  "h-8 w-full border-transparent bg-transparent px-2 shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent";

const NONE = "none";

export function MemberSelect({
  id,
  value,
  onChange,
  label,
  className,
}: {
  id?: string;
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  className?: string;
}) {
  const members = useMembers();
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} aria-label={label} className={cn(ghostControl, className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">{t.tasks.panel.unassigned}</span>
        </SelectItem>
        {members.data?.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function useMemberName() {
  const members = useMembers();
  return (id: string | null | undefined) => (id ? members.data?.find((m) => m.id === id)?.name ?? null : null);
}

/**
 * Native date input. Typing a date fires a change per segment (year 0002, 0020…), so it commits on
 * blur or Enter, not on every change; Escape reverts. An empty value clears the date.
 */
export function DateInput({
  id,
  value,
  onChange,
  label,
  className,
}: {
  id?: string;
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const [last, setLast] = useState(value);
  if (last !== value) {
    setLast(value);
    if (!focused) setDraft(value ?? "");
  }
  const commit = () => {
    if ((draft || null) !== value && (!draft || draft >= "1900-01-01")) onChange(draft || null);
    else setDraft(value ?? "");
  };
  // Unchanged: let Escape through so the panel can close.
  useEscapeCancel(ref, focused, () => (draft === (value ?? "") ? false : setDraft(value ?? "")));
  return (
    <input
      ref={ref}
      id={id}
      type="date"
      aria-label={label}
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      className={cn(
        "num h-8 w-full min-w-0 rounded-lg border px-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:scheme-dark",
        ghostControl,
        !draft && "text-muted-foreground",
        className,
      )}
    />
  );
}
