# immo-radar — Rückstandskatalog

> **Für ausführende Agenten:** Teil A ist so geschnitten, dass ein frischer
> Agent ohne Vorwissen arbeiten kann — Dateien, Prüfschritt, Erwartung und
> Abnahme stehen dran. Teil B braucht **erst einen Entwurf**: dort zuerst
> `superpowers:brainstorming`, dann `superpowers:writing-plans`. Teil C ist
> bewusst zurückgestellt und wird nur auf ausdrücklichen Wunsch angefasst.

**Stand:** 2026-09-08. Statusübersicht: [`TODO.md`](TODO.md).

## Immer gültige Randbedingungen

Gelten für **jede** Aufgabe hier, deshalb nur einmal genannt:

- **Kein bundesweiter Scraper-Lauf über den Anschluss des Nutzers.** Lokal
  höchstens **eine** Region über `scraper/scripts/pruefe-region.mts`, danach
  auswerten, bevor der nächste läuft. Ein voller Lauf hat das Heimnetz zweimal
  lahmgelegt — nicht die Datenmenge, sondern tausende Verbindungen und
  DNS-Abfragen. Vollständige Läufe gehören in GitHub Actions.
- **Chromium läuft mit Fenster** (`headless: false`). Immowelt weist headless
  mit HTTP 403 und DataDome-CAPTCHA ab. In CI unter `xvfb-run`. Nicht auf
  headless „zurückoptimieren".
- **Ein CAPTCHA wird nicht gelöst.** Es ist ein Messwert für eine zu hohe
  Abrufrate. Antwort ist Drosselung, nicht Umgehung.
- **TDD ist Pflicht:** erst der Test, ihn scheitern sehen, dann die minimale
  Umsetzung.
- **Vor jeder Erfolgsmeldung:** `cd scraper && npx vitest run` und
  `npx tsc --noEmit` frisch laufen lassen und die Ausgabe zeigen.
- **Wer nicht urteilen kann, löscht nicht.** Jede Änderung an
  `lib/bestand.ts`, `lib/plausibilitaet.ts` oder `lib/bestandDb.ts` berührt die
  Wachen vor der Massenlöschung. Dort nie fail-open bauen: ein unbekannter
  Zustand ist `null`/`false`, nie „in Ordnung".

---

# Teil A — Sofort ausführbar

## A1. Immowelt-Detailerfassung liefert nichts — DRINGEND

**Befund (2026-09-08):** Der Sweep sieht seit dem Pagination-Fix **3.665**
Objekte statt 717. Die letzte erfolgreiche Immowelt-Detailerfassung war
jedoch am **2026-09-07 um 17:41 UTC**. Seither: null. `listings` für Immowelt
steht unverändert bei 157, `listings` mit gesetztem `fundort` bei 0.

**Warum das alles blockiert:** Ohne Detailseite gibt es keine Kennzahlen, ohne
Kennzahlen keine Bewertung, ohne Bewertung keine Meldung. Der Radar findet
gerade tausende Objekte und meldet keines davon. Auch die Fundort-Spalte
bleibt leer, weil sie erst beim Detail-Upsert geschrieben wird — B1 steht
damit still.

**Dateien:** `scraper/scrapers/immowelt/index.ts` (`erfasseImmoweltDetails`),
`scraper/main.ts` (Auswahl der Detailkandidaten).

- [ ] **Schritt 1: Im Actions-Log nachsehen, nicht raten.** Lauf 14 über die
      Weboberfläche öffnen und nach diesen Zeilen suchen:
      `Immowelt-Detailseite ... Fehler, übersprungen` sowie der Zeile, die die
      Zahl der Detailkandidaten nennt. Notieren, wie viele gewählt und wie
      viele übersprungen wurden.
