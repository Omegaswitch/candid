// Unsaved-text bookkeeping shared by the autosave hook and the panels that close over it.
// `pending` says whether any field still has text the server has not accepted; drafts keep
// that text across a panel close or a reload (sessionStorage: this tab only, never sent anywhere).
const pending = new Set<string>();
export const markUnsaved = (key: string, on: boolean) => void (on ? pending.add(key) : pending.delete(key));
export const hasUnsaved = () => pending.size > 0;

const DRAFT = "candid:draft:";
const store = () => (typeof sessionStorage === "undefined" ? null : sessionStorage);
export const readDraft = (key: string): string | null => {
  try {
    return store()?.getItem(DRAFT + key) ?? null;
  } catch {
    return null;
  }
};
export const saveDraft = (key: string, text: string) => {
  try {
    store()?.setItem(DRAFT + key, text);
  } catch {
    /* storage full or blocked: the in-memory copy still exists while the panel is open */
  }
};
export const clearDraft = (key: string) => {
  try {
    store()?.removeItem(DRAFT + key);
  } catch {
    /* ignore */
  }
};
