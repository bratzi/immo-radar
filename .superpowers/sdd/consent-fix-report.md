# Consent-Banner-Fix — Bericht

## Ausgangslage

Jede Immowelt-Region im Sweep scheiterte am selben Punkt: der Klick auf
"nächste Seite" lief nach 30 s in einen `locator.click`-Timeout, weil
`<div id="usercentrics-root">` (Usercentrics-Cookie-Consent-Overlay) alle
Pointer-Events abfängt. Der Sweep brach dabei nicht sichtbar ab — er sammelte
still nur Seite 1 pro Region ein. Zuvor zweimal fehldiagnostiziert (erst
"Pagination kaputt", dann "Anti-Bot-Block"). Ursache war ein nicht
weggeklickter Dialog.

## Was geändert wurde

### Neu: `scraper/scrapers/consent.ts`

Ein Helfer `bestaetigeConsentBanner(page: Page): Promise<void>`, abgelegt in
`scrapers/` (nicht in `lib/`, das Domänenlogik hält, nicht Browser-Plumbing;
kein geteiltes Helfermodul existierte bisher).

Ablauf:
1. Wartet mit `overlay.waitFor({ state: "visible", timeout: 10_000 })` auf
   `#usercentrics-root`. Das Banner lädt verzögert nach, deshalb wird auf sein
   Erscheinen **gewartet**, nicht einmalig getestet. Taucht es nicht auf,
   Log-Zeile und stiller `return` — kein Fehler.
2. Probiert eine geordnete Kandidatenliste durch (siehe unten), jeweils als
   Playwright-Locator (`page.locator` / `page.getByRole`), **nie**
   `page.evaluate` — der Dialog steckt im Shadow Root des im Light-DOM leeren
   `#usercentrics-root`, Playwright-Locators durchdringen Shadow DOM,
   `document.querySelector` nicht.
3. Nach jedem Klick: `overlay.waitFor({ state: "hidden", timeout: 4_000 })`.
   Ist das Overlay noch da → nächster Kandidat. Der Klick wird also
   **verifiziert**, nicht angenommen.
4. Loggt bei Erfolg den konkreten Selektor
   (`Consent-Banner bestaetigt ueber Selektor: …`), bei Fehlschlag eine
   spezifische Warnung, dass das Banner-Markup sich vermutlich geändert hat und
   ab jetzt jeder Pagination-Klick in einen 30-s-Timeout läuft.
5. Wirft nie: gesamter Rumpf in `try/catch`, die inneren `waitFor`-Aufrufe
   zusätzlich einzeln abgefangen. Es gibt keine `throw`-Anweisung. Fällt etwas
   Unerwartetes an → `console.warn` und Rückkehr; das Verhalten degradiert auf
   den Stand ohne Consent-Handling, den die Regionen-Fehlerbehandlung bereits
   überlebt.

Deutscher Kommentar am Dateikopf erklärt das *Warum* (Overlay fängt
Pointer-Events ab → ohne Wegklicken Timeout nach 30 s → Sweep sammelt still nur
Seite 1 pro Region).

### Aufrufe (einmal pro Browser-Context, nach der ersten Navigation)

- **`sweepImmowelt`** — `regionErfassen` bekam den Parameter
  `consentBereitsBestaetigt`; direkt nach dem ersten `page.goto` ruft es
  `bestaetigeConsentBanner` nur, wenn der noch `false` ist. Die Schleife hält
  ein `let consentErledigt = false` und setzt es nach der ersten
  zurückgekehrten `regionErfassen` auf `true`.
- **`erfasseImmoweltDetails`** — `let consentErledigt`; nach dem ersten
  `page.goto(zusammenfassung.url)` einmal aufgerufen, Flag danach `true`.
- **`sweepZvgPortal`** — `let consentErledigt`; nach dem ersten
  `sucheFuerBundesland(page, landAbk)` einmal aufgerufen.
- **`erfasseZvgDetails`** — nach dem einzigen `page.goto(SEARCH_URL)` vor der
  Schleife, ohne Flag (keine Navigation davor, keine Wiederholung).

Kein Aufruf pro Region oder pro Seite — Consent-Zustand lebt im
Browser-Context.

## Kandidaten-Selektoren und Reihenfolge

```
1. [data-testid="uc-accept-all-button"]   (Usercentrics v2, dokumentierter Testid)
2. #uc-btn-accept-banner                   (ältere Usercentrics-Banner-Variante)
3. Button "Alles akzeptieren"   (exakt, getByRole button)
4. Button "Alle akzeptieren"    (exakt)
5. Button "Akzeptieren"         (exakt)
6. Button "Zustimmen"           (exakt)
7. Button "Einverstanden"       (exakt)
```

