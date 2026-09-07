# Consent-Banner: auf `attached` warten statt auf `visible`

## Ausgangslage

`scraper/scrapers/consent.ts` sollte Immowelts Usercentrics-Overlay wegklicken,
lief aber leer: die Hilfsfunktion wartete auf `state: "visible"`. Der Light-DOM-
Host `#usercentrics-root` ist leer (Inhalt komplett im Shadow Root), hat also
keine Ausdehnung und wird von Playwright nie als sichtbar gewertet. Der Wait lief
jedes Mal in den Timeout ("kein #usercentrics-root binnen 10000 ms -- nichts zu
tun"), Sekunden spaeter fing genau dieses Element den Pagination-Klick ab
("<div id=\"usercentrics-root\" ...> intercepts pointer events"). Die
Kandidatenliste selbst war korrekt (`uc-accept-all-button` zuerst, Label "OK") --
sie kam nur nie zum Zug.

Zweitbefund aus der Live-Probe: nach dem Akzeptieren blaetterte die Pagination
(Seite 1 -> 42 Objekte, Seite 2 -> 84), der dritte Klick wurde erneut abgefangen.
Usercentrics baut das Overlay bei jedem Seitenwechsel neu auf (`data-created-at`
unterscheidet sich zwischen Beobachtungen) -- eine Bestaetigung pro Browser-
Context reicht fuer einen mehrseitigen Sweep nicht.

## Was geaendert wurde

### 1. `scraper/scrapers/consent.ts`

- **Wait-State**: `overlay.waitFor({ state: "visible" })` -> `{ state: "attached" }`.
- **`timeoutMs`-Parameter**: `bestaetigeConsentBanner(page, timeoutMs = ERSCHEINEN_TIMEOUT_MS)`.
  Der Default ist der bisherige Wert (10 000 ms); der Wert fliesst in den Wait
  und in die Log-Zeile. Aufrufer koennen jetzt einen kurzen Nachfass-Check
  machen, ohne bei fehlendem Banner die volle Wartezeit zu zahlen.
- **Post-Klick-Verifikation**: nicht mehr `overlay.waitFor({ state: "hidden" })`,
  sondern `ziel.waitFor({ state: "detached" })` -- siehe naechster Abschnitt.
- **Kommentare**: Der Dateikopf listet jetzt vier statt zwei Eigenheiten. Neu:
  (a) der leere Host wird nie "visible", blockt aber Pointer-Events, sobald er
  angehaengt ist -- mit den woertlichen Log-Zitaten und dem ausdruecklichen
  "NICHT auf `visible` zurueckfixen"; (b) Usercentrics baut das Overlay pro
  Seitenwechsel neu auf, der Pagination-Code muss nachfassen. Der Funktions-
  JSDoc erklaert den `attached`-Wait und den neuen Parameter. Die "gone"-
  Konstante und die Schlusswarnung ("sichtbar" -> "angehaengt") sind
  nachgezogen.
- **Never-throws-Vertrag**: unveraendert. Aeusseres `try/catch` steht, alle
  inneren Waits sind gekapselt, der neue Parameter hat einen Default und
  eroeffnet keinen neuen Wurfpfad.
- **Selektorliste und Reihenfolge**: unveraendert.

### 2. `scraper/scrapers/immowelt/index.ts`

In der Pagination-Schleife von `regionErfassen`:

```
if ((await weiter.count()) === 0) break;      // unveraendert: Regionsende
await sleep(IMMOWELT_VERZOEGERUNG_MS);
try {
  await weiter.first().click();
} catch {
  await bestaetigeConsentBanner(page, 2000);  // kurz wegklicken
  try {
    await weiter.first().click();             // GENAU ein Retry
  } catch {
    break;                                    // dann aufgeben wie bisher
  }
}
await page.waitForLoadState("domcontentloaded");
```

Der Retry greift ausschliesslich im `catch` eines fehlgeschlagenen Klicks. Die
`count() === 0`-Pruefung (fehlender "naechste Seite"-Knopf = regulaeres
Regionsende) steht davor und ist unangetastet. Genau ein Retry, danach `break` --
kein Endlos-Loop. Ein fehlgeschlagener Retry bricht mit `seite <= SEITEN_DECKEL`
ab, also `abgeschnitten: false`, identisch zum heutigen Missing-Button-Ende. Der
Kommentar nennt die Ursache (Overlay-Neuaufbau pro Seite) und die Evidenz
(Seiten 1/2 ok nach einer Bestaetigung, Seite 3 erneut abgefangen).

## Gewaehlte Post-Klick-Verifikation und Begruendung

Gewaehlt: **der geklickte Akzeptieren-Knopf selbst ist danach `detached`**
(`ziel.waitFor({ state: "detached", timeout: VERSCHWINDEN_TIMEOUT_MS })`).

Grund: Der alte `hidden`-Test auf `#usercentrics-root` kann nach dem Umstieg auf
`attached` per Definition nicht mehr bestehen -- die Live-Probe zeigt den Host
nach erfolgreichem Klick weiterhin angehaengt ("Overlay noch angehaengt: true").
Was Usercentrics bei einer Einwilligung entfernt, ist der Dialog-Inhalt im Shadow
Root, und damit der "OK"/`uc-accept-all-button` selbst. Die Ablösung genau des
Elements, das geklickt wurde, ist das praeziseste Erfolgssignal und passt sauber
in die Kandidatenschleife: hat ein falscher Kandidat nichts bewirkt, bleibt er
angehaengt und der naechste Kandidat wird probiert. Die Alternative
(`#usercentrics-root button`-Count auf 0) waere aequivalent, aber weniger direkt
an die ausgefuehrte Aktion gebunden.

## Verifikation

`npx tsc --noEmit` aus `scraper/`:

```
EXIT: 0
```

`npm test` aus `scraper/`:

```
 Test Files  16 passed (16)
      Tests  229 passed (229)
   Duration  10.40s
EXIT: 0
```

Der Scraper bzw. eine Live-Probe wurde absichtlich NICHT ausgefuehrt.

## Tests

Kein Unit-Test hinzugefuegt. Beide Aenderungen sind Playwright-Choreografie
(`waitFor`-States, Locator-Klicks, `try/catch`-Kontrollfluss um Browser-I/O). Es
faellt keine reine Logik heraus, die sich ohne Browser-Mock testen liesse -- und
ein Browser-Mock war laut Auftrag explizit nicht erwuenscht. Die vorhandenen
reinen Helfer in `scrapers/immowelt/index.test.ts` (`trefferzahlAusTitel`,
`istRegionVollstaendig`) sind unberuehrt und weiterhin gruen.

## Selbstpruefung

- Wartet der Helper jetzt auf `attached`? Ja.
- Prueft die Post-Klick-Verifikation etwas, das nach der Einwilligung wirklich
  zutrifft? Ja -- der geklickte Knopf wird von Usercentrics aus dem Shadow Root
  entfernt; der Host-Div, auf den der alte Test zielte, ueberlebt.
- Kann der Helper weiterhin nie werfen? Ja -- Struktur der `try/catch` unveraendert,
  neuer Parameter mit Default.
- Feuert der Pagination-Retry nur bei fehlgeschlagenem Klick, nie bei fehlendem
  Knopf? Ja -- `count() === 0`-`break` steht vor dem `try`.
- Ist der Retry auf genau eins begrenzt? Ja -- ein `bestaetigeConsentBanner` +
  ein weiterer `click()`, danach `break`.
- `tsc` sauber, Tests gruen? Ja (Exit 0 / 229 passed).

## Bedenken

- Die `detached`-Verifikation setzt voraus, dass Usercentrics den Akzeptieren-
  Knopf beim Accept-all aus dem DOM nimmt (nicht nur versteckt). Die Live-Probe
  belegt den Abbau des Dialogs (Banner weg, Pagination laeuft), druckt aber
  keinen expliziten Button-Count nach dem Klick. Sollte eine kuenftige
  Usercentrics-Version den Knopf versteckt angehaengt lassen, liefe der Helper
  seine Kandidatenliste durch bis zur "Markup geaendert"-Warnung -- trotz
  erfolgreichem Klick. Risiko gering, Folge nicht fatal (Funktion wirft nicht).
- Der erste fehlschlagende Klick zahlt weiterhin Playwrights Default-Action-
  Timeout (30 s) vor dem `catch`, der Retry-Klick ggf. noch einmal 30 s vor dem
  `break`. Das liegt innerhalb der Vorgabe "ein Retry, dann aufgeben", und
  Timeouts/Budgets waren tabu -- aber eine Region, deren letzte Seite dauerhaft
  abgefangen wird, kostet am Regionsende jetzt bis zu ~60 s statt ~30 s.