- [ ] **Schritt 2: Lokal EINE Detailseite prüfen.** Eine `/expose/`-URL aus dem
      Sweep nehmen und über denselben Codepfad holen. **Höchstens ein Abruf.**
      Erwartung laut Dokumentation: Ein frischer Browser bekommt auf einer
      Exposé-URL eine 403-Hülle, deshalb wärmt `erfasseImmoweltDetails` erst an
      einer Suchseite auf. Prüfen, ob dieses Aufwärmen noch greift.
- [ ] **Schritt 3: Overlay-Verdacht prüfen.** `erfasseImmoweltDetails` ruft
      `schliesseStoerendeUeberlagerung` **nicht** auf — nur der Sweep tut das.
      Der Suchauftrag-Dialog erscheint beim Aufwärmen an der Suchseite und
      könnte die anschließende Detailnavigation stören.
- [ ] **Schritt 4: Erst nach benannter Ursache** einen scheiternden Test
      schreiben, dann beheben.

**Abnahme:** Nach einem Produktionslauf steigt `listings` für Immowelt, und
`select count(*) from listings where fundort is not null` ist größer als 0.

## A2. Abgelaufenes GitHub-Token aus `.env` entfernen

**Warum:** `GH_TOKEN` in `scraper/.env` wird von der GitHub-API mit **401 Bad
credentials** abgewiesen — wirkungslos und trotzdem ein Geheimnis in einer
Datei. Sein Wert wurde am 2026-09-08 zudem versehentlich in ein
Sitzungsprotokoll ausgegeben.

**Dateien:** `scraper/.env` (nicht im Repo).

- [ ] **Schritt 1:** `grep -rn "GH_TOKEN" scraper --include=*.ts --include=*.mts`
      — Erwartung: keine Treffer, es wird nirgends gelesen.
- [ ] **Schritt 2:** Zeile aus `scraper/.env` entfernen.
- [ ] **Schritt 3:** Den Nutzer bitten, das Token auf GitHub zu widerrufen
      (Settings → Developer settings → Personal access tokens).

**Abnahme:** `.env` ohne `GH_TOKEN`; Widerruf vom Nutzer bestätigt.

## A3. Einweg-Diagnoseskript entfernen

**Warum:** `scraper/scripts/diagnose-consent.mts` hat seinen Zweck erfüllt;
sein Befund steht vollständig im Kopf von `scrapers/consent.ts`.
`diagnose-overlays.mts` bleibt — es schneidet Netzwerkverkehr mit und benennt
das blockierende Element, das wird wieder gebraucht.

- [ ] **Schritt 1:** `scraper/scripts/diagnose-consent.mts` löschen.
- [ ] **Schritt 2:** `npx tsc --noEmit` — Erwartung: sauber.
- [ ] **Schritt 3:** Commit `chore(scraper): Einweg-Diagnoseskript entfernen`.

**Abnahme:** `tsc` sauber, `vitest` unverändert grün.

## A4. Einen ZVG-Lauf mit `vollstaendig: false` aufklären

**Warum:** Am 2026-09-07 um 17:42 UTC meldete ZVG `vollstaendig: false`,
während alle anderen Läufe `true` melden und durchgehend 188–189 Objekte
liefern. ZVG ist die **einzige** Quelle mit Löschhoheit — ein unerkannter
Aussetzer dort ist teuer.

- [ ] **Schritt 1:** Häufigkeit bestimmen:

```sql
select vollstaendig, count(*), min(started_at), max(started_at)
from sweep_runs where source = 'zvg-portal' group by vollstaendig;
```

- [ ] **Schritt 2:** Bei mehr als einem Vorkommen das Actions-Log des
      betroffenen Laufs lesen und die `ZVG-Sweep <land>`-Zeile suchen, die
      fehlt oder einen Fehler meldet.
- [ ] **Schritt 3:** Ergebnis in `TODO.md` festhalten. **Keine Änderung an der
      Löschlogik ohne eigenen Entwurf.**

**Abnahme:** Häufigkeit dokumentiert; Ursache benannt oder als „einmalig,
weiter beobachten" vermerkt.

