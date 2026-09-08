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

## A1. Immowelt-Detailerfassung liefert nichts — ERLEDIGT (2026-09-08)

**Abnahme bestanden.** Lauf `34215003141` (`782d0da`, 10:21–11:11 UTC) ist der
erste, der Immowelt aus der Ergebnisliste bewertet:

```
Immowelt-Sweep: 9329 Mehrfamilienhaus-Kandidaten.
Immowelt-Bewertung: 600 Detailseiten in diesem Lauf, RUECKSTAND 8729 ...
Immowelt: 597 von 9329 gesehenen Objekten aus der Ergebnisliste bewertet,
          3 ohne Preisangabe uebersprungen.
Meldungen: 25 von hoechstens 25 gesendet, 293 wegen des Budgets zurueckgestellt
```

Datenbank danach: `listings` für Immowelt **157 → 754**, davon **597 mit
`fundort`** (vorher 0). Damit ist auch die Sperre vor B1 weg — der Fundort
wird geschrieben.

Die Ursache stand nie im Detailparser: `/expose/` liefert von
Rechenzentrums-Adressen HTTP 403, `/suche/` HTTP 200. Die Herleitung steht in
[`UEBERGABE.md`](UEBERGABE.md). Der Verlauf darunter bleibt als Beleg stehen.

<details><summary>Verlauf der Untersuchung</summary>


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

**Stand 2026-09-08, nach Messung:**

- Das Actions-Log zeigt **alle 144** Abrufe mit derselben Parser-Meldung
  „`__UFRN_LIFECYCLE_SERVERREQUEST__` nicht gefunden — Seitenstruktur hat sich
  vermutlich geändert". Das gilt für **jeden** CI-Lauf seit dem 2026-09-07
  20:51 UTC.
- Dieselben URLs liefern **lokal HTTP 200 mit vollständigem Datenmodell**
  (drei Abrufe am 2026-09-08: Suchseite 1.147.419 Zeichen, zwei Exposés mit
  655.563 und 668.095 Zeichen). **Die Seitenstruktur ist nicht das Problem.**
- Der letzte erfolgreiche Detailabruf (2026-09-07 17:41 UTC) stammt aus einem
  **lokalen** Lauf — zwischen 03:34 und 20:51 UTC lief kein Cron. In CI ist
  die Immowelt-Detailerfassung möglicherweise **nie** gelungen.
- Das Aufwärmen greift: Im CI-Log steht `Consent-Banner bestaetigt` unmittelbar
  vor der Detailphase.
- **Behoben wurde bereits die Diagnose, nicht die Ursache:**
  `beurteileDetailAntwort` wertet jetzt den HTTP-Status aus und trennt Sperre,
  Soft-Block und echte Strukturänderung. Lauf #15 liefert damit die Antwort,
  die das Log bisher schuldig blieb.

**Nächster Schritt:** Log von Lauf #15 lesen. Steht dort `HTTP 403` oder
„Hülle statt der Seite", ist es eine Sperre der CI-IP — dann ist die Antwort
Drosselung oder ein anderer Weg, **nicht** Umgehung. Steht dort „volle Seite
ohne Datenmodell", ist der Parser dran.

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

</details>

## A2. Abgelaufenes GitHub-Token entfernen — TEILWEISE ERLEDIGT

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

**Ergebnis 2026-09-08:** `GH_TOKEN` steht **nicht** in `.env` und wird
nirgends im Code gelesen (geprüft). Es ist eine **Windows-Benutzer-Umgebungs-
variable** (93 Zeichen). Das ist Rechnerkonfiguration, kein Projektcode —
deshalb nicht ungefragt entfernt.

**Offen:** Der Nutzer widerruft das Token auf GitHub und löscht die
Umgebungsvariable (`[Environment]::SetEnvironmentVariable('GH_TOKEN', $null,
'User')`).

## A3. Einweg-Diagnoseskript entfernen — ERLEDIGT

**Warum:** `scraper/scripts/diagnose-consent.mts` hat seinen Zweck erfüllt;
sein Befund steht vollständig im Kopf von `scrapers/consent.ts`.
`diagnose-overlays.mts` bleibt — es schneidet Netzwerkverkehr mit und benennt
das blockierende Element, das wird wieder gebraucht.

- [ ] **Schritt 1:** `scraper/scripts/diagnose-consent.mts` löschen.
- [ ] **Schritt 2:** `npx tsc --noEmit` — Erwartung: sauber.
- [ ] **Schritt 3:** Commit `chore(scraper): Einweg-Diagnoseskript entfernen`.

**Ergebnis 2026-09-08:** `diagnose-consent.mts` entfernt, `tsc` sauber,
285 Tests grün. Neu hinzugekommen ist `diagnose-detail.mts` für A1.

