import type { Locator, Page } from "playwright";

/**
 * Wegklicken des Usercentrics-Cookie-Consent-Banners.
 *
 * WARUM DIESE DATEI EXISTIERT: Usercentrics rendert ein Overlay
 * (`#usercentrics-root`), das die komplette Seite ueberdeckt und JEDEN Klick
 * abfaengt -- Playwright meldet es woertlich als
 * "<div id=\"usercentrics-root\" ...> intercepts pointer events". Solange
 * dieser Dialog nicht bestaetigt ist, laeuft jeder Klick auf den
 * "naechste Seite"-Button nach 30 s in einen `locator.click`-Timeout. Der
 * Sweep bricht dadurch NICHT sichtbar ab, er sammelt still nur Seite 1 pro
 * Region ein und meldet trotzdem Erfolg. Genau dieser Fehler wurde im
 * Live-Lauf zweimal fehldiagnostiziert (erst als "Immowelt-Pagination kaputt",
 * dann als Anti-Bot-Block) -- es ist keins von beidem, sondern ein nicht
 * weggeklickter Dialog.
 *
 * Vier Eigenheiten, die die Umsetzung bestimmen:
 *  - `#usercentrics-root` ist im Light-DOM LEER; der eigentliche Dialog steckt
 *    in einem Shadow Root. Playwrights Selektor-Engine durchdringt Shadow DOM,
 *    ein `document.querySelector` in `page.evaluate` nicht. Deshalb hier
 *    ausschliesslich Playwright-Locators, kein `page.evaluate`.
 *  - Weil der Light-DOM-Host leer ist, hat er keine Ausdehnung und gilt
 *    Playwright NIE als "visible". Er liegt trotzdem ueber der Seite und frisst
 *    Pointer-Events -- Playwright meldet es woertlich als
 *    "<div id=\"usercentrics-root\" ...> intercepts pointer events". Eine
 *    fruehere Fassung wartete auf `state: "visible"` und lief damit jedes Mal
 *    in den Timeout ("kein #usercentrics-root binnen 10000 ms -- nichts zu
 *    tun"), waehrend Sekunden spaeter genau dieses Element den Pagination-Klick
 *    blockte. Deshalb wird auf `state: "attached"` gewartet -- der Host ist
 *    angehaengt und blockend, lange bevor er je "sichtbar" waere. NICHT auf
 *    `visible` "zurueckfixen".
 *  - Das Banner laedt verzoegert nach -- UND SEIN INHALT NOCHMALS VERZOEGERT.
 *    Der Host-Div `#usercentrics-root` haengt praktisch sofort an, doch
 *    Usercentrics rendert den Dialog-Inhalt (inklusive Akzeptieren-Knopf) erst
 *    einen Moment spaeter in den Shadow Root. Wer nur auf den Host wartet und
 *    dann SOFORT die Knopf-Selektoren abfragt, findet nichts -- `count()` auf
 *    `[data-testid="uc-accept-all-button"]` liefert 0 --, waehrend das Overlay
 *    schon jeden Klick abfaengt. Genau diese Sequenz im Bremen-Live-Lauf
 *    beobachtet: erster Aufruf direkt nach `goto` -> "KEIN Akzeptieren-Selektor
 *    hat funktioniert", nur Seite 1; beim Retry nach dem abgefangenen
 *    "naechste Seite"-Klick war derselbe Selektor
 *    `[data-testid="uc-accept-all-button"]` da und griff (Seite 2).
 *    AUSGEMESSEN am 2026-09-08 (Bremen, echte Seite): nach 3 s ist der Shadow
 *    Root LEER, nach rund 8 s traegt er vier Knoepfe -- darunter genau einen
 *    passenden, `[data-testid="uc-accept-all-button"]` mit der Beschriftung
 *    "OK". Keine der Text-Varianten unten trifft dieses Banner.
 *  - Daraus die wichtigste Konsequenz: Auf das Erscheinen wird EINMAL gewartet,
 *    mit dem GANZEN Budget, auf alle Kandidaten gleichzeitig (`Locator.or`).
 *    Eine fruehere Fassung teilte `timeoutMs` gleichmaessig auf die sieben
 *    Kandidaten auf; der einzige passende bekam davon ein Siebtel (~1,4 s von
 *    10 s) und war nach 1,4 s laengst aufgegeben, waehrend der Knopf 8 s
 *    braucht. Die Zustimmung kam so nie zustande. NICHT auf "Budget pro
 *    Kandidat" zurueckbauen.
 *  - Das Overlay bleibt nach dem Erscheinen LIEGEN. Frueher stand hier, es
 *    werde bei jedem Seitenwechsel neu gebaut; die Messung vom 2026-09-08
 *    widerlegt das: ueber drei aufeinanderfolgende Blaetter-Runden trug es
 *    unveraendert `data-created-at="1788818662736"` und fing dabei jeden Klick
 *    auf den "naechste Seite"-Knopf ab. Es taucht erst NACH dem ersten
 *    Seitenwechsel auf -- direkt nach dem Laden liegt es noch nicht ueber der
 *    Seite. Der Pagination-Code muss daher auch mitten in einer Region noch
 *    wegklicken koennen (siehe scrapers/immowelt/index.ts).
 *
 * Es wird der "Akzeptieren"-Knopf geklickt -- so, wie es ein Mensch tut. Das
 * Overlay wird NICHT aus dem DOM gerissen; das waere etwas anderes als eine
 * Einwilligung.
 *
 * Diese Funktion wirft nie. Schlaegt das Wegklicken fehl, faellt das Verhalten
 * auf den Stand ohne Consent-Handling zurueck -- die Regionen-Fehlerbehandlung
 * der Sweeps ueberlebt das bereits.
 */

