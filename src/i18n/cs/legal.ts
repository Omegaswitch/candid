import { legal as en } from "../en/legal";
import type { Localized } from "./types";

// Překlad zásad ochrany osobních údajů (/privacy). Každé tvrzení odpovídá anglickému originálu
// v src/i18n/en/legal.ts, který je ověřený proti kódu: měňte je společně.
export const legal: Localized<typeof en> = {
  // Doplňuje správce jen v anglickém souboru; obě jazykové verze sdílejí stejné hodnoty.
  controller: en.controller,
  contact: en.contact,
  lastUpdated: en.lastUpdated,

  privacy: {
    title: "Ochrana osobních údajů",
    lastUpdated: "Naposledy aktualizováno {date}",
    intro:
      "Candid je interní nástroj pro správu projektů, kontrolních seznamů, poznámek a\u00a0dokumentů. Tento dokument vysvětluje, jaké osobní údaje uchovává, kde se zpracovávají a\u00a0co můžete požadovat. Je záměrně napsaný srozumitelně.",

    controller: {
      title: "Kdo za údaje odpovídá",
      body: "Správcem osobních údajů je {controller}, organizace, která tento pracovní prostor provozuje. Dotazy a\u00a0žádosti týkající se vašich údajů směřujte na {contact}.",
    },

    data: {
      title: "Jaké osobní údaje se ukládají",
      intro: "Vše níže uvedené je uloženo v\u00a0databázi pracovního prostoru a\u00a0vidí to jen jeho členové.",
      items: [
        "Členové: vaše jméno a\u00a0e-mailová adresa, vaše role (správce nebo člen) a\u00a0to, zda jste aktivní, pozvaní, nebo odebraní.",
        "Projekty a\u00a0úkoly: názvy, klienti, vlastníci, řešitelé, termíny, stav a\u00a0poznámky k\u00a0projektům a\u00a0úkolům. Mohou v\u00a0nich být jména lidí, včetně kandidátů a\u00a0klientů.",
        "Dokumenty: soubory, které členové nahrají, a\u00a0odkazy, které přidají, s\u00a0názvem souboru, typem, velikostí a\u00a0údajem, kdo je přidal.",
        "Záznam aktivity: kdo co a\u00a0kdy udělal (například kdo dokončil úkol nebo změnil stav). Ukládá jen drobná fakta, nikdy text poznámek ani žádné tokeny.",
        "Předvolby: vaše nastavení zobrazení, řazení a\u00a0filtrů, které projekty a\u00a0dokumenty jste si připnuli a\u00a0zda je postranní panel sbalený.",
        "Importy: kdo spustil import z\u00a0tabulky, kdy a\u00a0souhrn toho, co vytvořil nebo upravil.",
        "Připojení ke Googlu (jen pokud ho připojíte): e-mail připojeného účtu Google a\u00a0přístupové tokeny, které jsou v\u00a0úložišti šifrované pomocí AES-256-GCM a\u00a0nikdy se neposílají do prohlížeče.",
      ],
    },

    processing: {
      title: "Kde se údaje zpracovávají",
      items: [
        "Databáze: Neon PostgreSQL ve Frankfurtu (AWS eu-central-1).",
        "Aplikace: serverless funkce Vercel ve Frankfurtu (fra1).",
        "Přihlášení: Clerk spravuje váš účet a\u00a0relace přihlášení. Vaše jméno a\u00a0e-mail pocházejí z\u00a0tohoto účtu.",
        "Dokumenty: nastavené úložiště kompatibilní s\u00a0S3, které je soukromé. Jeho region určuje správce.",
        "Google: s\u00a0Google Sheets se komunikuje jen tehdy, když připojíte vlastní účet Google a\u00a0importujete z\u00a0tabulky nebo do ní exportujete. Nic se nesynchronizuje na pozadí.",
      ],
    },

    cookies: {
      title: "Cookies a\u00a0úložiště prohlížeče",
      body: "Candid používá jen to, co nutně potřebuje ke svému fungování, proto se nezobrazuje lišta s\u00a0cookies:",
      items: [
        "Cookies relace přihlášení, které nastavuje Clerk, abyste zůstali přihlášení.",
        "Krátkodobá cookie během připojování účtu Google, která propojí obrazovku souhlasu Googlu s\u00a0vaším prohlížečem. Po dokončení připojení se odstraní.",
        "Volba vzhledu (světlý, tmavý nebo podle systému) se ukládá do místního úložiště tohoto prohlížeče, ne do cookie.",
        "Volba jazyka (angličtina nebo čeština) se ukládá do cookie candid_locale v\u00a0tomto prohlížeči na jeden rok.",
      ],
      none: "Nepoužíváme žádné analytické, reklamní ani sledovací cookies a\u00a0žádné sledovací nástroje třetích stran.",
    },

    retention: {
      title: "Jak dlouho se údaje uchovávají",
      items: [
        "Archivovaný projekt lze kdykoli obnovit. Projekt se smaže jen tehdy, když ho někdo smaže z\u00a0archivu: jeho úkoly, poznámky a\u00a0historie se pak odstraní natrvalo. Odebraný úkol se jen skryje, nesmaže, takže ho lze obnovit.",
        "Dokumenty se uchovávají, dokud je někdo neodebere. Odebraný dokument se z\u00a0úložiště trvale odstraní po 7 dnech.",
        "Záznam aktivity se uchovává po celou dobu existence pracovního prostoru.",
        "Tokeny Google se smažou, když Google odpojíte nebo když vás správce z\u00a0pracovního prostoru odebere.",
        "Když správce odebere člena, jeho záznam o\u00a0členství zůstane se stavem Odebraný, aby u\u00a0dřívější aktivity bylo dál vidět, kdo co udělal.",
      ],
    },

    rights: {
      title: "Vaše práva",
      intro: "Podle GDPR můžete požádat o\u00a0přístup ke svým osobním údajům, jejich opravu nebo výmaz a\u00a0můžete vznést námitku proti jejich zpracování nebo požádat o\u00a0jeho omezení.",
      items: [
        "Přístup a\u00a0oprava: v\u00a0Nastavení → Obecné vidíte jméno, e-mail a\u00a0roli, které jsou o\u00a0vás uložené. Jméno a\u00a0e-mail pocházejí z\u00a0vašeho přihlašovacího účtu; změňte je tam. Každý člen může projekty a\u00a0úkoly pracovního prostoru, včetně e-mailových adres vlastníků a\u00a0řešitelů, exportovat do tabulky přes Import / export v\u00a0horní liště.",
        "Výmaz: požádejte správce, aby vás z\u00a0pracovního prostoru odebral. Vaše jméno zůstane u\u00a0dřívější aktivity, aby historie každého projektu zůstala pravdivá; pokud potřebujete víc, obraťte se na správce osobních údajů.",
        "Cokoli dalšího: kontaktujte {contact}. Stížnost můžete podat také u\u00a0národního dozorového úřadu pro ochranu osobních údajů.",
      ],
    },
  },
};
