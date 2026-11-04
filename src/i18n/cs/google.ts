import type { Localized } from "./types";

export const google: Localized<typeof import("../en/google").google> = {
  connect: "Připojit Google",
  reconnect: "Znovu připojit Google",
  disconnect: "Odpojit",
  disconnecting: "Odpojování…",
  disconnected: "Google odpojen",
  connectedToast: "Google připojen",
  status: "Stav",
  account: "Připojený účet",
  lastError: "Poslední problém",
  statusConnected: "Připojeno",
  statusNotConnected: "Nepřipojeno",
  statusRevoked: "Je potřeba znovu připojit",
  revokedNote:
    "Google přestal toto připojení přijímat (přístup byl odvolán, změnilo se heslo nebo vypršela platnost). Připojte ho znovu, abyste mohli dál importovat a\u00a0exportovat.",
  notConnectedNote: "Připojte svůj účet Google, abyste mohli importovat z\u00a0Google Sheets a\u00a0exportovat do nich.",
  notConfigured:
    "Google zatím není nastavený. Správce musí na serveru doplnit přihlašovací údaje Google OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL).",
  loadError: "Stav připojení ke Googlu se nepodařilo načíst.",
  disconnectTitle: "Odpojit Google?",
  disconnectBody:
    "Candid zruší svůj přístup u\u00a0Googlu a\u00a0smaže uložené tokeny. Již exportované tabulky zůstanou ve vašem účtu Google.",
  callbackErrors: {
    state: "Přihlášení ke Googlu se nepodařilo ověřit (vypršelo, nebo bylo zahájeno v\u00a0jiném prohlížeči). Zkuste se připojit znovu.",
    denied: "Přístup ke Googlu nebyl udělen.",
    exchange: "Google připojení nedokončil. Zkuste to znovu.",
    scope: "Candid potřebuje přístup ke Google Sheets. Připojte se znovu a\u00a0nechte oprávnění pro Sheets zaškrtnuté.",
    not_configured: "Google zatím není nastavený. Správce musí doplnit přihlašovací údaje Google OAuth.",
  },

  picker: {
    title: "Tabulka Google",
    spreadsheet: "Odkaz na tabulku nebo její ID",
    spreadsheetHint: "Otevřete tabulku v\u00a0Google Sheets a\u00a0zkopírujte adresu z\u00a0prohlížeče.",
    placeholder: "https://docs.google.com/spreadsheets/d/…",
    inspect: "Otevřít tabulku",
    inspecting: "Otevírání…",
    worksheets: "Listy k\u00a0importu",
    rows: { one: "až {n} řádek", few: "až {n} řádky", many: "až {n} řádku", other: "až {n} řádků" },
    load: "Načíst listy",
    loading: "Načítání hodnot z\u00a0Googlu…",
    pickOne: "Vyberte alespoň jeden list",
    change: "Použít jinou tabulku",
    noSheets: "Tato tabulka nemá žádné listy s\u00a0buňkami.",
    connectedAs: "Připojeno jako {email}",
  },
};
