import type { Localized } from "./types";

// Czech typography: a non-breaking space (\u00a0) follows the one-letter prepositions and
// conjunctions k, s, v, z, o, u, a, i, so they never end a line. Quotes are „…“.
export const common: Localized<typeof import("../en/common").common> = {
  appName: "Candid",
  tagline: "Projekty, kontrolní seznamy, poznámky a\u00a0dokumenty pro tým.",
  landing: {
    point1: "Každý projekt začíná stejným kontrolním seznamem.",
    point2: "Odškrtněte krok a\u00a0kruh se zaplní.",
    point3: "Na první pohled uvidíte, co se blíží, čeká nebo je po termínu.",
    footer: "Interní nástroj. Přihlaste se pracovním e-mailem.",
  },
  save: "Uložit",
  saving: "Ukládání…",
  saved: "Uloženo",
  couldNotSave: "Nepodařilo se uložit",
  retry: "Zkusit znovu",
  cancel: "Zrušit",
  close: "Zavřít",
  undo: "Vrátit",
  delete: "Smazat",
  edit: "Upravit",
  rename: "Přejmenovat",
  remove: "Odebrat",
  loading: "Načítání…",
  none: "—",
  offline: "Jste offline. Změny se zatím nedostaly na server.",
  unsavedLeave: "Máte neuložené změny. Opravdu odejít?",
  errorGeneric: "Něco se pokazilo. Zkuste to znovu.",
  signIn: "Přihlásit se",
  signInDegraded: "Přihlašování je teď pomalé. Pokud se formulář nezobrazí, načtěte stránku znovu.",
  signInFailed:
    "Přihlašovací formulář se nepodařilo načíst. Něco ve vaší síti nebo v\u00a0prohlížeči blokuje clerk.com – zkuste jiný prohlížeč nebo síť, případně požádejte IT o\u00a0povolení clerk.com a\u00a0clerk.accounts.dev.",
  signOut: "Odhlásit se",
  devSignInTitle: "Vývojové přihlášení",
  devSignInNote: "Místní náhrada za Clerk. Na nasazených verzích je vypnutá.",
  notMember: "Váš účet zatím není členem tohoto pracovního prostoru. Požádejte správce o\u00a0pozvánku.",
  theme: { label: "Vzhled", light: "Světlý", dark: "Tmavý", system: "Podle systému" },
  conflict: {
    title: "Někdo jiný to mezitím upravil",
    body: "Vaše i\u00a0druhá verze jsou zachované níže. Vyberte, co ponechat.",
    keepMine: "Ponechat moji verzi",
    keepTheirs: "Použít druhou verzi",
    merge: "Ponechat obě",
    yours: "Vaše verze",
    theirs: "Druhá verze (uloženo {when})",
  },
};
