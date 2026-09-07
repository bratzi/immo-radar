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
 *  - Das Banner laedt verzoegert nach. Eine einmalige Pruefung direkt nach
 *    `domcontentloaded` sieht nichts, Sekundenbruchteile spaeter ist es da und
 *    blockt. Deshalb wird auf sein Anhaengen GEWARTET, nicht einmalig getestet.
 *  - Usercentrics baut das Overlay bei JEDEM Seitenwechsel neu auf
 *    (`data-created-at` unterscheidet sich zwischen zwei Beobachtungen). Eine
 *    Bestaetigung pro Browser-Context haelt daher ueber einen mehrseitigen
 *    Sweep NICHT -- der Pagination-Code muss bei einem fehlgeschlagenen
 *    "naechste Seite"-Klick erneut wegklicken (siehe scrapers/immowelt/index.ts).
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
    const overlay = page.locator(OVERLAY_SELEKTOR);

    try {
      await overlay.waitFor({ state: "attached", timeout: timeoutMs });
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

    for (const kandidat of kandidaten) {
      try {
        const ziel = kandidat.locator.first();
        if ((await ziel.count()) === 0) continue;

        await ziel.click({ timeout: KLICK_TIMEOUT_MS });

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
      `Consent-Banner angehaengt (${OVERLAY_SELEKTOR}), aber KEIN Akzeptieren-Selektor hat ` +
        `funktioniert -- das Banner-Markup hat sich vermutlich geaendert. Folge: jeder ` +
        `Pagination-Klick laeuft ab jetzt in einen 30-s-Timeout und der Sweep sieht nur ` +
        `Seite 1 pro Region. Kandidatenliste in scrapers/consent.ts pruefen/erweitern.`
    );
  } catch (err) {
    // Letzte Sicherung: diese Hilfsfunktion darf einen Sweep NIE abbrechen.
    console.warn("Consent-Banner: unerwarteter Fehler, ignoriert", err);
  }
}
