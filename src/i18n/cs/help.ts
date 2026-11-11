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
        "Filtry (vlastník, stav, termín, priorita) a řazení si Candid pamatuje. Tlačítky vpravo přepnete mezi kartami, tabulkou a pipeline podle stavu.",
        "Tlačítko „Moje“ jedním klikem ukáže jen projekty, které vlastníte nebo kde máte otevřené kroky.",
        "Pipeline funguje i na telefonu: sloupce posouváte do strany. Na dotykové obrazovce kartu přesunete přes nabídku ⋯ → „Přesunout do“.",
        "Pod údaji na kartě je vidět, jak dlouho je projekt v aktuálním stavu (např. „12 d ve stavu Čeká se“). V tabulce kliknutím na „Ve stavu“ seřadíte projekty podle této doby.",
        "Aktivní nebo čekající projekt, na kterém se 14 dní nic nestalo (žádná změna stavu, kroku ani poznámky), dostane značku „Bez pohybu“. Tlačítko „Vyžaduje pozornost“ ukáže jen projekty bez pohybu nebo s úkoly po termínu.",
        "Název klienta na kartě, v tabulce, v panelu i v Přehledech otevře stránku klienta: všechny jeho projekty (aktivní i archivované), kontakty s odkazy pro volání a psaní, podíl kroků hotových včas a kroky po termínu.",
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
        "Otevřené kroky jsou číslované průběžně (1., 2., 3. …), i když jsou rozdělené podle lidí.",
        "U kroku po termínu klikněte na „Po termínu“ a termín posuňte o den, o týden nebo vyberte nové datum.",
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
      id: "kalendar",
      title: "Kalendář",
      steps: [
        "„Kalendář“ v levém menu ukazuje měsíc (týden začíná pondělím) s otevřenými kroky podle termínu, termíny projektů (vlaječka) a dalšími kontakty (čárkovaně, ikona telefonu). Dnešek je zvýrazněný; mezi měsíci se přepíná šipkami a tlačítkem „Dnes“.",
        "„Jen moje“ nechá kroky přiřazené vám a projekty, které vlastníte. Kliknutím na položku otevřete projekt. Den s více než třemi položkami ukazuje „+N“; kliknutím zobrazíte všechny.",
        "Krok přetažením na jiný den změníte jeho termín; dole se objeví Zpět. Z klávesnice: na kroku stiskněte mezerník, šipkami se přesuňte a mezerníkem upusťte. Na telefonu je kalendář seznam dnů, ve kterých něco je.",
      ],
    },
    {
      id: "kontakt",
      title: "Další kontakt a zápis kontaktu",
      steps: [
        "V projektu je pole „Další kontakt“: datum a krátká poznámka k příštímu hovoru nebo e-mailu s klientem; křížkem ho zrušíte. Zobrazí se i v kalendáři.",
        "„Kontaktovat dnes“ nahoře na stránce Všechny projekty ukazuje kontakty, které jsou na řadě nebo mají zpoždění. „Hotovo“ kontakt smaže a zapíše ho do historie.",
        "„Zapsat kontakt“ uloží do historie projektu hovor, e-mail nebo schůzku s jednořádkovým výsledkem a může rovnou nastavit datum dalšího kontaktu. Totéž umí AI asistenti nástrojem log_contact.",
      ],
    },
    {
      id: "prehledy",
      title: "Přehledy",
      steps: [
        "Stránka Přehledy v levém menu ukazuje čísla za celý prostor. „Průměrně dní ve stavu“ říká, jak dlouho projekt obvykle zůstává v jednotlivých stavech (počítá se z historie změn, včetně probíhajících pobytů).",
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
      id: "hledani",
      title: "Hledání",
      steps: [
        "Stiskněte Ctrl / ⌘ + K (nebo /) a pište. Projekty, kroky i dokumenty se najdou bez ohledu na velká písmena a diakritiku.",
        "Každé slovo musí v nálezu někde být. Slova v\u00a0uvozovkách vyhledají přesnou frázi, např. „schůzka s\u00a0klientem“.",
        "Filtry: klient:Název, štítek:Název, typ:projekt|úkol|dokument a po termínu. Hodnoty s\u00a0mezerou dejte do uvozovek: klient:\"Stavby Novák\".",
        "Lidé: přiřazeno:Jana (kroky přiřazené Janě), vede:Jana (vlastník projektu); jméno nebo začátek e-mailu, já = vy. Data: upraveno:dnes, vytvořeno:7d, termín:7d (do 7 dnů včetně po termínu) nebo termín:2026-11-30.",
        "Pomlčka vyloučí: -smlouva, -štítek:čekáme, -typ:dokument. V\u00a0prázdném hledání uvidíte naposledy otevřené projekty a poslední hledání.",
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
        "Součástí jsou i sloupce Štítky (názvy oddělené čárkami; chybějící se vytvoří) a kontakt klienta (jméno, e-mail, telefon). Starší soubory bez nich se naimportují také.",
      ],
    },
    {
      id: "ai",
      title: "Propojení s Claude a ChatGPT (MCP)",
      steps: [
        "Candid umí připojit AI asistenta. Ten pak za vás hledá, čte projekty a úkoly, zakládá projekty, přidává a odškrtává kroky a přidává štítky. Vidí jen váš workspace a každá změna se zapíše do historie pod vaším jménem.",
        "Adresa serveru je https://www.candid.quest/api/mcp (najdete ji i v Nastavení → Integrace).",
        "Claude: Nastavení → Konektory → Přidat vlastní konektor. Vložte adresu, potvrďte, přihlaste se do Candidu a klikněte na „Povolit“.",
        "ChatGPT: Nastavení → Aplikace a konektory → Pokročilé → zapněte Režim pro vývojáře. Pak „Vytvořit“, vložte adresu, jako ověření zvolte OAuth, přihlaste se do Candidu a klikněte na „Povolit“.",
        "Pak stačí psát, třeba „Co je po termínu?“ nebo „Přidej do projektu Novák krok Poslat smlouvu a přiřaď ho Ivaně“.",
        "Připojené aplikace uvidíte v Nastavení → Integrace a tlačítkem „Odpojit“ jim přístup kdykoli zrušíte.",
        "Pro jiné nástroje (např. Claude Code) si tamtéž vytvoříte osobní klíč a pošlete ho v hlavičce Authorization: Bearer. Klíč se ukáže jen jednou, nikomu ho neposílejte.",
        "Pozor: co asistent z Candidu přečte (jména klientů, poznámky), odchází do dané AI služby.",
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
    { keys: "?", what: "Zobrazit klávesové zkratky (mimo textové pole)" },
  ],
};
