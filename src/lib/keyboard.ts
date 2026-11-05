/** True when a key press belongs to text entry, so global shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || !!el.closest("[role=combobox],[cmdk-input]");
}

/**
 * A bare letter shortcut ("n", "t"): no modifiers, not while typing, and not while a menu, popover or
 * dialog other than `allowIn` (e.g. the project panel) has focus.
 */
export function isPlainShortcut(e: KeyboardEvent, key: string, allowIn?: string) {
  if (e.key.toLowerCase() !== key || e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.defaultPrevented) return false;
  if (isTypingTarget(e.target)) return false;
  const layer = (e.target as HTMLElement | null)?.closest?.("[role=dialog],[role=alertdialog],[role=menu],[role=listbox]");
  return !layer || (!!allowIn && layer.matches(allowIn));
}
