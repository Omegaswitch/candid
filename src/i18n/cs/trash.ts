import type { Localized } from "./types";
import type { trash as en } from "../en/trash";

export const trash: Localized<typeof en> = {
  title: "Koš",
  subline: "Smazané projekty, kroky a dokumenty tu zůstanou 10 dní. Do té doby je můžete obnovit.",
  empty: "Koš je prázdný.",
  restore: "Obnovit",
  restored: "Obnoveno: „{name}“",
  daysLeft: { one: "smaže se za {n} den", few: "smaže se za {n} dny", many: "smaže se za {n} dne", other: "smaže se za {n} dní" },
  kinds: { project: "Projekt", task: "Krok", document: "Dokument" },
};