Begründung der Reihenfolge: zuerst die stabilen, maschinen-adressierbaren
Attribute — `data-testid` ist der von Usercentrics selbst vorgesehene Haken und
trifft am wenigsten wahrscheinlich das Falsche; danach die Legacy-ID. Text-
Matches zuletzt, weil sie am breitesten und riskantesten sind (können z. B.
"Auswahl akzeptieren" = nur Auswahl bestätigen treffen). Innerhalb der Texte
die eindeutig "alles" sagenden Varianten vor dem nackten "Akzeptieren"
(letzteres exakt gematcht, damit es nicht "Alles akzeptieren" mitnimmt oder
umgekehrt), dann die Synonyme. Alle Text-Kandidaten `exact: true` und über
`getByRole("button", …)`, damit sowohl `<button>` als auch `role="button"`
greifen und Teilstring-Fehltreffer ausgeschlossen sind.

## Verifikation

`npx tsc --noEmit` aus `scraper/`:

```
TSC_EXIT=0
```

`npm test` (vitest run) aus `scraper/`:

```
 Test Files  15 passed (15)
      Tests  225 passed (225)
   Duration  11.07s
TEST_EXIT=0
```

Der Scraper wurde **nicht** ausgeführt — ein Live-Lauf ist gerade unterwegs,
ein zweiter würde die Anfragerate gegen eine ratenlimitierende Seite
verdoppeln.

## Selbst-Review

- **Wartet der Helfer auf das Banner statt einmalig zu testen?** Ja —
  `waitFor({ state: "visible", timeout: 10_000 })`.
- **Durchgehend Playwright-Locators, damit das Shadow DOM erreichbar ist?**
  Ja — `page.locator`, `page.getByRole`, `Locator.click/waitFor/count`. Kein
  `page.evaluate`.
- **Wird das Verschwinden des Overlays verifiziert?** Ja —
  `waitFor({ state: "hidden", timeout: 4_000 })` nach dem Klick; bei Verbleib
  `continue` zum nächsten Kandidaten.
- **Einmal pro Context in allen vier navigierenden Funktionen?** Ja, per
  `consentErledigt`-Flag bzw. Parameter (siehe oben).
- **Kann er unter irgendeinem Umstand werfen?** Nein — vollständig in
  `try/catch` gekapselt, innere `waitFor` zusätzlich einzeln abgefangen, keine
  `throw`-Anweisung, Rückgabetyp `Promise<void>`.
- **`tsc` sauber, Tests grün?** Ja, beide.

## Nicht angefasst

`headless: false`, Drosseln (`IMMOWELT_VERZOEGERUNG_MS`, `ZVG_VERZOEGERUNG_MS`),
Budgets, Löschlogik. Das Overlay wird **nicht** aus dem DOM entfernt — es wird
der Akzeptieren-Knopf geklickt.

## Bedenken / Restpunkte

1. **`visible`-Wartebedingung.** Sollte `#usercentrics-root` im DOM stehen,
   Pointer-Events abfangen, aber von Playwright als *nicht sichtbar* gewertet
   werden (0×0-Box), wartet der Helfer die vollen 10 s und kehrt still zurück —
   Verhalten degradiert dann auf den alten Stand. Praktisch unwahrscheinlich,
   da das Abfangen von Klicks eine Layout-Fläche voraussetzt. Bewusst gegen ein
   `attached`+manueller-Sichtbarkeitscheck entschieden, weil "sichtbar" das
   aussagekräftigere "kann jetzt Klicks blocken"-Signal ist.
2. **Fehlerpfad in `sweepImmowelt`.** Wirft die erste `regionErfassen` *nach*
   dem `page.goto` (also nach dem Consent-Versuch), wird `consentErledigt`
   nicht auf `true` gesetzt; die nächste Region ruft `bestaetigeConsentBanner`
   erneut → einmalige, gedeckelte 10-s-Wartezeit (Banner schon akzeptiert,
   `#usercentrics-root` bleibt hidden), dann stille Rückkehr. Nur im Fehlerpfad,
   höchstens einmal, keine funktionale Auswirkung. Eine exaktere Signalisierung
   ("Consent versucht") wäre möglich, aber die Zusatzkomplexität lohnt für einen
   gedeckelten 10-s-Wartefall nicht.
3. **ZVG-Portal.** Dort gibt es vermutlich kein Usercentrics-Banner; der
   Helfer kehrt nach der 10-s-Wartezeit still zurück. Das ist der erwartete
   Ausgang und der Grund, warum der Aufruf trotzdem drin ist (Schutz, falls das
   Portal später eins nachrüstet). Kostet einen gedeckelten Wartevorgang pro
   Context.
4. **Keine Unit-Tests für `consent.ts`.** Der Helfer ist reine
   Playwright-Locator-Choreografie; ein sinnvoller Test bräuchte einen echten
   Browser oder ein umfangreiches Page-Mock. Der Auftrag verlangte keine Tests
   für den Helfer, nur grüne Bestandstests. Live-Verifikation steht aus (Lauf
   in flight).