/** Der Overlay-Host. Im Light-DOM leer, Inhalt im Shadow Root. */
const OVERLAY_SELEKTOR = "#usercentrics-root";

/** Wie lange auf das (verzoegert nachladende) Banner gewartet wird. Taucht es
 *  nicht auf, ist das ein regulaerer Ausgang -- kein Fehler. */
const ERSCHEINEN_TIMEOUT_MS = 10_000;

/** Wie lange nach einem Klick darauf gewartet wird, dass der geklickte Knopf
 *  aus dem DOM verschwindet, bevor der naechste Kandidat probiert wird. Der
 *  Host-Div `#usercentrics-root` selbst bleibt nach der Einwilligung bestehen
 *  und taugt daher NICHT als Erfolgssignal. */
const VERSCHWINDEN_TIMEOUT_MS = 4_000;

/**
 * Zusaetzliche Zeit, um nach dem Erscheinen des Banners herauszufinden, WELCHER
 * Kandidat der Akzeptieren-Knopf ist, und ihn zu klicken. Kommt bewusst oben
 * auf `timeoutMs` drauf: jenes Budget misst das Warten auf ein verzoegert
 * nachladendes Banner, und ein Banner, das erst kurz vor dessen Ablauf
 * erscheint, muss trotzdem noch geklickt werden koennen.
 */
const KANDIDAT_AUFLOESUNG_MS = 2_000;

/** Klick-Timeout pro Kandidat -- kurz halten, damit ein kaputtes Banner nicht
 *  jede Kandidatenrunde um 30 s verlaengert. */
const KLICK_TIMEOUT_MS = 3_000;

/**
 * Sichtbare Beschriftungen des Akzeptieren-Knopfes, exakt gematcht. Reihenfolge:
 * die eindeutig "alles akzeptieren" sagenden Varianten zuerst, dann das nackte
 * "Akzeptieren" (koennte sonst auch eine "Auswahl akzeptieren"-Schaltflaeche
 * treffen), zuletzt die Synonyme.
 */
const AKZEPTIEREN_TEXTE = [
  "Alles akzeptieren",
  "Alle akzeptieren",
  "Akzeptieren",
  "Zustimmen",
  "Einverstanden",
];

