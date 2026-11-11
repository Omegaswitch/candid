import type { Localized } from "./types";
import type { help as en } from "../en/help";

export const help: Localized<typeof en> = {
  title: "Nápověda",
  intro: "Jak Candid používat: od založení projektu po export do tabulky. Každý krok trvá jen pár kliknutí.",
  contents: "Obsah",
  sections: [
    {
      id: "zacatek",
      title: "Přihlášení a první kroky",
      steps: [
        "Otevřete www.candid.quest a přihlaste se pracovním e-mailem, účtem Google nebo Microsoft.",
        "Přístup má jen ten, koho pozval správce. Pokud uvidíte „Zatím nemáte přístup“, požádejte správce o pozvánku, nebo se odhlaste a použijte jiný účet.",
        "Jazyk přepnete v nabídce účtu (iniciály vpravo nahoře) nebo v Nastavení → Obecné.",
        "Vzhled (světlý, systémový, tmavý) přepnete posuvníkem vpravo nahoře.",
      ],
    },
    {
      id: "prehled",
      title: "Přehled projektů",
      steps: [
        "Na hlavní stránce jsou všechny aktivní projekty jako karty. Kruh nahoře ukazuje, kolik kroků je hotovo, a s každým odškrtnutým krokem se zaplní a změní barvu.",
        "Okraj karty se zbarví do oranžova, když se blíží termín, a do červena, když je po termínu.",
        "Pod kruhem najdete další krok, termín, průběh, stav a vlastníka.",
        "Čísla nahoře (aktivní projekty, úkoly po termínu, splatné tento týden) jsou klikací.",
        "Filtry (vlastník, stav, termín, priorita) a řazení si Candid pamatuje. Tlačítky vpravo přepnete mezi kartami a tabulkou.",
      ],
    },
    {
      id: "projekt",
      title: "Založení projektu",
      steps: [
        "Klikněte na „Přidat projekt“ vpravo nahoře.",
        "Vyplňte název, případně klienta, vlastníka, termín a prioritu.",
        "Kontrolní seznam se předvyplní výchozími kroky z Nastavení. Pro tento projekt je můžete upravit, přesunout nebo smazat a nové přidáte napsáním a klávesou Enter.",
        "Po vytvoření se projekt rovnou otevře v bočním panelu.",
      ],
    },
    {
      id: "kroky",
      title: "Kroky a kontrolní seznam",
      steps: [
        "Kliknutím na kartu otevřete boční panel projektu. Přehled zůstane vidět vedle.",
        "Krok odškrtnete kliknutím na kolečko vlevo. Kruh se hned doplní. Omyl vrátíte tlačítkem „Zpět“ v upozornění dole.",
        "Na název kroku klikněte pro přejmenování (Enter uloží, Esc zruší). Nový krok napíšete do pole pod seznamem.",
        "Nabídka ⋯ u kroku: posunout nahoru či dolů, odebrat. Kroky lze i přetáhnout za úchyt.",
        "U kroku můžete nastavit, kdo ho má na starosti, termín, poznámku a označení „Čeká se“ s důvodem.",
        "Přepínač „Rozdělit podle lidí“ rozdělí kroky do oddílů podle řešitele, každý s počtem hotových kroků. Přetažením kroku do jiného oddílu ho přiřadíte někomu jinému.",
        "Režim výběru umožní hromadně dokončit kroky, přiřadit je nebo změnit termín.",
        "Když jsou všechny kroky hotové, Candid nabídne označit projekt jako dokončený.",
      ],
    },
    {
      id: "poznamky",
      title: "Poznámky",
      steps: [
        "Poznámky k projektu i ke krokům se ukládají samy chvíli po dopsání. Stav vidíte u pole: „Ukládání…“, „Uloženo“, „Nelze uložit“.",
        "Když se uložení nepovede, text zůstane na místě a tlačítkem „Zkusit znovu“ ho odešlete.",
        "Když stejnou poznámku mezitím upravil kolega, Candid ukáže obě verze vedle sebe a vy vyberete, kterou ponechat, nebo ponecháte obě.",
      ],
    },
    {
      id: "pohledy",
      title: "Moje úkoly, Brzy splatné, Po termínu, Čeká se",
      steps: [
        "V levém menu najdete úkoly napříč projekty: přiřazené vám, splatné do 7 dnů, po termínu a čekající na někoho jiného.",
        "Úkoly jsou seřazené podle termínu a odškrtnout je můžete přímo v seznamu.",
        "Kliknutím na název projektu otevřete jeho panel.",
      ],
    },
    {
      id: "dokumenty",
      title: "Dokumenty",
      steps: [
        "V levém menu je knihovna dokumentů. Soubor nahrajete tlačítkem + nebo přetažením (PDF, DOCX, XLSX, CSV, PNG, JPEG, do 25 MB).",
        "Přidat lze i odkaz na externí dokument.",
        "Dokument můžete otevřít v náhledu, stáhnout, přejmenovat, nahradit, připnout nebo přiřadit k projektu. Dokumenty projektu jsou i v jeho panelu.",
      ],
    },
    {
      id: "archiv",
      title: "Archiv a mazání",
      steps: [
        "Hotový nebo neaktivní projekt archivujte v nabídce ⋯ na kartě. Zmizí z přehledu, ale nic se neztratí.",
        "V Archivu ho kdykoli obnovíte.",
        "Trvale smazat lze jen archivovaný projekt, a to tlačítkem „Smazat“ v Archivu. Smazání nelze vrátit.",
      ],
    },
    {
      id: "tabulky",
      title: "Import a export tabulek",
      steps: [
        "Tlačítko „Import / export“ v horní liště.",
        "Import: nahrajte CSV nebo XLSX, vložte řádky zkopírované z Excelu, nebo načtěte Google Tabulku. Průvodce vás provede přiřazením sloupců a náhledem změn a nic neuloží bez vašeho potvrzení.",
        "Šablonu pro import stáhnete ve stejné nabídce.",
        "Export: jeden projekt, vybrané projekty, aktuální pohled nebo celý prostor, jako CSV, Excel nebo Google Tabulka.",
        "Exportovaný soubor lze po úpravách znovu naimportovat v režimu „Aktualizovat“ bez duplicit.",
      ],
    },
    {
      id: "nastaveni",
      title: "Nastavení (správci)",
      steps: [
        "Členové: pozvete nového člověka e-mailem, změníte roli (správce/člen) nebo člena odeberete.",
        "Šablony: upravte kroky výchozího kontrolního seznamu. „Použít pro nové projekty“ určí, se kterým seznamem začne každý nový projekt.",
        "Integrace: připojení účtu Google pro import a export Google Tabulek.",
      ],
    },
  ],
  shortcutsTitle: "Klávesové zkratky",
  shortcuts: [
    { keys: "Ctrl / ⌘ + K", what: "Hledat a přejít kamkoli" },
    { keys: "/", what: "Otevřít hledání (mimo textové pole)" },
    { keys: "N", what: "Nový projekt (mimo textové pole)" },
    { keys: "T", what: "Přidat krok do otevřeného projektu (mimo textové pole)" },
    { keys: "Enter", what: "Uložit úpravu názvu nebo přidat krok" },
    { keys: "Esc", what: "Zrušit úpravu nebo zavřít panel" },
  ],
};