## A5. Immowelt-Wohnflächen gegenprüfen

**Warum:** Die Wohnflächen-Ernte vom 2026-09-08 betraf nur ZVG-Gutachten. Für
Immowelt ist der Anteil fehlender Flächen nie gemessen worden.

- [ ] **Schritt 1:** Anteil bestimmen:

```sql
select count(*) filter (where lv.living_area_m2 is null or lv.living_area_m2 = 0) as ohne,
       count(*) as gesamt
from listing_versions lv join listings l on l.id = lv.listing_id
where l.source = 'immowelt';
```

- [ ] **Schritt 2:** Unter 10 % — Aufgabe schließen, Ergebnis in `TODO.md`.
      Darüber — Fixture `scraper/test/fixtures/immowelt-expose-mehrfamilienhaus.html`
      prüfen, scheiternden Test schreiben, dann beheben.

**Abnahme:** Anteil dokumentiert; bei Bedarf Test und Fix nach TDD.

---

# Teil B — Braucht erst einen Entwurf

Nicht direkt implementieren. Reihenfolge: `superpowers:brainstorming` → Spec
unter `docs/superpowers/specs/` → `superpowers:writing-plans` → Umsetzung.

## B1. Immowelt-Löschhoheit, Phase 2 — regionsgenaues Löschen

**Harte Voraussetzung:** `sweep_region_runs` muss je Region **drei**
vollständige Läufe zeigen. Vorher ist die Aufgabe wirkungslos.

```sql
select partition, count(*) filter (where vollstaendig) as referenzlaeufe
from sweep_region_runs where source = 'immowelt'
group by partition order by referenzlaeufe desc;
```

Stand 2026-09-08: vier Regionen mit je einem Lauf (`br`, `st`, `th`, `sl`).
**Zusätzlich blockiert durch A1** — ohne Detailerfassung bleibt
`listings.fundort` leer, und ohne Fundort ist keine Verengung möglich.

**Zu entwerfen:** Die Mengenplausibilität ist heute quellenweit
(`lib/plausibilitaet.ts`, Median aus `sweep_runs`). Für regionsgenaues Löschen
muss sie je Partition rechnen, und `ermittleAbgaenge` muss über
`listings.fundort` verengen statt über `partitionAusExternalId`, das für
Immowelt `null` liefert.

**Warum es gefährlich ist:** Genau diese Wachen hätten in einem früheren
Entwurf rund 7.500 echte Objekte gelöscht, weil ein still geblocktes
Nordrhein-Westfalen (21,2 % des Bestands) innerhalb der 25-%-Toleranz lag. Der
Entwurf muss ausdrücklich beantworten, was bei `fundort is null` geschieht
(Antwort: nie löschen) und was gilt, wenn eine Region im Lauf gar nicht
vorkam.

## B2. Dashboard / Teilprojekt 3

**Vom Nutzer genannt** (`specs/2026-09-07-plan3-dashboard-anforderungen.md`):
Ranking statt Liste; Veränderungen sichtbar; Reihenfolge folgt der
Veränderung; Abgänge während der Karenz ausgegraut.

**Datengrundlage steht vollständig:** Kennzahlen je Version in
`listing_versions.metrics`, Historie mit `changed`/`price_dropped`,
`listings.disappeared_at`, `notifications`.

**Was der Entwurf klären muss** — diese Fragen stammen aus einer früheren
Claude-Sitzung, **nicht** vom Nutzer:

1. Woraus besteht „lukrativ"? Es gibt Kaufpreisfaktor, DSCR und
   Nettomietrendite, aber keine einzelne Rangzahl.
2. Wie werden geschätzte gegen belegte Zahlen einsortiert? **Neu und
   entscheidend:** Nach der Messung vom 2026-09-08 beruhen praktisch alle
   Mieten auf einer unvalidierten Handtabelle, über die Hälfte der Objekte
   trägt `wohnflaeche_fehlt`, und 567 von 1.000 Versionen tragen
   `units_unconfirmed`. Ein Ranking, das das nicht abbildet, sortiert
   Nichtwissen wie Wissen.