/**
 * Klickt das Usercentrics-Consent-Banner weg. Direkt nach der ersten Navigation
 * aufrufen. Der Consent-Zustand lebt zwar im Browser-Context, aber Usercentrics
 * baut das Overlay bei jedem Seitenwechsel neu auf -- deshalb ruft der
 * Pagination-Code diese Funktion bei einem fehlgeschlagenen Klick erneut auf,
 * dann mit kurzem `timeoutMs`.
 *
 * Wartet auf `state: "attached"`, NICHT auf `"visible"`: der leere Light-DOM-
 * Host `#usercentrics-root` wird nie sichtbar, blockt aber Pointer-Events,
 * sobald er angehaengt ist (Begruendung ausfuehrlich im Dateikopf).
 *
 * Das Warten auf den Host dient nur als Klassifikator "Banner da oder nicht"
 * (kein Overlay -> stiller Regulaerausgang, u. a. fuer das ZVG-Portal). Auf den
 * Akzeptieren-Knopf wird danach EINMAL gewartet, mit dem ganzen Restbudget und
 * auf alle Kandidaten gleichzeitig; erst wenn feststeht, DASS einer da ist,
 * wird kurz durchprobiert, WELCHER es ist (Begruendung im Dateikopf).
 *
 * @param page       Die Playwright-Seite.
 * @param timeoutMs  Wie lange auf das (verzoegert nachladende) Banner gewartet
 *                    wird, bevor "kein Banner" angenommen und regulaer
 *                    zurueckgekehrt wird. Standard: ERSCHEINEN_TIMEOUT_MS. Fuer
 *                    einen schnellen Nachfass-Check kurz setzen, damit ein
 *                    tatsaechlich fehlendes Banner den Sweep nicht ausbremst.
 */
