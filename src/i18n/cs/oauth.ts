import type { Localized } from "./types";

export const oauth: Localized<typeof import("../en/oauth").oauth> = {
  title: "Připojit aplikaci",
  heading: "{client} chce přístup ke Candidu",
  body: "Bude jednat vaším jménem: uvidí totéž co vy v pracovním prostoru {workspace} a jeho změny se zapíšou pod vaším jménem.",
  signedInAs: "Přihlášeni jako",
  redirectsTo: "Vrátí vás na",
  loopbackWarning: "Tato aplikace běží na vašem počítači (localhost). Povolte ji, jen pokud jste připojení spustili sami.",
  unverifiedName: "Název si aplikace volí sama. Než přístup povolíte, zkontrolujte adresu výše.",
  allow: "Povolit přístup",
  deny: "Zamítnout",
  revokeLater: "Odpojit ji můžete kdykoli v Nastavení → Integrace.",
  errorTitle: "Tento odkaz na připojení není platný",
  unknownClient: "Aplikace, která vás sem poslala, není v Candidu zaregistrovaná. Spusťte připojení znovu z aplikace.",
  badRedirect: "Návratová adresa neodpovídá té, kterou aplikace zaregistrovala. Spusťte připojení znovu z aplikace.",
  notMember: "Váš účet zatím není členem žádného pracovního prostoru Candidu. Požádejte správce o pozvánku.",
  continueTitle: "Návrat do aplikace…",
  continueLink: "Pokračovat",
};
