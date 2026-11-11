"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n";
import { isPlainShortcut } from "@/lib/keyboard";

/** "?" anywhere outside text fields: the same shortcut list as the Help page, in a small dialog. */
export function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Also from inside the project panel (a dialog), but not over a confirmation.
      if (!isPlainShortcut(e, "?", "[role=dialog]") || document.querySelector("[role=alertdialog]")) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const h = t.help;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{h.shortcutsTitle}</DialogTitle>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
          {h.shortcuts.map((k) => (
            <div key={k.keys} className="contents">
              <dt className="justify-self-start">
                <kbd className="rounded-md border bg-raised px-2 py-0.5 text-xs whitespace-nowrap">{k.keys}</kbd>
              </dt>
              <dd className="text-muted-foreground">{k.what}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