3. Welcher Zeitraum gilt als „verändert"?
4. **Zugriff:** Alle Tabellen haben RLS **ohne Policies**; nur der Service-Key
   kommt an die Daten. Ein Frontend braucht dazu eine bewusste Entscheidung —
   und der Service-Key darf niemals ins Frontend.

## B3. Regionale Mietwerte validieren

**Warum:** `lib/rentEstimate.ts` enthält 95 handrecherchierte €/m²-Werte je
PLZ-Zweisteller. Sie sind die Grundlage **jeder** Bewertung und nie gegen eine
Quelle geprüft worden. Ein systematischer Fehler dort verschiebt das gesamte
Ranking.

**Zu klären:** Welche Quelle ist zulässig und belastbar? Ein Korpus aus dem
eigenen Bestand scheidet aus — es gibt **zwei** Objekte mit angegebener Miete,
belegt in `specs/2026-09-08-mietqualitaet-befund.md`.

## B4. Einheitenzahl belastbarer machen

**Warum:** 567 von 1.000 Versionen tragen `units_unconfirmed`. Für sie wird die
Einheitenzahl mit `MIN_EINHEITEN = 3` **angenommen** (`bewerteEinheiten` in
`lib/pipeline.ts`), und diese Annahme geht in die Kennzahlen ein. Die Näherung
ist bewusst und dokumentiert, betrifft aber die Mehrheit des Bestands.

**Zu klären:** Lässt sich die Einheitenzahl aus Titel, Beschreibung oder
Wohnfläche verlässlicher ableiten? Und soll ein Objekt mit angenommener
Einheitenzahl im Ranking gleichwertig erscheinen?

---

# Teil C — Bewusst zurückgestellt

Aus früheren Entwürfen, mit Begründung. Nur auf ausdrücklichen Wunsch.

| Punkt | Warum zurückgestellt |
|---|---|
| **Ertragswertverfahren nach ImmoWertV** statt der 6-%-Näherung | Braucht Bodenrichtwerte. Die laufen je Bundesland über ein eigenes BORIS-Portal, uneinheitlich, meist ohne API. 16 Anbindungen lohnen erst, wenn sich die Näherung als zu ungenau erweist. |
| **Konfigurierbare Schwellen** (heute fest 15 / 1,3) | Gehört zur Bewertungslogik, nicht zur Bestandsführung. |
| **„Wieder da"-Meldung** bei Rückkehr in der Karenz | Die Meldehistorie verhindert Doppelmeldungen ohnehin; zusätzliche Nachrichten wären Rauschen. |
| **Retry mit Backoff** innerhalb eines Laufs | Der 3-Stunden-Cron ist das Wiederholungsintervall. |
| **Rückwirkendes Nacherfassen** übersprungener Immowelt-Objekte | Der `data_gaps`-Retrofit wirkt nur auf künftige Scans. |
| **Gebots-Schätzformel** (Verkehrswert × Annahmefaktor) für ZVG | Erfundene Zahl auf erfundener Zahl. |
| **PDF-Extraktion** der amtlichen Bekanntmachung | Die HTML-Detailseite liefert dieselben Kerninhalte als Text. |
| **Umkreis-Filterung, feste Preisobergrenze** | Nie angefordert. |
| **ImmoScout24 über bezahlten Anti-Bot-/Proxy-Dienst** | Verstößt gegen die Projektvorgabe. |
| **Automatisierte Kontaktaufnahme** mit Verkäufern | Nicht gewollt. |
| **Sitemap-Umbau für Immowelt** (8.901 Ortsseiten) | **Am 2026-09-08 hinfällig:** Blättern funktioniert, `classified-search` und `serp-bff/search` antworten mit HTTP 200. Der Befund war eine Fehldiagnose der Overlay-Blockade. |
