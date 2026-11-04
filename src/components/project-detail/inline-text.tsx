"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Escape inside an edit cancels the edit and must not reach the Sheet, whose Radix layer listens on
 * `document` in the capture phase. A window capture listener runs first and stops it there.
 */
export function useEscapeCancel(ref: RefObject<HTMLElement | null>, active: boolean, onEscape: () => boolean | void) {
  const cb = useRef(onEscape);
  useEffect(() => {
    cb.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !ref.current || !ref.current.contains(document.activeElement)) return;
      // Returning false lets Escape through (e.g. an empty add-task field).
      if (cb.current() === false) return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [active, ref]);
}

/** A text input that commits on Enter or blur and reverts on Escape. */
export function CommitInput({
  value,
  onCommit,
  onDone,
  autoFocus,
  allowEmpty,
  passCleanEscape,
  className,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  /** Called after Enter, blur or Escape. */
  onDone?: (how: "commit" | "cancel" | "blur") => void;
  autoFocus?: boolean;
  allowEmpty?: boolean;
  /** For an always-visible field: an unchanged value lets Escape through to close the panel. */
  passCleanEscape?: boolean;
  className?: string;
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "onBlur" | "onKeyDown">) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const settled = useRef(false);
  const [focused, setFocused] = useState(false);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    // The server copy moved: follow it unless someone is typing here.
    setLastValue(value);
    if (!focused) setDraft(value);
  }

  const commit = (how: "commit" | "blur") => {
    if (settled.current && how === "blur") return;
    const v = draft.trim();
    if (v !== value.trim() && (v || allowEmpty)) onCommit(v);
    else setDraft(value);
    settled.current = how === "commit";
    onDone?.(how);
  };
  useEscapeCancel(ref, true, () => {
    if (passCleanEscape && draft === value) return false;
    settled.current = true;
    setDraft(value);
    onDone?.("cancel");
  });

  return (
    <Input
      ref={ref}
      value={draft}
      autoFocus={autoFocus}
      onFocus={() => {
        settled.current = false;
        setFocused(true);
      }}
      onChange={(e) => {
        settled.current = false;
        setDraft(e.target.value);
      }}
      onBlur={() => {
        setFocused(false);
        commit("blur");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          commit("commit");
        }
      }}
      className={className}
      {...rest}
    />
  );
}

/** Text that turns into an input on click or Enter; Enter saves, Escape cancels, focus returns to the text. */
export function InlineText({
  value,
  onSave,
  label,
  editLabel,
  children,
  className,
  inputClassName,
  allowEmpty,
  placeholder,
  editing: editingProp,
  onEditingChange,
}: {
  value: string;
  onSave: (v: string) => void;
  /** Optional control from outside, e.g. a menu's Rename item. */
  editing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Accessible name of the input. */
  label: string;
  /** Accessible name of the button that starts editing. */
  editLabel: string;
  children: ReactNode;
  className?: string;
  inputClassName?: string;
  allowEmpty?: boolean;
  placeholder?: string;
}) {
  const [editingState, setEditingState] = useState(false);
  const editing = editingProp ?? editingState;
  const setEditing = (v: boolean) => (onEditingChange ? onEditingChange(v) : setEditingState(v));
  const button = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      button.current?.focus();
    }
  }, [editing]);

  if (editing) {
    return (
      <CommitInput
        value={value}
        autoFocus
        allowEmpty={allowEmpty}
        aria-label={label}
        placeholder={placeholder}
        onCommit={onSave}
        onDone={(how) => {
          refocus.current = how !== "blur";
          setEditing(false);
        }}
        className={cn("h-8 px-2", inputClassName)}
      />
    );
  }
  return (
    <button
      ref={button}
      type="button"
      aria-label={editLabel}
      onClick={() => setEditing(true)}
      className={cn(
        "-mx-1 min-w-0 cursor-text rounded-md px-1 text-left transition-colors hover:bg-accent focus-visible:bg-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}