export async function bestaetigeConsentBanner(
  page: Page,
  timeoutMs: number = ERSCHEINEN_TIMEOUT_MS
): Promise<void> {
  try {
    // Ein Zeitbudget fuer das ERSCHEINEN. Der Host-Wait unten verbraucht davon
    // fast nichts, solange ein Banner da ist (er haengt praktisch sofort an);
    // ist keins da, laeuft er als einziger Posten voll aus und wir kehren still
    // zurueck. Der Rest steht danach ungeteilt fuer den Knopf bereit.
    const gesamtDeadline = Date.now() + timeoutMs;
    const overlay = page.locator(OVERLAY_SELEKTOR);

    try {
      // Nur noch Klassifikator "Banner da oder nicht" -- der eigentliche Klick
      // wartet gleich pro Kandidat auf den Knopf selbst.
      await overlay.waitFor({
        state: "attached",
        // >= 1: Playwright deutet timeout 0 als "unbegrenzt" -- hier nie gewollt.
        timeout: Math.max(1, gesamtDeadline - Date.now()),
      });
    } catch {
      // Kein Banner aufgetaucht. Regulaerer Fall: das ZVG-Portal hat (noch)
      // keins, oder der Consent-Zustand ist im Context bereits gesetzt.
      console.log(`Consent-Banner: kein ${OVERLAY_SELEKTOR} binnen ${timeoutMs} ms -- nichts zu tun.`);
      return;
    }

    const kandidaten: { name: string; locator: Locator }[] = [
      {
        name: '[data-testid="uc-accept-all-button"]',
        locator: page.locator('[data-testid="uc-accept-all-button"]'),
      },
      {
        name: "#uc-btn-accept-banner",
        locator: page.locator("#uc-btn-accept-banner"),
      },
      ...AKZEPTIEREN_TEXTE.map((text) => ({
        name: `Button "${text}"`,
        locator: page.getByRole("button", { name: text, exact: true }),
      })),
    ];

    // EINMAL auf den Dialoginhalt warten -- mit dem GANZEN Restbudget und auf
    // alle Kandidaten GLEICHZEITIG (`Locator.or`), nicht nacheinander.
    //
    // WARUM DAS DER KERN IST: Frueher wurde das Budget gleichmaessig auf die
    // Kandidaten aufgeteilt. Live gemessen (Immowelt/Bremen, 2026-09-08) ist
    // der Shadow Root nach 3 s noch leer und traegt erst nach rund 8 s vier
    // Knoepfe, darunter den einzigen passenden:
    // `[data-testid="uc-accept-all-button"]` mit der Beschriftung "OK". Bei
    // 10 s Budget bekam genau dieser Selektor davon ein Siebtel -- ~1,4 s --,
    // und die sechs uebrigen verbrauchten den Rest mit Warten auf
    // Beschriftungen, die dieses Banner gar nicht traegt ("OK" ist keine
    // davon). Die Zustimmung kam so nie zustande, und in der Folge lief jeder
    // Paginierungs-Klick in das liegengebliebene Overlay. NICHT wieder auf
    // "Budget pro Kandidat" umbauen.
    const irgendeinKandidat = kandidaten
      .map((k) => k.locator)
      .reduce((a, b) => a.or(b))
      .first();
    let inhaltDa = true;
    try {
      await irgendeinKandidat.waitFor({
        state: "attached",
        timeout: Math.max(1, gesamtDeadline - Date.now()),
      });
    } catch {
      // Kein Kandidat binnen Budget erschienen. Die Schleife unten laeuft dann
      // leer durch und die Warnung am Ende greift.
      inhaltDa = false;
    }

    // Ab hier steht fest, DASS ein Knopf da ist -- offen ist nur, WELCHER.
    // Dafuer genuegt eine kurze Frist je Kandidat, und sie kommt bewusst
    // zusaetzlich zum Erscheinens-Budget: `timeoutMs` bemisst das Warten auf
    // das Banner, nicht das Auseinanderhalten bereits vorhandener Knoepfe. Ohne
    // diesen Zuschlag waere ein Banner, das erst kurz vor Ablauf erscheint,
    // gefunden und trotzdem nicht geklickt worden.
    const aufloesungsDeadline = Date.now() + (inhaltDa ? KANDIDAT_AUFLOESUNG_MS : 0);
    const proKandidatMs = 500;

    for (const kandidat of kandidaten) {
      const restBudget = aufloesungsDeadline - Date.now();
      if (restBudget <= 0) break;

      try {
        const ziel = kandidat.locator.first();

        try {
          // Auf den Akzeptieren-Knopf SELBST warten, nicht auf den Host: der
          // Shadow-Inhalt rendert spaeter (Dateikopf). `attached` genuegt --
          // sichtbar wird er im leeren Light-DOM-Host ohnehin nie sauber.
          await ziel.waitFor({
            state: "attached",
            timeout: Math.min(proKandidatMs, restBudget),
          });
        } catch {
          // Dieser Kandidat ist (noch) nicht im DOM -- naechsten probieren.
          continue;
        }

        await ziel.click({
          timeout: Math.min(KLICK_TIMEOUT_MS, Math.max(500, aufloesungsDeadline - Date.now())),
        });

        try {
          // NICHT auf das Verschwinden von `#usercentrics-root` pruefen: der
          // Host-Div ueberlebt die Einwilligung (im Live-Lauf nach
          // erfolgreichem Klick "Overlay noch angehaengt: true"). Verlaesslich
          // weg ist dagegen der geklickte Knopf selbst -- Usercentrics reisst
          // den Dialog-Inhalt aus dem Shadow Root, sobald die Einwilligung
          // sitzt. Haengt der Knopf noch, hat der Klick nichts bewirkt.
          await ziel.waitFor({ state: "detached", timeout: VERSCHWINDEN_TIMEOUT_MS });
        } catch {
          // Geklickt, aber der Knopf haengt noch -- war nicht der richtige.
          // Naechsten Kandidaten probieren.
          continue;
        }

        console.log(`Consent-Banner bestaetigt ueber Selektor: ${kandidat.name}`);
        return;
      } catch {
        // Dieser Kandidat war nicht (rechtzeitig) klickbar -- weiter.
        continue;
      }
    }

    console.warn(
      `Consent-Banner-Host ${OVERLAY_SELEKTOR} ist da, aber binnen ${timeoutMs} ms hat KEIN ` +
        `Akzeptieren-Selektor gegriffen. Das heisst meist NICHT, dass sich das Markup ` +
        `geaendert hat -- im Bremen-Live-Lauf war der Shadow-Inhalt beim ersten Versuch ` +
        `schlicht noch nicht gerendert und derselbe Selektor griff beim naechsten Retry. ` +
        `Folge fuer DIESEN Versuch: der Pagination-Klick laeuft in einen 30-s-Timeout und ` +
        `der Sweep sieht nur Seite 1 dieser Region; der Retry nach dem abgefangenen Klick ` +
        `holt es in der Regel nach. Erst wenn die Warnung dauerhaft und auch nach Retries ` +
        `kommt, Kandidatenliste in scrapers/consent.ts pruefen/erweitern.`
    );
  } catch (err) {
    // Letzte Sicherung: diese Hilfsfunktion darf einen Sweep NIE abbrechen.
    console.warn("Consent-Banner: unerwarteter Fehler, ignoriert", err);
  }
}