## A4. Einen ZVG-Lauf mit `vollstaendig: false` aufklären — ERLEDIGT

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

**Ergebnis 2026-09-08:** Ein Fall von neun. Der Lauf sah **dieselben 188
Objekte** und dieselben 11 Regionen wie die erfolgreichen — die Menge war nicht
das Problem. Er stammt aus einem lokalen Lauf vor Commit `96bdba1`
(„ZVG-Nullausfall systemisch prüfen statt pro Bundesland"), also unter der
Logik, die leere Bundesländer noch als Quellenausfall wertete. Alle acht Läufe
seither sind vollständig. **Kein Handlungsbedarf.**

## A5. Immowelt-Wohnflächen gegenprüfen — ERLEDIGT

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

**Ergebnis 2026-09-08:**

| Quelle | Versionen | ohne Wohnfläche | ohne PLZ | Einheiten unsicher |
|---|---|---|---|---|
| immowelt | 77 | 11 (14 %) | 0 (0 %) | 63 (**82 %**) |
| zvg-portal | 923 | 678 (73 %) | 10 (1 %) | 504 (55 %) |

Der Parser ist in Ordnung: Die Fixture liefert `livingAreaM2: 265`. Die
fehlenden 14 % sind Seiten **ohne `livingSpace`-Faktum** — fehlende Quelldaten,
kein Parser-Fehler. Seit dem 2026-09-08 tragen sie `wohnflaeche_fehlt` und sind
damit korrekt als nicht beurteilbar markiert. **Kein Fix nötig.**

**Nebenbefund für B4:** Immowelt weist für Mehrfamilienhäuser **gar keine**
Einheitenzahl aus (auch in der Fixture `units: null`), daher die 82 %. Das ist
ein schlechteres Verhältnis als bei ZVG.

---

## A6. ZVG-Verkehrswert: der Parser liest Fließtext statt einer Zahl

**Befund (2026-09-08, Lauf `34215003141`):** Von **4** ZVG-Detailseiten wurden
**3** übersprungen. Die Meldung nennt jedes Mal, was tatsächlich in der Zelle
stand:

```
Ungültiger Verkehrswert (nicht numerisch oder nicht positiv):
  "s. obige Beschreibungen"
  "Grundbuch von Duderstadt Blatt 7803 lfd.Nr. 1: €"
  "Die Flurstücke bilden eine wirtschaftliche Einheit."
```

Der zweite Fall ist der aufschlussreiche: Dort steht ein `€` **hinter** einer
Grundbuchangabe. Das ist kein fehlender Wert, sondern die falsche Zelle — der
Parser greift offenbar auf die Zeile daneben, wenn die Verkehrswertzeile
mehrspaltig oder mit Fußnote gesetzt ist.

**Warum das zählt:** Ohne Verkehrswert kein Vergleichsmaßstab. Die Stichprobe
ist mit 4 Seiten klein — deshalb ist **Schritt 1 messen, nicht reparieren**.

**Dateien:** `scraper/scrapers/zvg-portal/detail.ts` (`parseZvgDetailPage`,
die Prüfung liegt bei Zeile 296).

- [ ] **Schritt 1:** In `listing_versions` zählen, wie viele ZVG-Objekte
      überhaupt einen Verkehrswert tragen und wie viele nicht. Erst diese Quote
      sagt, ob es drei Einzelfälle oder ein Muster sind.
- [ ] **Schritt 2:** Die drei genannten Gutachten über
      `gh workflow run pruefung.yml -f skript=diagnose-detail` holen und die
      Verkehrswertzeile im Rohtext ansehen.
- [ ] **Schritt 3:** Erst nach benannter Ursache ein Fixture mit genau dieser
      Zeilenform anlegen, den Test scheitern sehen, dann beheben.

**Abnahme:** Die drei Gutachten liefern einen Verkehrswert oder es ist belegt,
dass die Seite selbst keinen nennt.

## A7. Das Bewertungsfenster wandert 3 Kandidaten je Lauf — bei 600 Breite

**Gemessen am 2026-09-08 aus Lauf `34215003141`.** Der erste Verdacht
(„Nordrhein-Westfalen frisst das Budget") war die Oberflaeche. Darunter liegen
zwei getrennte Befunde.

### A7a — Die Budgetrechnung unterstellt 5 s je Seite, gemessen sind 9 bis 11,5

Zeit je Ergebnisseite, aus den Regionszeiten desselben Laufs:

```
be    10 Seiten     87s    8,73 s/Seite
mv    16 Seiten    144s    9,00 s/Seite
hh    11 Seiten     98s    8,91 s/Seite
hb     5 Seiten     47s    9,50 s/Seite
th    22 Seiten    238s   10,81 s/Seite
nw   173 Seiten   1990s   11,50 s/Seite
```

`IMMOWELT_VERZOEGERUNG_MS` ist 5 s. Der gemessene Boden liegt bei ~8,8 s —
also **~3,8 s echte Ladezeit** je Seite zusaetzlich zur Drossel. `nw` liegt
noch einmal ~2,7 s darueber, vermutlich weil das Blaettern tief in einer
173-Seiten-Liste teurer wird (nicht gemessen, nur Vermutung).

Damit ist die Rechnung im Kommentar ueber `SWEEP_BUDGET_MS` um mehr als das
Doppelte zu optimistisch: „~885 Seiten bundesweit -> ~74 min -> ~6 Laeufe"
rechnet nur die Drossel. Real sind es ~10 s je Seite.

**Die Drossel ist NICHT der Hebel.** Sie ist die Hoeflichkeitsgrenze gegenueber
Immowelt, und ein CAPTCHA misst genau die Abrufrate. Wer hier kuerzt, kauft
Tempo mit dem Risiko, das der Rest des Projekts teuer vermeidet.

Dass `nw` das Budget um das Dreifache ueberzieht, ist dagegen **so gewollt**:
die Budget-Wache steht vor dem Start einer Region, und eine begonnene Region
wird immer zu Ende geblaettert — „ein halb erfasstes Bundesland waere eine
Luege ueber die Abdeckung". Das ist kein Fehler, sondern der bezahlte Preis.

### A7b — Das Bewertungsfenster bewegt sich praktisch nicht

`budgetiereDetailKandidaten` waehlt ueber `rotiereAuswahl` ein
**zusammenhaengendes** Fenster von `MAX_BEWERTUNGEN_IMMOWELT` = 600 Eintraegen.
Der Startpunkt ist `Math.floor(Date.now() / 3_600_000)` — Stunden seit Epoche.

Das Fenster ist 600 breit und wandert **1 Eintrag je Stunde**. Beim
Drei-Stunden-Cron heisst das: **3 von 600** Eintraegen sind im Folgelauf neu,
597 dieselben. Die Zeile

```
RUECKSTAND 8729 auf spaetere Laeufe zurueckgestellt
```

behauptet damit etwas, das nicht eintritt. Genau die Sorte Meldung, vor der
`UEBERGABE.md` warnt: sie nennt eine Ursache, statt zu messen.

**Rechnerisch belegt, nicht vermutet.** Fuer den Lauf um 11:05 UTC ergibt
`versatz % 9329` den Fensterstart **2470**, also 41 Objekte aus `hb`
(Band 2309–2510) und 559 aus `nw` (ab 2511). Gemeldet wurden **37 aus `hb` und
560 aus `nw`** — die Differenz sind die 3 Objekte ohne Preis und 5 doppelte
IDs. Die Vorhersage trifft.

**Zwei Dinge daempfen den Schaden**, beide gehoeren vor eine Reparatur geprueft:

1. Die Kandidatenliste ist **kein Bestand**, sondern wird je Lauf aus dem
   Sweep dieses Laufs gebaut. Sie ist also ohnehin jedes Mal eine andere.
2. Die Regionsrotation im Sweep benutzt **denselben** Versatz
   (`versatz % 16`) und verschiebt sich um 3 Regionen je Lauf. Beide Rotationen
   laufen im Gleichtakt — ob die Ueberlagerung am Ende doch alle Regionen
   erreicht oder ein systematisches Loch erzeugt, ist **nicht gemessen**.

**Dateien:** `scraper/main.ts` (`budgetiereDetailKandidaten`, `detailVersatz`),
`scraper/lib/bestand.ts` (`rotiereAuswahl`), `scraper/scrapers/immowelt/index.ts`
(`SWEEP_BUDGET_MS`, Regionsrotation).

- [ ] **Schritt 1 — messen, ob wirklich ein Loch entsteht.** Ueber mehrere
      Versatzwerte simulieren, welche Regionen ueber 8 aufeinanderfolgende
      Laeufe je bewertet wuerden. Reine Rechnung, kein Abruf, gehoert in einen
      Test.
- [ ] **Schritt 2 — erst dann den Entwurf.** Naheliegend waere, das Fenster um
      seine eigene Breite je Lauf weiterzuschieben statt um 1 je Stunde, oder
      die Auswahl ueber die Regionen zu streuen statt zusammenhaengend zu
      schneiden. Beides aendert das Meldeverhalten und braucht erst einen Test,
      der das heutige Verhalten festhaelt.
- [ ] **Schritt 3 — die RUECKSTAND-Meldung ehrlich machen.** Sie darf nicht
      „auf spaetere Laeufe zurueckgestellt" behaupten, solange das nicht
      gemessen ist.

**Abnahme:** Ein Test zeigt ueber mehrere Laeufe hinweg, welcher Anteil der
gesehenen Objekte je bewertet wird, und die Log-Zeile sagt nichts, was dieser
Test nicht deckt.

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
