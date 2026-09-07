# Immowelt Phase B: Session-Warm-up-Fix

## Problem

`erfasseImmoweltDetails` in `scraper/scrapers/immowelt/index.ts` startete einen
frischen Browser und navigierte als allererste Anfrage direkt auf eine
`/expose/`-URL. Immowelts Schutz beantwortet das mit einer HTTP-403-Huelle statt
der Detailseite. `parseImmoweltDetailPage` findet darin
`__UFRN_LIFECYCLE_SERVERREQUEST__` nicht und wirft
"Immowelt-Seitenstruktur hat sich vermutlich geaendert" -- fuer *jede*
Detailseite des Laufs.

Zweite Folge: die frisch eingebaute Consent-Banner-Bestaetigung lief in dieser
Funktion gegen ebendiese 403-Huelle und konnte nichts ausrichten.

Der ZVG-Scraper (`erfasseZvgDetails`) macht den fehlenden Schritt bereits
richtig: erst `SEARCH_URL` laden, dann `page.url()` als Referer fuer die
Detailabrufe nutzen.

## Aenderung (nur `scraper/scrapers/immowelt/index.ts`)

1. **Neue Konstante `AUFWAERM_URL`** (bei den anderen Modulkonstanten, direkt vor
   `sleep`):
   ```ts
   const AUFWAERM_URL = `${BASIS}${IMMOWELT_REGIONEN[0].pfad}`;
   ```
   Kein neues URL-Schema -- exakt die Form, die `regionErfassen` schon benutzt
   (`${BASIS}${region.pfad}`), mit dem ersten Bundesland der Regionsliste
   (Nordrhein-Westfalen).

2. **`erfasseImmoweltDetails` umgebaut:**
   - Nach `browser.newPage()` und *vor* jedem Detailabruf genau einmal
     `await page.goto(AUFWAERM_URL, { waitUntil: "domcontentloaded" })`.
   - `bestaetigeConsentBanner(page)` **danach** aufgerufen (vorher lag der
     Consent-Aufruf im Schleifenkoerper gegen die erste -- 403 -- Navigation).
     Das `consentErledigt`-Flag entfaellt, da das Aufwaermen ohnehin nur einmal
     laeuft (mirror von `erfasseZvgDetails`).
   - `const referer = page.url()` nach dem Aufwaermen; wird als
     `{ ..., referer }` an jede `page.goto(zusammenfassung.url, ...)` uebergeben.
   - Der bestehende `await sleep(IMMOWELT_VERZOEGERUNG_MS)` am Schleifenanfang
     bleibt unveraendert und dient jetzt zugleich als kurze Ruhe zwischen
     Suchseite und erstem Detailabruf (die manuelle Probe wartete "ein paar
     Sekunden"). Das Aufwaermen selbst ist ein weiterer Seitenabruf und liegt so
     im gleichen Drossel-Rhythmus wie die uebrigen.
   - Kommentarblock haelt die Evidenz fest: kalt -> HTTP 403 mit Huelle;
     Suchseite zuerst + warten -> HTTP 200 mit vollstaendigem Datenmodell
     (Live-Lauf 2026-09-07). Ausdruecklicher Hinweis "nicht als redundant
     entfernen".

Nicht angefasst: `headless: false`, Drossel-Werte, Sweep-Budgets,
Loeschlogik, ZVG-Scraper. Keine Header-/Fingerprint-Tricks.

## Woher die Warm-up-URL kommt

Aus den vorhandenen Bausteinen des Moduls: Basis-Pfad `BASIS`
(`https://www.immowelt.de/suche/kaufen/haus/mehrfamilienhaus/guenstig/`) plus
`IMMOWELT_REGIONEN[0].pfad` (`nordrhein-westfalen/ad04de5`). Ergibt eine echte,
im Modul bereits verwendete Ergebnislisten-URL.

## Verifikation

`npx tsc --noEmit` aus `scraper/`:
```
EXIT: 0
```
(sauber, keine Ausgabe)

`npm test` aus `scraper/`:
```
 Test Files  15 passed (15)
      Tests  225 passed (225)
   Duration  10.67s
```

Der Scraper wurde **nicht** ausgefuehrt (laufender Live-Lauf, Ratenlimit).

## Selbst-Review

- Warm-up-Navigation vor jedem Detailabruf, genau einmal? **Ja** -- ein
  `page.goto(AUFWAERM_URL)` vor der `for`-Schleife, nichts in der Schleife
  navigiert vorher.
- Consent-Bestaetigung jetzt gegen echte Seite statt 403-Huelle? **Ja** --
  direkt nach dem Aufwaermen, vor der Schleife.
- Referer bei den Detailnavigationen? **Ja** -- `referer = page.url()` nach dem
  Aufwaermen, an jede `page.goto(zusammenfassung.url, ...)` uebergeben, wie in
  `erfasseZvgDetails`.
- Kommentar haelt die Evidenz fest (nicht nur die Absicht)? **Ja** -- kalt =
  HTTP 403 mit Huelle, warm = HTTP 200 mit Datenmodell, Datum des Live-Laufs,
  "nicht als redundant entfernen".
- Zusaetzlicher Abruf gedrosselt wie die anderen? **Ja** -- der bestehende
  `sleep(IMMOWELT_VERZOEGERUNG_MS)` am Schleifenanfang spannt zwischen Aufwaermen
  und erstem Detailabruf; weitere Abrufe unveraendert.
- `tsc` sauber, Tests gruen? **Ja** (siehe oben).

## Bedenken

- `IMMOWELT_REGIONEN[0]` wird ohne Guard indiziert. `noUncheckedIndexedAccess`
  ist in `scraper/tsconfig.json` nicht gesetzt, `tsc` ist sauber, und dasselbe
  Muster (`treffer[1]`) existiert bereits im Modul. Die Liste ist eine
  hartkodierte 16-Element-Konstante -- praktisch unkritisch.
- Die Warm-up-URL zeigt fest auf NRW, unabhaengig von der Rotation in
  `sweepImmowelt`. Fuer das reine Aufwaermen der Session ist das ausreichend
  (die Aufgabe nennt "die erste Region ist eine vernuenftige Wahl"); es fuehrt zu
  einem zusaetzlichen, immer gleichen Ergebnislisten-Abruf pro Detaillauf.
- Nicht in einem echten Lauf gegen die Live-Site verifiziert (bewusst, wegen
  parallelem Live-Lauf). Der Fix folgt exakt dem dokumentierten Probe-Ergebnis
  und dem bereits bewaehrten ZVG-Muster.
