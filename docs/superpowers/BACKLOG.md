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

## A2. Abgelaufenes GitHub-Token entfernen — ERLEDIGT (2026-09-08)

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

**Abgeschlossen am 2026-09-08 durch Entscheidung des Nutzers:** Das Token
wird **nicht** widerrufen. Der Punkt ist damit erledigt und **nicht wieder
aufzubringen** — weder hier, noch in der Übergabe, noch als Rückfrage. Das
Projekt ist davon nicht betroffen: Kein Workflow und keine Codestelle liest
einen PAT (`scrape.yml` benutzt ausschließlich die Supabase- und
Telegram-Secrets), und git arbeitet über ein OAuth-Token des Git Credential
Managers, nicht über einen PAT.

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

## A6. ZVG-Verkehrswert: die Quelle nennt in 3 von 194 Fällen keine Zahl

**Gemessen am 2026-09-08 (Schritt 1). Der Verdacht „falsche Zelle" ist
widerlegt.** Der Parser greift die richtige Zelle; in diesen drei Bekannt-
machungen steht dort schlicht kein Betrag. A6 ist damit kein Parserfehler,
sondern eine Eigenschaft der Quelle.

### Die Quote im Bestand

`listing_versions` kann die Lücke nicht zeigen: `price_cents` ist dort nie
`NULL` (0 von 2.864 Zeilen), weil `parseZvgDetailPage` wirft, *bevor*
geschrieben wird — ein Objekt ohne Verkehrswert kommt gar nicht erst in die
Tabelle. Gemessen wurde deshalb gegen den Sweep und die Actions-Logs:

```
ZVG-Termine im Sweep (Lauf 34230052647, 2026-09-08 13:07 UTC)   194
davon mit Verkehrswert erfasst                                  191   98,5 %
davon dauerhaft ohne Verkehrswert                                 3    1,5 %
```

Über **acht** aufeinanderfolgende Läufe (34160967277 bis 34230052647,
2026-09-07 20:51 bis 2026-09-08 13:07 UTC) scheitern **immer exakt dieselben
drei IDs**: `zvg_id=49119&land_abk=by`, `zvg_id=13233&land_abk=ni`,
`zvg_id=167869&land_abk=nw`. Sie bilden einen stehenden Rückstand — jeder Lauf
holt sie erneut und verwirft sie erneut.

Die „3 von 4" aus dem ursprünglichen Befund waren also nicht die Quote,
sondern nur der Ausschnitt: der Lauf hatte an dem Tag bloß 4 offene
Detailkandidaten, und 3 davon sind die immer gleichen Dauerfälle.

### Was in der Zelle wirklich steht

Für `zvg_id=13233` liegt der Rohtext in der Datenbank vor (die Seite wurde am
2026-09-07 03:40 UTC noch von der *alten* Parserfassung angenommen). Er
belegt, dass die Zuordnung Label → Wert stimmt:

```
Grundbuch:          Duderstadt Blatt 7803
Objekt/Lage:        Mehrfamilienhaus: August-Werner-Allee, 37115 Duderstadt
Beschreibung:       Wohnung im Obergeschoss mit Kellerraum, Baujahr 2017/2018
Verkehrswert in €:  Grundbuch von Duderstadt Blatt 7803 lfd.Nr. 1: €
Termin:             Mittwoch, 23. September 2026, 11:30 Uhr
```

Alle Nachbarfelder sitzen richtig; nur im Verkehrswertfeld fehlt der Betrag.
Dass es ein Versäumnis des Gerichts ist und kein Spaltenversatz, zeigen die
Schwesterbekanntmachungen desselben Amtsgerichts, die dieselbe Schablone
ausgefüllt haben:

```
Blatt 7796 lfd.Nr. 1: 130.000 €      (zvg_id=13232)
Blatt 4248 lfd.Nr. 1: 52.000,00 €    (zvg_id=13234)
Blatt 7803 lfd.Nr. 1: €              (zvg_id=13233)  <- Betrag ausgelassen
```

Für `zvg_id=49119` („s. obige Beschreibungen") und `zvg_id=167869` („Die
Flurstücke bilden eine wirtschaftliche Einheit.") liegt **kein Rohtext vor** —
sie wurden nie erfolgreich erfasst. Beide Texte verweisen dem Wortlaut nach
auf eine andere Stelle des Gutachtens; belegt ist das nicht, nur konsistent
mit dem gemessenen Fall.

### Ein Phantomwert im Bestand

Der DB-Eintrag zu `zvg_id=13233` trägt **78.031 €**. Diese Zahl steht auf
keiner Seite: die alte Fassung von `parseGermanNumber` hat die Ziffern aus
„Blatt **7803** lfd.Nr. **1**" zusammengeklebt. `fe5749a` (2026-09-07 05:37
UTC) hat das behoben — seither scheitert die Seite ehrlich, statt still zu
lügen. Der falsche Wert aus dem Lauf davor steht aber noch da und wird nie
überschrieben, weil das Objekt nie wieder erfasst wird.

Nachgerechnet über alle 193 gespeicherten ZVG-Objekte: der heutige Parser
liefert in **192** Fällen exakt den gespeicherten Wert. Der eine Abweichler
ist genau dieser Phantomwert.

### Nebenbefund: die Verkehrswertzelle ist oft mehrteilig — und das trägt

```
Objekte mit Verkehrswert im Bestand                    193
davon reine Zahl in der Zelle                          147
davon mit Begleittext (Grundbuch, lfd.Nr., Hinweise)    46
davon mehrzeilige Zellen (mehrere Absätze)              17
davon mit mehr als einem Euro-Betrag in der Zelle       14
```

Die Max-über-alle-Beträge-Regel in `parseVerkehrswert` hält: **6** dieser
Zellen weisen ausdrücklich einen `Gesamtverkehrswert` aus, und in **5** davon
steht genau dieser Wert in der Datenbank. Die Währungspflicht schützt
zuverlässig vor Kassenzeichen und IBAN — 7 Felder enthalten elfstellige
Zahlen, keine davon wurde als Preis gelesen.

Die eine Ausnahme ist ein **eigener, kleiner Parserfehler** —
`zvg_id=4198&land_abk=rp`:

```
Verkehrswert Flur 25 Nr. 24/1: 122.000,00 €
Verkehrswert Flur 25 Nr. 295:  160.000,00 €
Gesamtverkehrswert:            282.000,-- €     <- nicht erkannt
```

`BETRAG_PATTERN` kennt `,-`, aber nicht `,--`. Gespeichert sind **160.000 €**
statt 282.000 € — 43 % zu niedrig. Nicht Teil von A6, aber derselbe
Zeilenbereich; gehört in einen eigenen Punkt mit eigenem Fixture.

**Dateien:** `scraper/scrapers/zvg-portal/detail.ts` (`parseZvgDetailPage`,
Prüfung bei Zeile 296; `BETRAG_PATTERN` bei Zeile 123).

- [x] **Schritt 1 — erledigt:** 3 von 194 (1,5 %), stehender Rückstand aus
      immer denselben drei IDs. Kein Muster, das den Parser verdächtigt.
- [~] **Schritt 2 — nur teilweise möglich:** Für `zvg_id=13233` ersetzte der
      Rohtext aus `listing_versions.raw_notice_text` den Live-Abruf. Die
      beiden anderen bleiben ungemessen: `scripts/diagnose-detail.mts` ist
      fest auf zwei Immowelt-`/expose/`-URLs verdrahtet und nimmt keine
      URL an, und `pruefung.yml` kennt nur die Eingaben `skript`, `region`
      und `max_seiten` — es gibt keinen Weg, eine ZVG-URL hineinzureichen,
      ohne das Skript umzubauen.
- [~] **Schritt 3 — Teil 1 und 2 erledigt, Teil 3 offen.** Zu reparieren ist
      nicht das Lesen, sondern der Umgang mit dem Fehlen.
      1. **ERLEDIGT (`db0a22e`, A-4 Aufgabe 2).** Ein Objekt ohne Verkehrswert
         wird jetzt wie `wohnflaeche_fehlt` behandelt: `ordneDetailErgebnisEin`
         in `scrapers/zvg-portal/index.ts` liefert `{ art: "ohne-verkehrswert" }`,
         und `main.ts` schreibt dafür per `upsertListingOhneBewertung` eine
         `listings`-Zeile ohne `listing_versions`-Zeile — keine Schemaänderung
         an `price_cents` nötig, das Gegenstück zum Immowelt-Fall vom
         2026-09-11. Die Zeile unterliegt derselben Abgangs- und Löschwache wie
         jede andere ZVG-Zeile (Fundort fällt auf `partitionAusExternalId`
         zurück). Produktionsbeleg, dass die Zeilen in einem echten Lauf
         entstehen, steht noch aus (siehe ABNAHME-BASIS A-4).
      2. **ERLEDIGT (`ea68fbf`).** `VerkehrswertFehltError` trennt „die Quelle
         nennt keinen Wert" von einer echten Störung;
         `beschreibeDetailFehler` entscheidet daraus Text und Schwere und
         steht unter Test. Vorher standen in **jedem** Lauf dreimal
         `Fehler, übersprungen` samt Stapelabzug im Log — Rauschen, das echte
         Störungen verdeckt.
      3. **OFFEN — der Phantomwert 78.031 €** zu `zvg_id=13233` steht
         weiterhin im Bestand und wird nie überschrieben, weil das Objekt nie
         wieder erfasst wird. Er gehört gelöscht, aber die `bestand.ts`-Regel
         gilt: wer nicht urteilen kann, löscht nicht. Ein Schreibzugriff auf
         Produktionsdaten ist eine Entscheidung des Nutzers.

**Abnahme:** erfüllt für Schritt 1. Die geforderte Alternative ist eingetreten:
*„es ist belegt, dass die Seite selbst keinen nennt"* — belegt für einen der
drei Fälle, plausibel für die anderen beiden.

## A7. Das Bewertungsfenster wandert 3 Kandidaten je Lauf — A7b ERLEDIGT

**Gemessen am 2026-09-08 aus Lauf `34215003141`.** Der erste Verdacht
(„Nordrhein-Westfalen frisst das Budget") war die Oberflaeche. Darunter liegen
zwei getrennte Befunde.

### A7a — Die Budgetrechnung unterstellt 5 s je Seite, gemessen sind 9 bis 11,5 — ERLEDIGT

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

**Erledigt: die Rechnung ist korrigiert, der Wert nicht.** Das Budget zu
senken haette nichts gebracht — der beherrschende Term ist die eine grosse
Region, die nach der Wache noch startet, nicht das Budget selbst. Gemessen
gegen `timeout-minutes: 75`:

```
laengster echter Lauf   50,1 min   (34215003141)
schlimmster Fall        12 min Budget + 33 min nw + Ruestzeit ~ 60 min
```

Die Marge haelt. **Sie ist aber nicht fuer alle Regionen gemessen:** `by` und
`bw` wurden bisher nie gesweept. Sind sie groesser als `nw`, schrumpft sie.
Wer das Budget anfasst, misst zuerst diese beiden. Steht so auch im Kommentar
an `SWEEP_BUDGET_MS`, wo die falsche Rechnung stand.

Dass `nw` das Budget um das Dreifache ueberzieht, ist dagegen **so gewollt**:
die Budget-Wache steht vor dem Start einer Region, und eine begonnene Region
wird immer zu Ende geblaettert — „ein halb erfasstes Bundesland waere eine
Luege ueber die Abdeckung". Das ist kein Fehler, sondern der bezahlte Preis.

### A7b — Das Bewertungsfenster bewegt sich praktisch nicht — ERLEDIGT

`budgetiereDetailKandidaten` waehlt ueber `rotiereAuswahl` ein
**zusammenhaengendes** Fenster von `MAX_BEWERTUNGEN_IMMOWELT` = 600 Eintraegen.
Der Startpunkt ist `Math.floor(Date.now() / 3_600_000)` — Stunden seit Epoche.

Das Fenster ist 600 breit und wandert **1 Eintrag je Stunde**. Beim
Drei-Stunden-Cron heisst das: **3 von 600** Eintraegen sind im Folgelauf neu,
597 dieselben. (Gemessen laeuft der Cron nur alle ~5 h — siehe A10; das macht
den Schritt 5 statt 3 und aendert nichts an der Aussage.) Die Zeile

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

**Schritt 1 gemessen.** Das Loch entsteht, und es ist groesser als gedacht.
Ohne Zeitmodell, nur Arithmetik: `nw` laeuft als erste Region, wenn
`versatz % 16 == 0`, also alle 48 h; der Versatz waechst dann um 48, das
Fenster ist 600 breit. Ueberlappung 92 %, Anteil je Lauf 8,7 %,
**6895/48 = 144 nw-Laeufe = 287 Tage** fuer einen Durchlauf.

**Schritt 2 und 3 umgesetzt** (`f80e5b5`, `c675822`). `streueAuswahl` in
`lib/bestand.ts` waehlt jeden `n/budget`-ten Eintrag ueber die ganze Liste.
Der Abstand ist ein BRUCH, nicht `floor` — ein fester Abstand deckte nur
`budget * floor(n/budget)` Positionen ab und liess den Rest als ein
zusammenhaengendes Loch (Hamburg fiel dadurch von ~28 auf 7 Plaetze). Gemessen
am echten Band vom 2026-09-08:

```
Region   Auswahl   anteilig        Region   Auswahl   anteilig
nw          439      438,6         hh           28       27,8
th           55       55,2         be           25       25,6
mv           40       39,8         hb           13       13,0
```

`rotiereAuswahl` bleibt unveraendert — der Sweep rotiert damit die 16
Bundeslaender, und dort IST die zusammenhaengende Reihenfolge der Zweck.

Die Log-Zeile ist ehrlich gemacht: Auswahl und Meldung sitzen jetzt gemeinsam
in `budgetiereKandidaten` (`lib/bestand.ts`), wo sie unter Test stehen. In
`main.ts` war beides nie testbar.

**Noch nicht in Produktion bestaetigt.** Der naechste Cron-Lauf muss zeigen,
dass die Bewertung ueber mehrere Regionen streut statt fast nur `nw` und `hb`
zu treffen.

---

## A8. ZVG-Verkehrswert mit doppeltem Strich — ERLEDIGT (2026-09-08)

Gefunden beim Messen von A6, nicht gesucht. `BETRAG_PATTERN` kannte `,-`, aber
nicht `,--`. Bei `zvg_id=4198` (rp) tragen die Teilwerte `,00` und nur die
Gesamtsumme `,--`:

```
Verkehrswert Flur 25 Nr. 24/1: 122.000,00 €
Verkehrswert Flur 25 Nr. 295:  160.000,00 €
Gesamtverkehrswert:            282.000,-- €   <- fiel aus dem Muster
```

Die Max-Regel waehlte deshalb einen Teilwert: gespeichert **160.000 statt
282.000 €**, 43 % zu niedrig. Behoben in `5bc6d13`, Test zuerst.

Der Bestand korrigiert sich selbst — `DETAIL_MAX_ALTER_TAGE` laesst das Objekt
binnen 7 Tagen neu erfassen. Belegt: Dieselbe Mechanik hat am 2026-09-07 alle
23 Objekte des frueheren Ziffernklebe-Fehlers korrigiert (Werte bis
25.375.912.190.000 €); kein einziger absurder Wert ist heute noch aktuell.

## A9. Falsche Top-Treffer durch fehlende Untergrenze — ERLEDIGT (2026-09-08)

**Er hat den Nutzer erreicht.** 19 der 186 gemeldeten Objekte tragen einen
Wert unter 25.000 €. Zwei davon wurden am 2026-09-07 gemeldet:

```
listing 2f41102f   2.840 € / 198,8 m²   Faktor 0,175   Bruttorendite 571 %
listing ac2165d8   6.200 € / 195   m²   Faktor 0,279   Bruttorendite 359 %
```

Die Rechnung war fehlerfrei. Die Preise kamen aus dem alten
Immowelt-Detailparser und waren falsch — und `topTreffer` prueft den
Kaufpreisfaktor nur nach OBEN (`<= 15`). **Je kaputter die Zahl, desto besser
sah das Objekt aus.**

**Richtigstellung (2026-09-08, nachgemessen):** Beide gingen als
`pruefkandidat` raus, **nicht** als `top_treffer` — `bestimmeMeldeklasse`
stuft geschätzte Mieten ohnehin herunter (`lib/meldung.ts`). Das Feld
`topTreffer` in den Kennzahlen ist die Schwellenprüfung, nicht die
Meldeklasse; die erste Fassung dieses Eintrags hat beides verwechselt. Der
Nutzer bekam also zwei falsche Nachrichten, aber nicht in der höchsten Stufe.
Seit dem 2026-09-07 um 05:43 ist überhaupt kein `top_treffer` mehr versandt
worden — alle 42 Treffer des Laufs vom 18:29 beruhen auf geschätzter Miete,
und im ganzen Bestand tragen nur zwei Objekte eine belegte.

Behoben in `64de963`: `MIN_PLAUSIBLER_KAUFPREISFAKTOR = 3`, bewusst weit unter
jedem Marktniveau — selbst stark sanierungsbeduerftige Mehrfamilienhaeuser
wechseln nicht unter dem Sechs- bis Achtfachen der Jahreskaltmiete den
Besitzer. Die Schwelle erkennt kaputte Eingaben, sie urteilt nicht ueber die
Guete eines Angebots. Dazu die Luecke `preis_miete_unvereinbar`, damit ein
stilles `topTreffer = false` nicht verbirgt, dass die Zahlen nicht
zusammenpassen.

**Der Lückenname hiess zuerst `kaufpreis_unplausibel` und war damit eine
Behauptung, die die Messung nicht deckt.** In Produktion traf die Wache zwei
Objekte in Baden-Württemberg (124.000 € auf 300 m², 595.000 € auf 2.062 m²).
Beide tragen `miete_nur_bundeslandgenau` — ihre Miete kommt aus einer
Handtabelle über ein ganzes Bundesland. Der Preis kann stimmen und die
Schätzung daneben liegen; welche Seite falsch ist, lässt sich hier nicht
entscheiden. Umbenannt in `preis_miete_unvereinbar`.

**Bewusst NICHT gemacht:** `rent_estimate_unreliable` zu einer Sperre machen.
Die Lücke gibt es schon (Rendite über 20 % bei geschätzter Miete) und sie war
bei beiden Objekten gesetzt — sie hat nur keine Wirkung. Gemessen träfe eine
Sperre 2 von 42 Treffern. Da die Meldeklasse solcher Objekte ohnehin nur
`pruefkandidat` ist — also „sieh dir das an" —, ist das Versenden vertretbar.
Die Entscheidung gehört in den Dashboard-Entwurf (B2), nicht in eine
Aufräumarbeit.

**Offen daran:** Die beiden gemeldeten Objekte tragen den falschen Preis
weiterhin im Bestand. Sie werden erst korrigiert, wenn die Listenbewertung sie
erneut trifft. Ob eine bereits versandte Falschmeldung richtiggestellt gehoert,
ist eine Entscheidung des Nutzers.

---

## A10. Der Cron laeuft nicht alle drei Stunden — 43 % der Termine fallen aus

**Gemessen am 2026-09-08 ueber alle 13 geplanten Laeufe** (`gh run list
--workflow=scrape.yml`, Ausloeser `schedule`, 2026-09-05 bis 2026-09-08):

```
23 Soll-Termine (cron "0 */3 * * *")
13 gelaufen, 10 AUSGEFALLEN  -> 43 % Ausfall
Verspaetung der gelaufenen: 8 bis 171 min, Median rund 100 min

09-07 06:00  AUSGEFALLEN
09-07 09:00  AUSGEFALLEN     <- fuenf Termine hintereinander,
09-07 12:00  AUSGEFALLEN        neun Stunden ohne Lauf
09-07 15:00  AUSGEFALLEN
09-07 18:00  gelaufen +171 min
```

Das ist **kein Fehler dieses Projekts**. GitHub fuehrt geplante Laeufe
ausdruecklich nur nach bestem Bemuehen aus und laesst sie unter Last aus. Aber
es widerlegt eine Annahme, die an mehreren Stellen mitgerechnet wurde: „Cron
alle drei Stunden". Tatsaechlich ist es **ein Lauf je rund fuenf Stunden**.

**Was daran haengt:**

- **B1** verlangt drei vollstaendige Laeufe **je Region**. Bei 16 Regionen,
  einer Regionsrotation, die je Lauf um `versatz % 16` weiterwandert, und nur
  einem Lauf je 5 h dauert das ein Vielfaches der bisher angenommenen Zeit.
- Die Abdeckungsrechnung in A7b ging von 3 h aus. Mit 5 h wandert der Versatz
  je Lauf um 5 statt 3 — `ggT(5,16) = 1`, alle Startpunkte werden also weiter
  erreicht, aber langsamer.

**Gut daran:** Die Rotation haengt an der Uhr
(`Math.floor(Date.now() / 3_600_000)`), nicht an einem Zaehler. Ein
ausgefallener Lauf ueberspringt einen Versatz, er wiederholt keinen — die
Abdeckung bleibt also gleichmaessig, sie ist nur langsamer.

**Nicht entschieden, weil es eine Abwaegung ist:** Ein haeufigerer Cron (etwa
stuendlich) faengt Ausfaelle auf, ohne die Abrufrate je Seite zu erhoehen --
die Drossel bleibt bei 5 s. Er erhoeht aber die Tagesmenge an Abrufen bei
Immowelt, und genau die misst ein CAPTCHA. Das gehoert dem Nutzer.

**Nachtrag 2026-09-08, der die Entscheidung entschaerft:** Die Rechnung in
[`specs/2026-09-08-immowelt-abgaenge-optionen.md`](specs/2026-09-08-immowelt-abgaenge-optionen.md)
zeigt, dass eine **Fortsetzungsrotation** (Startindex aus `sweep_region_runs`
fortschreiben statt aus der Uhr) bei drei Stunden fast so schnell abdeckt wie
ein Stunden-Cron heute — 5,7 gegen 4,2 Tage, **ohne einen einzigen
zusaetzlichen Abruf**. Ein dichterer Cron waere damit nur noch ein Mittel
gegen die 43 % ausgefallenen Termine, nicht gegen die Abdeckung.

- [ ] **Schritt 1:** Entscheiden, ob der Cron dichter getaktet wird.
- [ ] **Schritt 2:** Falls ja, danach messen, ob die Ausfallquote sinkt und ob
      Immowelt haerter drosselt.

**Abnahme:** Die Annahme „alle drei Stunden" steht nirgends mehr unwidersprochen
im Repo.

---

## A11. Die Mietschätzung hat keine Quelle im Repo — und verschiebt jede siebte Meldeklasse

**Untersucht am 2026-09-08** für C-1 und C-2. Die Tabelle ist **besser als ihr
Ruf und schlechter dokumentiert als jede andere Zahl im Projekt.**

**Herkunft.** Im ganzen Repo steht **eine** Quellenangabe zur Miete
(`lib/rentEstimate.ts:26`, ImmoScout24-Wohnpreisatlas, 9,23 €/m²) — und die
gilt fuer den unwichtigsten Wert, benutzt von 5 von 2.108 Versionen. Die 95
handrecherchierten PLZ-Werte (`:37–57`) kamen als geschlossener Block in
`590e5fe` und tragen **keine Quelle und kein Datum**. Die Bundeslandstufe ist
keine eigene Recherche: Sie mittelt die vorhandenen PLZ-Werte des Landes
(`:117–132`) — und traegt **83 % des Bestands** (1.758 von 2.108).

**Belastbarkeit — geprueft gegen Zensus 2022** (Destatis-Regionaltabelle,
12.439 Gebietszeilen, amtlich und frei). Der Zensus misst Bestandsmieten, der
Code schaetzt Angebotsmieten; ueberbrueckt ueber den BBSR-Abstand 2025
(11,11 gegen 7,76 €/m², rund 43 %), kalibriert auf den Bundeswert.

> **n = 23 PLZ-Zweisteller · Mittel −8,5 % · Median −11,4 % · Spanne −23,7 %
> bis +23,9 % · 17 von 23 innerhalb ±15 %.**

Haerteste Gegenprobe ohne Umrechnung, gegen drei direkt veroeffentlichte
BBSR-Angebotsmieten 2025: Muenchen −2,4 %, Frankfurt −0,8 %, Stuttgart −6,4 %.
**Die Tabelle ist nicht geraten.** Sie trifft Niveau und Gefaelle und liegt
systematisch leicht zu niedrig — erwartbar, weil ein PLZ-Zweisteller mehr
umfasst als seine Kernstadt (die „44" ist Dortmund *und* Bochum *und* Herne).

**Der schwaechste Punkt ist nicht die Tabelle, sondern die Bundeslandstufe** —
nicht wegen ihres Mittelwerts (Median −2,8 %, 13 von 16 innerhalb ±15 %),
sondern wegen der Spanne, die sie einebnet:

```
Nordrhein-Westfalen   6,50 bis 16,50 €/m²   -37,1 % bis +59,7 %
Bayern                8,00 bis 20,50 €/m²   -34,8 % bis +67,1 %
```

**7 von 16 Bundeslaendern verlassen intern das ±30-%-Band, und dort liegen
1.202 von 1.879 bewerteten Objekten — 64 %.** Die ±30-%-Rechnung unten ist
damit keine Hypothese, sondern die gemessene Unschaerfe des Regelwegs.

**Hebelwirkung.** Alle 1.879 bewertbaren Objekte mit den **echten** Funktionen
nachgerechnet (`berechneKennzahlen`, `ermittleJahreskaltmiete`,
`bewerteEinheiten`, `bestimmeMeldeklasse`), Miete × 0,7 / × 1,0 / × 1,3. Der
nachgerechnete Kaufpreisfaktor stimmt bei **1.879 von 1.879** mit dem
gespeicherten `metrics.kaufpreisfaktor` ueberein — die Simulation rechnet
nachweislich dasselbe wie die Pipeline.

| Schwelle | −30 % | heute | +30 % |
|---|---:|---:|---:|
| `kaufpreisfaktor <= 15` | 602 (32,0 %) | 910 (48,4 %) | 1.218 (64,8 %) |
| `geschaetzterDscr >= 1,3` | 261 (13,9 %) | 502 (26,7 %) | 735 (39,1 %) |
| `topTreffer` (alle vier) | 205 (10,9 %) | 409 (21,8 %) | 595 (31,7 %) |

> **Meldeklasse wechselt: 278 Objekte (14,8 %) bei −30 %, 280 (14,9 %) bei
> +30 %, 558 (29,7 %) irgendwo im Band.**

`top_treffer` bleibt in allen drei Szenarien **0** — nur drei Objekte tragen
eine belegte Miete, keines passiert die Schwellen. **Eine falsche Schaetzung
kann nie einen `top_treffer` erzeugen**, sie erzeugt oder verhindert
ausschliesslich `pruefkandidat`. Der Hebel sitzt fast vollstaendig auf der
Bundeslandstufe (1.699 der 1.879 Objekte, 237 bzw. 241 der Wechsel).

**Warum das nicht akademisch ist:** Heute erfuellen 409 Objekte die Schwellen,
das Meldebudget liegt bei 25 je Lauf und war zuletzt ausgeschoepft (D-5). Der
Rueckstand betraegt rund 250 Meldungen — ein Mietfehler von ±30 % verschiebt
ihn um **±200 Objekte**. Er entscheidet also nicht nur, *ob* gemeldet wird,
sondern ueber Wochen, *was zuerst*.

**Nebenbefund in die Gegenrichtung:** Bei +30 % verlieren einzelne Objekte die
Meldeklasse, weil ihr Faktor unter `MIN_PLAUSIBLER_KAUFPREISFAKTOR = 3`
rutscht. Die A9-Untergrenze wirkt genau wie beabsichtigt.

- [x] **Schritt 1 (Doku, kein Verhalten):** Ueber `REGIONALE_MIETE_PRO_M2` einen
      Kommentarblock setzen: handrecherchiert, ohne benannte Quelle
      (`590e5fe`), geprueft am 2026-09-08 gegen Zensus 2022/BBSR mit n = 23,
      Median −11,4 %, 17/23 innerhalb ±15 %. Dieselbe Angabe fuer die
      Bundeslandstufe samt interner Spanne.
- [x] **Schritt 2:** `BUNDESWEITER_MIETPREIS_PRO_M2_MONAT` von 9,23 auf den
      belegten BBSR-Wert **11,11 €/m² (2025)** heben — der alte Wert ist
      −16,9 % zu niedrig. Betrifft 5 Objekte, gehoert trotzdem gemessen.
      **Erledigt.** Der Fehler ging gegen den Nutzer: zu niedrige Miete heiszt
      zu schlechter Kaufpreisfaktor, ein lohnendes Objekt fiele unter die
      Meldeschwelle.
- [ ] **Schritt 3 (B3):** INKAR-Indikator **2113 „Angebotsmietpreise"**
      (BBSR, Kreisebene, 2010–2024, gleiche Bezugsgroesse wie der Code) als
      CSV exportieren und als Pruefdatei ins Repo legen. Danach ein Test, der
      jeden der 95 Werte gegen seinen Referenzkreis haelt und bei mehr als
      ±25 % fehlschlaegt. **Die Zuordnung PLZ-Zweisteller → Referenzkreis muss
      von Hand entstehen und im Repo stehen** — sie ist die eigentliche
      Arbeit, nicht der Test.
- [ ] **Schritt 4 — Entscheidung des Nutzers:** Darf eine bundeslandgenaue
      Schaetzung ueberhaupt eine Meldung ausloesen? Diese Objekte stellen 339
      der 409 Meldekandidaten, und ihre Unschaerfe umfasst in NRW und Bayern
      das gesamte ±30-%-Band. Alternative: speichern und im Dashboard zeigen,
      aber nicht per Telegram melden.

**Ehrliche Fehlanzeige:** Eine frei *automatisiert* abrufbare Tabelle mit
Angebotsmieten je Kreis gibt es nicht. Der Deutschlandatlas antwortet
Nicht-Browser-Clients mit HTTP 400, die undokumentierte INKAR-API lieferte
leere Antworten. Der Export aus Schritt 3 ist Handarbeit — einmalig.

**Abnahme:** C-1 gilt als erfuellt, wenn im Repo an der Tabelle steht, gegen
welche Quelle sie geprueft wurde, mit welchem Ergebnis und zu welchem Stand,
und wenn der Test aus Schritt 3 gruen laeuft **und bei einer kuenstlich um
30 % verschobenen Tabelle rot wird**. C-2 ist mit diesem Eintrag erfuellt.

---

## A12. Telegram-Zustellung: richtig, aber nicht belegt und nicht getestet

**Untersucht am 2026-09-08** für Abnahmekriterium D-1. Der Verdacht war, die
Tabelle `notifications` zähle Versandversuche statt Zustellungen. **Er ist
widerlegt** — das Verhalten ist korrekt, nur unbewiesen und ungeschützt.

**Was gemessen wurde:**

- Die Reihenfolge stimmt an allen drei Aufrufstellen: erst senden, dann
  protokollieren (`lib/pipeline.ts:376` → `:394`, `:410` → `:414`,
  `main.ts:266` → `:277`). Das `try/catch` in `pipeline.ts:385` umschliesst
  **nur** `sendeMedien`; `sendTelegramMessage` wirft ungebremst durch.
- Der HTTP-Status wird ausgewertet (`lib/telegram.ts:434`): 200 → still
  weiter, 429 → bis zu zwei Wiederholungen mit `Retry-After` (auf 30 s
  gedeckelt), alles andere → `throw` mit Status und Rumpf. Der Wurf landet in
  `main.ts:169` als `console.error`, die Zeile entsteht nicht, und
  `hoechsteGemeldeteKlasse` sieht das Objekt weiter als nie gemeldet.
- Der Antwortrumpf wird **nie** gelesen — keine `message_id`, kein `ok`-Feld.
  Zwei lesende API-Aufrufe zeigen aber, dass Telegram `error_code` auf den
  HTTP-Status spiegelt (`getChat` mit ungueltiger ID → HTTP 400,
  `getMe` → HTTP 200). `ok:false` bei 2xx ist damit kein praktischer Fall.
- **Der Beleg an Produktionsdaten:** Lauf `34230052647` hatte zwei
  `ETIMEDOUT`-Fehlschlaege in `sendTelegramMessage`. Das Log meldet
  `15 von hoechstens 25 gesendet`, die Tabelle traegt **15** Zeilen, nicht 17.
  Ein gescheiterter Versand hinterlaesst nachweislich keine Zeile. Die Laeufe
  `34215003141` (25/25) und `34261364448` (25/25) stimmen ebenfalls exakt.
- **Nebenbefund:** `verbuchen()` laeuft in `pipeline.ts:400` nach
  `logNotification`. Die Zahl in `Meldungen: X von hoechstens 25` zaehlt also
  bestaetigte Versaende, nicht Versuche — D-5 ist praeziser als angenommen.

**Warum es trotzdem offen ist:** In der Zeile selbst steht nichts, was die
Zustellung beweist. Die Garantie haengt an einem Kommentar und an der
Reihenfolge zweier Anweisungen — **keine Testzeile schuetzt sie**. Kein Test im
Projekt enthaelt das Wort `fetch`; `telegram.test.ts` prueft ausschliesslich
Formatierer. Wer `if (res.ok) return;` streicht oder `logNotification`
vorzieht, bekommt eine gruene Suite.

**Weitere Luecken:** Fotos und ZVG-PDFs scheitern still mit `console.warn`
(`pipeline.ts:385`) und haben null Nachweis. Die Sweep-Warnung
(`main.ts:232`) hinterlaesst bewusst gar nichts (`listing_id` ist `not null`).
`notifications` traegt keine `run_id` — der Abgleich Log↔Datenbank
funktioniert nur, weil sich die Laufzeitfenster zufaellig nicht ueberlappen.

- [x] **Schritt 1:** `sendTelegramMessage` gibt die `message_id` zurueck
      (`res.json()` im `res.ok`-Zweig, Parsen in `try/catch`, damit ein
      fehlender JSON-Rumpf einen bestaetigten Versand nicht in einen
      Fehlschlag verwandelt) und `pipeline.ts:394` legt sie als
      `telegramMessageId` ins bestehende `detail`-jsonb. **Keine
      Schemaaenderung** — `detail jsonb` traegt das bereits (`schema.sql:116`).
- [x] **Schritt 2:** Regressionstest fuer den Transport — `globalThis.fetch`
      stubben: 200 → kein Wurf, `message_id` zurueck; 403 → wirft; 429 zweimal
      dann 200 → genau drei Aufrufe; 429 dauerhaft → wirft nach drei. Dazu ein
      `processCandidate`-Test: wirft der Versand, wird `logNotification`
      **nicht** gerufen. Im Rot-Gruen-Zyklus verifizieren.
      **Erledigt.** Vier Transportfaelle in `telegram.test.ts`, zwei
      Reihenfolgetests in `pipeline.test.ts`. Letztere stubben
      ausschliesslich `fetch` -- Telegram-Schicht, Pipeline und
      `logNotification` laufen echt.

      **Zwei Sabotageproben belegen, dass die Tests greifen** (beide
      zurueckgenommen):

      1. `logNotification` VOR den Versand gezogen → beide
         Reihenfolgetests rot (`expected [ { listing_id: 'listing-1', … } ]
         to deeply equal []`).
      2. Die Pruefung `if (res.ok)` entfernt → vier Tests rot
         (`promise resolved "null" instead of rejecting`).

      **Ein Fehler im ersten Testentwurf, den erst Probe 1 aufgedeckt hat:**
      Die Attrappe lieferte eine Vorgaengerversion mit HOEHEREM Preis, also
      `priceDropped=true` -- der Versand lief damit ueber die
      Preisaenderungs-Meldung und der Test prueste den falschen Aufrufort.
      Er war gruen und wertlos. Die Attrappe liefert jetzt einen niedrigeren
      Vorgaengerpreis, und der Kandidat traegt einen Preis, der die
      Schwellen wirklich passiert.
- [x] **Schritt 3:** `process.env.GITHUB_RUN_ID` als `runId` ins `detail`.
- [x] **Schritt 4:** Eine Erfolgszeile je Versand ins Log. **Erledigt
      (2026-09-09).** Sie entsteht in `logNotification` statt an jedem
      Aufrufer einzeln und deckt damit alle drei Aufrufer ab, ohne an einer
      Stelle vergessen werden zu koennen. Sie ruht auf der von Telegram
      bestaetigten `message_id`: Fehlt die, gibt es keine Erfolgsmeldung.
      Sich stattdessen darauf zu stuetzen, dass alle Aufrufer erst nach
      geglücktem Versand protokollieren, waere eine Annahme ueber Code in
      einer anderen Datei -- heute wahr und von einem kuenftigen vierten
      Aufrufer still zu brechen. Kein personenbezogener Inhalt, keine ganze
      Nachricht: Quelle, externalId, Meldeklasse, `message_id`.

**Bewusst nicht vorgeschlagen:** eine eigene Spalte `telegram_message_id` oder
`status`. Das `detail`-jsonb leistet dasselbe ohne Migration; eine Spalte lohnt
erst, wenn darauf gefiltert oder indiziert wird. Und keine Testnachricht an den
Chat des Nutzers — nach Schritt 1 belegt der naechste regulaere Lauf dasselbe
von allein.

**Abnahme bestanden am Lauf `34278399926`:** 25 Zeilen tragen
`runId=34278399926`, davon **0 ohne `telegramMessageId`**; die
`message_id` laufen luekenlos von 1796 bis 1820 — genau die 25, die das Log
als `Meldungen: 25 von hoechstens 25 gesendet` meldet. Punkt 4 (Verhalten bei
einem Fehlschlag) traegt dieser Lauf nicht, weil er keinen enthielt; er ist
durch den Test `schreibt KEINE Zeile, wenn Telegram den Versand ablehnt`
und durch die Daten des Laufs `34230052647` belegt.

**Urspruengliche Abnahmebedingung:** An **einem** Produktionslauf gilt gleichzeitig: (1)
`select count(*) from notifications where detail->>'telegramMessageId' is null
and detail->>'runId' = '<id>'` ergibt 0; (2) die Zahl stimmt per `runId` mit
der Logzeile ueberein; (3) die Transporttests sind gruen und der
Reihenfolgetest ist rot gesehen worden; (4) enthaelt der Lauf einen
Fehlschlag, liegt die Zeilenzahl um genau diese Anzahl unter den
qualifizierten Kandidaten — so wie es `34230052647` heute schon zeigt.
Punkt 4 ist der Kern: Ein Lauf ohne Fehlschlag belegt nur, dass nichts
schiefging, nicht dass ein Fehlschlag richtig behandelt wuerde.

---

## A13. „39 von 600 ohne Preis" ist die Quelle, nicht der Parser — ERLEDIGT (2026-09-11)

**Untersucht am 2026-09-08** für Abnahmekriterium A-4. Der Verdacht lautete
Parserfehler in der Titelzeile. **Er ist stark entkraeftet, aber nicht
abschliessend bewiesen** — und der Grund dafuer war zum Untersuchungszeitpunkt
genau der A-4-Verstoss: Die 39 Titelzeilen waren nirgends gespeichert, der
`continue` stand vor jedem Schreibzugriff, `sweep_runs` hielt nur Zaehlwerte.
**Seit `ea8b731` (Schritt 2 unten) ist das behoben:** Jede Titelzeile ohne
Preis bekommt eine `listings`-Zeile ohne `listing_versions`-Zeile, bevor der
`continue` greift.

**Der Parser liest 1758 von 1758 echten Listentiteln richtig.** Alle
Listentitel aus drei Produktionslaeufen (`listing_versions.title`, 08.09.
11:05–18:34) gegen `werteAusTitelzeile` geprueft:

```
Parser liefert null, obwohl Preis gespeichert: 0
Parser weicht vom gespeicherten Preis ab:      0
```

Das Preissegment hat genau ein Format — `999.999 €` mit Tausenderpunkt, in
**1758 von 1758** Faellen mit geschuetztem Leerzeichen (U+00A0) vor dem Euro,
das `\s*` in `PREIS` (`scrapers/immowelt/titelzeile.ts:44`) deckt es ab. Kein
`,-`, kein `EUR`, kein Preis von 0 Cent.

**Die Schwankung 0,5 %–6,5 % ist ein Regionseffekt, kein Qualitaetssprung:**

| Lauf | gesweepte Regionen | Fundorte der Scheibe | ohne Preis |
|---|---|---|---|
| `34215003141` | th, be, hb, hh, mv, nw, sl | nw 560, hb 37 | 3 = **0,5 %** |
| `34230052647` | hb, be, hh, nw | nw 600 | 0 = **0 %** |
| `34261364448` | **nur bw** | bw 561 | 39 = **6,5 %** |

Die Scheibe ist immer exakt `MAX_BEWERTUNGEN_IMMOWELT = 600` (`main.ts:130`),
die Quote haengt also nicht an der Zahl der bewerteten Objekte, nicht an der
Ergebnisseite und nicht an einem A/B-Layout, sondern daran, **welches
Bundesland die Scheibe trifft**. Dieselben 561 bw-Titel desselben Laufs wurden
fehlerfrei geparst — ein Parserfehler kann nicht regionsselektiv sein.
`streueAuswahl` (`lib/bestand.ts:226`) kann daran nichts aendern: Schafft der
Sweep nur eine Region, besteht die ganze Kandidatenliste aus dieser Region.

**Was eine preislose Karte wirklich enthaelt.** In der echten Fixture
`test/fixtures/immowelt-suche-haus.html` hat das Preiselement genau zwei
Auspraegungen: 39× einen Betrag, 1× `Preis auf Anfrage`. Der Titel derselben
Karte spiegelt das Preisfeld 1:1:

```
"Einfamilienhaus zum Kauf - Amberg - Preis auf Anfrage - 6 Zimmer, 196 m², 1.331 m² Grundstück"
```

Der Parser gibt dafuer korrekt `null` zurueck, ein Test haelt das fest
(`scrapers/immowelt/titelzeile.test.ts:65`). Quote auf dieser Seite: 1 von 40
= 2,5 %, mitten im beobachteten Band.

**Latentes Risiko, bewusst nicht repariert:** `75000 €` ohne Tausenderpunkt
ergaebe **0 Cent** statt `null` — das Muster griffe die letzten drei Ziffern.
Ein still falscher Preis waere schlimmer als eine Fehlanzeige. In den 1758
echten Titeln kommt das Format **nicht** vor (kein einziger Preis von 0 Cent),
deshalb ist das eine Haertung, kein Bugfix — ohne belegte Ursache wird hier
nicht geaendert.

**Die Stelle:** `main.ts:350–358`. Gezaehlt wird (`main.ts:340`, Ausgabe
`:386–389`), festgehalten nichts — keine `listings`-Zeile, keine external_id,
kein Titel. Strukturell geht es heute auch nicht:
`listing_versions.price_cents` ist `bigint **not null**` (`schema.sql:35`) und
`PipelineCandidate.priceCents: number` (`lib/pipeline.ts:144`).

- [x] **Schritt 1 (Voraussetzung fuer alles Weitere):** Im `null`-Zweig die
      Titelzeile mitloggen. Eine Zeile, kostet nichts, und nach einem Lauf
      liegen die echten Zeilen im Actions-Log — dann ist die Klassifikation
      bewiesen statt begruendet. Das ist die A6-Lehre: messen statt behaupten.
      **Erledigt:** `Immowelt ohne Preis [bw]: "..."` je Fall.
- [x] **Schritt 2 — ERLEDIGT (`ea8b731`, 2026-09-11).** Entscheidung des
      Nutzers: Option **(a)**, eine `listings`-Zeile ohne
      `listing_versions`-Zeile, keine Migration. `main.ts` ruft
      `upsertListingOhneBewertung` jetzt auch im Sweep-Zweig auf, sobald
      `werteAusTitelzeile` `preisCents === null` liefert (Zeile ~452), bevor
      der `continue` greift — das Objekt bleibt auffindbar und taucht im
      Bestandsabgleich auf, wird aber nicht bewertet. Derselbe Commit hat
      auch den ABNAHME-BASIS-A-4-Fall (Immowelt-Detailseite ohne Preis)
      gelöst; hier war es dieselbe Änderung, nur die Checkbox stand noch auf
      offen.
- [x] **Schritt 3:** Zwei Lueckencodes statt einem — `preis_auf_anfrage`
      (Quelle nennt keinen Preis) und `preis_unlesbar` (Titel enthaelt `€`,
      Muster greift nicht). **Erledigt (2026-09-09).** Die Trennschaerfe ist
      nicht Heuristik, sondern folgt aus der Regex-Semantik: Das Preismuster
      endet zwingend auf `€` und durchsucht die ganze Zeile. Ein Titel ohne
      `€` kann im `null`-Zweig nur `preis_auf_anfrage` sein, einer mit `€`
      nur `preis_unlesbar`. Die Schlusszeile des Laufs weist beide Codes
      getrennt aus, weiterhin nach Fundort aufgeschluesselt.
- [x] **Schritt 4:** Das Laufprotokoll um die Fundort-Aufschluesselung
      ergaenzen. **Erledigt:** `fasseOhnePreisZusammen` in
      `scrapers/immowelt/titelzeile.ts`, vier Tests. Ein fehlender Fundort
      erscheint ausdruecklich als „ohne Fundort" statt zu fehlen.
- [x] **Schritt 5:** `75000 €` darf nicht 0 ergeben. **Erledigt
      (2026-09-09)**, und die Pruefung fand denselben Fehler eine Stelle
      weiter: Der Lookbehind sperrte nur eine Ziffer davor, nicht den Punkt.
      `5.00 €` — eine unvollstaendige Dreiergruppe — ergab damit erneut
      0 Cent, weil `00` plus Eurozeichen fuer sich genommen matcht. Gemessen,
      nicht vermutet: Der Test war rot mit `expected +0 to be null`. Beide
      Sperren sind Haertung, kein Bugfix — in den 1758 echten Titeln kommt
      keines der Formate vor.

**Bemerkung zu A-3/B-1:** Solange ein Lauf nur 1 von 16 Regionen schafft, ist
„39 von 600" ueberhaupt keine stabile Kennzahl — jede Quote misst dann die
Region, nicht die Datenqualitaet.

**Abnahme erfuellt:** Nach Schritt 1 zeigt ein Lauf die echten Titelzeilen, und
die Klassifikation „Quelle nennt keinen Preis" gegen „Parser hat versagt"
steht mit Zahlen fest. Mit Schritt 2 (`ea8b731`) ist auch der zweite Teil
erfuellt: Ein Objekt ohne Preis ist nach dem Lauf noch auffindbar.

---

## A14. `.in()` reisst ab 642 IDs — der Bestandsabgleich faellt stumm aus

**Gefunden am 2026-09-08** bei der Untersuchung zu B-2. Das ist ein echter
Fehler, kein Entwurfsthema, und er trifft ausgerechnet die Wache, die
verhindert, dass gesehene Objekte geloescht werden.

**Beleg, Lauf `34230052647`** (2026-09-08 13:07 UTC), Logzeile 13:50:03 —
direkt nach `Meldungen: 15 von hoechstens 25 gesendet`:

```
Bestandsabgleich fehlgeschlagen [immowelt]: { message: 'Bad Request' }
```

Der gesamte `gleicheBestandAb` fuer Immowelt brach ab, also auch
`aktualisiereLastSeen`.

**Ursache, rein lesend reproduziert** gegen dieselbe Tabelle:
`aktualisiereLastSeen` (`lib/bestandDb.ts:133`) schickt alle IDs in **einem**
`.in("id", …)`. Die Grenze ist die URL-Laenge, nicht die Datenbank:

```
  641 IDs → URL 25.072 B → HTTP 200
  642 IDs → URL 25.111 B → HTTP 400 "Bad Request"
1.500 IDs → HTTP 414
```

Die Laeufe, die durchliefen, hatten 608 bzw. 563 IDs. Der 13:07-Lauf haette
rund 1.300 gebraucht.

**Warum es dringend ist:** Der Bestand waechst schnell (754 → **1.915**
Immowelt-Objekte binnen eines Tages). Die Grenze von 641 wird kuenftig in
**jedem** Lauf gerissen. Betroffen sind ausserdem `markiereVerschwunden`,
`hebeVerschwundenAuf` und `loescheAbgelaufene` (`bestandDb.ts:108/120/160 ff.`)
— **jede Option zu B-2 setzt voraus, dass das zuerst repariert ist.**

**Nebenwirkung, die eine Messung unmoeglich macht:** 560 `nw`-Objekte tragen
`last_seen = 2026-09-08T11:11:28`, obwohl `nw` 2,5 h spaeter erneut
vollstaendig gesweept wurde. Ob sie fehlten oder ob nur der Abgleich
abstuerzte, ist aus den Daten nicht zu trennen.

- [x] **Schritt 1:** Test, der die vier Stellen mit 1.200 IDs aufruft. Rot
      gesehen: fuenf Fehlschlaege, `expected 1200 to be less than or equal to
      500`.
- [x] **Schritt 2:** `jeBlock` fuehrt jede Schreiboperation in Bloecken zu
      hoechstens `BLOCKGROESSE = 500` aus, alle vier Stellen benutzen es.
      **Fail-closed:** Scheitert ein Block, wirft die Funktion sofort — ein
      Teilerfolg geht nie als Erfolg durch. Ein eigener Test haelt das fest.
      348 Tests gruen (vorher 342), `tsc --noEmit` sauber.
- [x] **Schritt 3:** Abnahme belegt an Lauf `34278399926` (2026-09-08,
      21:03–21:29 UTC): **null** Vorkommen von `Bestandsabgleich
      fehlgeschlagen` in 487 Logzeilen, `Lauf abgeschlossen`,
      `conclusion=success`. Zum Vergleich: Der Lauf `34230052647` mit rund
      1.300 IDs war genau daran gescheitert.

**Abnahme:** Ein Produktionslauf mit mehr als 1.000 Immowelt-Objekten
protokolliert keinen `Bestandsabgleich fehlgeschlagen` mehr, und die Zahl der
aktualisierten `last_seen`-Zeilen entspricht der Zahl der gesehenen Objekte.

---

## A15. Warum die Trefferzahl fuer `nw`, `bw` und `mv` nicht parst — MESSEN

**Das Fail-open ist geschlossen** (2026-09-09, Option 1). `istRegionVollstaendig`
gibt bei fehlender Trefferzahl jetzt `false` statt `true`. Damit zählen `nw`,
`bw` und `mv` **nicht mehr als Referenzläufe** — und genau das macht diese
Messung zur Voraussetzung für B1: Solange der Titel dort nicht parst, sammeln
die drei größten Regionen keine vollständigen Läufe an.

**Was gemessen wird, statt geraten:** `regionUnvollstaendigMeldung`
(`scrapers/immowelt/index.ts`) schreibt den echten Seitentitel wörtlich ins
Log, gekürzt auf 140 Zeichen. Ein Produktionslauf genügt.

Zwei Hypothesen, beide unbelegt:

1. **Timing.** Der Titel wird unmittelbar nach `domcontentloaded` gelesen
   (`regionErfassen`). Steht dort ein Platzhalter oder ein Titel ohne Zahl, ist
   es das — Antwort wäre, den Titel erst nach dem Laden der Liste zu lesen.
2. **Formatwechsel.** Steht dort eine echte Zahl in anderer Schreibweise
   (`7505 Angebote`, `über 7.500 Angebote`, `7.505 Immobilien`), ist das Muster
   `/([\d.]+)\s+Angebote/` in `trefferzahlAusTitel` zu eng.

**Nicht raten.** Erst den Titel aus dem Log lesen, dann einen scheiternden Test
mit genau diesem Titel schreiben, dann das Muster erweitern.

- [x] **Schritt 1:** Titel messen. **Erledigt**, Läufe `34387028565` und
      `34388541806`. Der Befund steht oben.
- [ ] **Schritt 2 — ENTFÄLLT.** Es gibt kein Muster zu erweitern, die Zahl
      steht nicht da.
- [ ] **Schritt 3 — verschoben nach A16.** Die drei Regionen können
      `vollstaendig=true` erst schreiben, wenn es einen zweiten Maßstab gibt.

**Abnahme:** erfüllt — die Frage ist beantwortet. Sie liefert weiterhin `null`,
und jetzt ist belegt, dass das an der Quelle liegt und nicht am Code.

**NACHTRAG 2026-09-16 — es sind VIER Regionen, nicht drei.** Diese Aufgabe
und der lange Kommentar an `istRegionVollstaendig`
(`scraper/scrapers/immowelt/index.ts`) kannten nur `nw`, `bw` und `mv`. Eine
erneute, breitere Messung gegen `sweep_region_runs` (16 Regionen, 210 Zeilen,
2026-09-08 bis 2026-09-16) zeigt: **`sh` gehört dazu.** Für `nw`, `bw`, `mv`
und `sh` trägt jede Zeile `gemeldete_treffer = null`, für alle zwölf übrigen
Regionen nie. Details, Abfrage und Tabelle je Region:
`docs/superpowers/specs/2026-09-16-regionen-ohne-trefferzahl.md`.

Die alte Zahl „5 von 21 Regionsläufen" oben bleibt als Stand 2026-09-09
stehen — sie stammt aus einem einzelnen Produktionslauf und wurde nicht neu
gemessen, nur eingeordnet.

**Folge für A16:** Der dort entworfene zweite Vollständigkeitsmaßstab braucht
jetzt einen Bestand mehr, als A16 annimmt — nicht drei Regionen ohne
ausgewiesene Menge, sondern vier (`nw`, `bw`, `mv`, `sh`). Jede Formulierung
in A16, die von „den drei Regionen" ausgeht, gilt sinngemäß auch für `sh`.

**Folge für B1:** Der dort geforderte Filter „`nw`, `bw` und `mv` zählen erst
wieder mit, wenn ihre Trefferzahl parst" muss `sh` einschließen — sonst
zählt B1 eine vierte Region fälschlich als möglichen Referenzlauf-Kandidaten,
sobald sie zufällig `vollstaendig=true` mit `null`-Trefferzahl aus der
Altzeit vor 2026-09-09 trägt (B1 listet `sh` unter den Altzeilen bereits
auf, nennt es aber im Fließtext nicht).

---

## A16. Ein zweiter Vollständigkeitsmaßstab für Regionen ohne ausgewiesene Menge

**Entsteht aus dem A15-Befund** und ist die Voraussetzung für B1, seit
feststeht, dass `nw`, `bw`, `mv` und `sh` ihre Trefferzahl nie nennen
(Nachtrag 2026-09-16 zu A15: ursprünglich waren nur drei Regionen bekannt,
`sh` kam bei einer breiteren Messung dazu — siehe
`docs/superpowers/specs/2026-09-16-regionen-ohne-trefferzahl.md`). Der
folgende Text spricht noch von „den drei Regionen"; gemeint sind seit dem
Nachtrag vier.

**Das Problem:** `istRegionVollstaendig` misst die eingesammelte Menge gegen
die vom Portal gemeldete. Nennt das Portal keine, ist die Region fail-closed
unvollständig — richtig, aber dauerhaft. Die (heute: vier) größten von der
Trefferzahl abgeschnittenen Regionen sammeln so nie Referenzläufe an.

**Der naheliegende zweite Maßstab: die eigene Historie derselben Region.**
`sweep_region_runs` sammelt sie bereits. Für `nw` steht dort 6823, 6895, 6965 —
eine sehr stabile Reihe. Ein Soft-Block, der 40 Karten liefert, fiele sofort
auf; genau das ist der Fall, den die Wache abfangen muss.

**Was ein Entwurf beantworten muss, bevor Code entsteht:**

- Ab wie vielen eigenen Läufen ist die Historie ein belastbarer Maßstab? Die
  quellenweite Prüfung verlangt `MIN_REFERENZLAEUFE = 3`; für eine Region gilt
  das nicht automatisch.
- Welche Toleranz? Die quellenweiten 25 % erlauben bei `nw` einen Fehlbetrag
  von rund 1.700 Objekten. Eine Region, die dreimal um 1 % schwankte, verdient
  eine engere Grenze.
- Was gilt beim allerersten Lauf einer Region, wenn es noch keine Historie
  gibt? Fail-closed heißt hier: unvollständig, und das ist die einzige
  vertretbare Antwort.
- Zählt eine Region, die mit `abgeschnitten=true` endete, überhaupt je als
  vollständig? Nein — der Seitendeckel ist ein Beleg für das Gegenteil.

**Reihenfolge:** `superpowers:brainstorming` → Entwurf unter
`docs/superpowers/specs/` → `superpowers:writing-plans` → Umsetzung.

**Warum es gefährlich ist:** Diese Wache entscheidet, ob eine Region als
vollständig gilt, und daran hängt später die regionsgenaue Löschhoheit. Ein
Fail-open hier kostet bei `nw` bis zu 6.900 Objekte.

**Eine Sperre steht seit A18-6 ausdrücklich im Weg.** `regionsLaufZeile`
(`scraper/lib/bestandDb.ts`) schreibt seit dem 2026-09-16 `vollstaendig: false`,
sobald `gemeldeteTreffer === null` ist — fail-closed an der Schreibstelle, nicht
nur im Rechenweg. Genau die Regionen, für die A16 einen zweiten Maßstab bauen
will, nennen ihre Trefferzahl nie; ihre Zeilen laufen also gegen diese Sperre.
**Das ist Absicht:** A16 muss sie ausdrücklich aufheben und dabei benennen,
woran Vollständigkeit dann stattdessen gemessen wird — und wo der neue Maßstab
in der Zeile landet, damit `vollstaendig = true` nie wieder ohne Maßstab
dasteht. Hintergrund und Messung:
`specs/2026-09-16-vollstaendig-ohne-trefferzahl.md`.

## GEMESSEN am 2026-09-09 — und es ist keine der drei Vermutungen

Zwei Prüfläufe gegen `nw` über `pruefung.yml`, je **eine** Ergebnisseite.

**Lauf `34387028565` — die beiden Titel:**

```
Titel, den regionErfassen las: Mehrfamilienhaus kaufen in Nordrhein-Westfalen | immowelt
  Trefferzahl daraus:          null
Titel am Ende des Laufs:       Häuser zum Kauf in Nordrhein-Westfalen
  Trefferzahl daraus:          null
```

Zum Vergleich der Fall, der funktioniert:
`Mehrfamilienhaus kaufen in Bremen - 209 Angebote | immowelt`.

Die Titel **unterscheiden** sich, der Lesezeitpunkt ist also beteiligt — aber
**keiner von beiden nennt eine Zahl**. Damit sind beide Hypothesen erledigt:
Ein anderes Muster hilft nicht, und später lesen auch nicht.

**Lauf `34388541806` — die Suche im Seitentext:**

```
=== Trefferzahl im Seitentext? ===
  KEIN Zahl-plus-Mengenwort im Seitentext gefunden.
```

Gesucht wurde nach Zahl plus `Angebote`, `Immobilien`, `Ergebnisse`,
`Treffer`, `Objekte` oder `Inserate`, im Text ohne Markup.

**Lauf `34388892360` — Gegenprobe mit `bw`, dasselbe Bild:**

```
Titel, den regionErfassen las: Mehrfamilienhaus kaufen in Baden-Württemberg | immowelt
Titel am Ende des Laufs:       Häuser zum Kauf in Baden-Württemberg
  Trefferzahl daraus:          null   (beide)
  KEIN Zahl-plus-Mengenwort im Seitentext gefunden.
```

### Der Befund

**Diese Regionen weisen ihre Trefferzahl nirgends aus.** Kein Parserfehler,
kein Formatwechsel, kein Timing — das Portal nennt für sie schlicht keine
Menge. In zwei Regionen unabhängig reproduziert.

**Und es liegt nicht an der Größe**, die naheliegendste Erklärung. Gemessen
aus `sweep_region_runs`:

| Region | Objekte | Trefferzahl im Titel |
|---|---|---|
| `nw` | ~6.965 | **nein** |
| `by` | 5.083 | ja |
| `bw` | ~4.847 | **nein** |
| `ni` | 3.282 | ja |
| `he` | 2.698 | ja |
| `mv` | ~623 | **nein** |
| `hb` | 204 | ja |

Bayern ist größer als Baden-Württemberg und nennt seine Zahl;
Mecklenburg-Vorpommern ist klein und nennt sie nicht. Woran es stattdessen
liegt, ist offen — und für die Lösung auch gleichgültig.

**Die Folge wiegt schwer.** `istRegionVollstaendig` kann für `nw` nie `true`
liefern. Die Fail-closed-Entscheidung vom 2026-09-09 ist damit dauerhaft
richtig — und sie bedeutet zugleich, dass `nw`, `bw` und `mv` **nie**
Referenzläufe sammeln, solange die gemeldete Trefferzahl der einzige Maßstab
ist. Das blockiert B1 für die größten Regionen dauerhaft.

**Die Antwort ist kein neues Titelmuster**, sondern ein zweiter
Vollständigkeitsmaßstab für Regionen ohne ausgewiesene Menge — siehe A16.

**Schritt 2 und 3 dieser Aufgabe entfallen damit.** Es gibt kein Muster zu
erweitern.

---

## A17. Vier kleinere Befunde aus der ranking-schritt2-Review — drei ERLEDIGT (2026-09-15), einer offen

**Herkunft:** Die abschließende Gesamtprüfung des Zweigs `sdd/ranking-schritt2`
(gemergt `bf0ddf1`, Ledger
`.superpowers/sdd/2026-09-14-ranking-schritt2-abschluss/progress.md`) hat vier
wichtige und zwei kleine Befunde gemeldet. Die vier wichtigen und zwei
kleinen sind in der Fixwave (`96f3528`) behoben; vier weitere kleine Punkte
wurden bewusst nicht mitgezogen, um die Fixwave nicht zu einer zweiten
Implementierungsrunde zu machen. Hierher geroutet, wie im Ledger vermerkt.

- [x] **`DSCR_MELDESCHWELLE` ist doppelt — ERLEDIGT (`6f2ce67`).**
  `scraper/lib/ranking.ts:95` definierte `DSCR_MELDESCHWELLE = 1.3` als
  eigenen Namen, weil `scraper/lib/metrics.ts:88` denselben Wert nur als
  Literal in der `topTreffer`-Bedingung trug und ihn nirgends exportierte.
  Ändert sich die Meldeschwelle künftig an einer Stelle, bricht die andere
  lautlos. Behoben: `metrics.ts` exportiert die Zahl jetzt als benannte
  Konstante und benutzt sie selbst in `topTreffer`, `ranking.ts` importiert
  sie statt sie zu duplizieren. Test faelscht `metrics.ts` per `vi.doMock`
  auf eine andere Schwelle und prueft, dass sich `bewerteFuerRangliste`
  danach richtet — reine Wertgleichheit haette eine wiedereingefuehrte Kopie
  nicht erkannt.
- [x] **`undefined` vs. `null` an der DB-Grenze in `bestimmeVerfuegbarkeitszustand`
  — ERLEDIGT (`47a08a4`, nachgebessert in `6fe993e`).** Die Signatur verlangte
  `disappearedAt: string | null`, und die Prüfung
  `if (objekt.disappearedAt !== null) return "abgaengig";` behandelte jedes
  `undefined` (z. B. eine Spalte, die eine SQL-Abfrage nicht mit auswählt)
  wie einen gesetzten Zeitstempel — das Objekt gälte fälschlich als abgängig.
  **Anders behoben als hier vorgeschlagen:** nicht beim Aufrufer (Schritt 3,
  Snapshot-Export existiert im Code noch gar nicht), sondern direkt in der
  Funktion. **Der erste Versuch (`47a08a4`) war selbst noch fehlerhaft:** er
  liess `undefined` zur Frischepruefung durchfallen, was bei frischem
  `last_seen` "verfuegbar" lieferte — eine Behauptung in die andere
  Richtung. `null` und `undefined` sind kein gleichwertiges Nichtwissen:
  `null` heisst "Spalte gelesen, nicht abgängig" und rechtfertigt ein Urteil
  über `last_seen`/Kadenz; `undefined` heisst "Spalte lag nicht vor" und
  trägt keine Aussage. `6fe993e` entscheidet `undefined` deshalb sofort auf
  `"unbestaetigt"`, ohne `last_seen` oder Kadenz zu befragen. Test mit
  frischem `last_seen` nagelt das fest (die reine Frischepruefung hätte dort
  "verfuegbar" geliefert).
- [x] **`mietSpanneBundesweit()` bleibt ohne Memoisierung — ERLEDIGT (`d597ccd`).**
  Im Gegensatz zu `mieteProM2FuerBundesland` und (seit der Fixwave)
  `mietSpanneFuerBundesland` lief hier bei jedem Aufruf erneut ein
  `Object.values()`/`Math.min`/`Math.max` über die ganze
  `REGIONALE_MIETE_PRO_M2`-Tabelle. Trifft nur sehr wenige Objekte (6 von
  12.611, Entwurf 3.3) — deutlich seltener als der bereits behobene Fall für
  `mietSpanneFuerBundesland`, der 11.308 S1-Objekte betraf. Behoben nach
  demselben Muster wie die Nachbarn (eine gemerkte Variable statt einer Map,
  weil die Funktion kein Argument hat); Referenzgleichheits-Test (`toBe`)
  belegt, dass zwei Aufrufe jetzt dasselbe Objekt liefern.
- [ ] **Ungenannte Grenzfälle der finalen Gesamtprüfung — OFFEN.** Der
  Prüfbericht nennt in der Kurzfassung „Grenzfälle unfixiert", ohne sie im
  Ledger einzeln auszuschreiben. Vor einer Bearbeitung zuerst das Diff
  `.superpowers/sdd/2026-09-14-ranking-schritt2-abschluss/review-e4492a2..96f3528.diff`
  und die Fundstelle im Sitzungsprotokoll der finalen Gesamtprüfung
  nachschlagen — hier nicht aus der Erinnerung nacherzählt, um nichts zu
  erfinden. Ohne den Originalbericht nicht bearbeitbar (Stand 2026-09-15).

**Abnahme:** je Punkt ein eigener, zuerst rot gesehener Test, dann die
minimale Behebung — wie überall in diesem Projekt. Für die drei erledigten
Punkte erfüllt (`6f2ce67`, `47a08a4`/`6fe993e`, `d597ccd`).

---

## A18. Vier Befunde am Snapshot-Export, gefunden beim Bau der Oberfläche

**Herkunft:** Die Weboberfläche (`web/`, gemergt 2026-09-15) liest den
Snapshot und hat dabei einen Vertragstest gegen die **echte** Exportdatei
laufen lassen. Der hat vier Dinge gefunden, die am Export liegen, nicht an der
Anzeige. Die Oberfläche fängt alle vier ab, ohne eine Ursache zu erfinden —
behoben sind sie damit nicht.

- [x] **Ein S0-Objekt ohne jeden Grund — ERLEDIGT (2026-09-16; Scraper
  `080812a`, nach der Prüfung auf einen Durchlauf umgebaut; Web `b13c09f`,
  `128d76c`; Merge `5931300`).** Das ZVG-Objekt `9327fbb0…` (Leverkusen)
  ist S0, weil die Wohnfläche fehlt — trägt aber ein leeres `data_gaps` und
  damit keinen Klartext-Grund. Entwurf **3.7** verlangt ausdrücklich einen:
  *„an der Stelle steht der Grund im Klartext"*. Die Oberfläche schreibt
  deshalb „der Export nennt zu diesem Objekt keinen Grund" — aus
  `wohnflaecheM2 === null` ein „Wohnfläche fehlt" abzuleiten wäre eine im
  Frontend nachgebaute Ableitung und damit eine zweite Kopie der Stufenregel.
  **Der Export gehört so ergänzt, dass jedes S0-Objekt seinen Grund mitbringt.**
  **Behoben in `ranking.ts`, nicht im Export:** `s0Gruende(objekt)` liefert
  die Lückencodes, die S0 tragen. Fehlt die Fläche ohne `wohnflaeche_fehlt`
  in `data_gaps`, nennt sie `wohnflaeche_fehlt`; führt allein eine Mietquelle
  außerhalb der Aufzählung nach S0, nennt sie den neuen Code
  `mietquelle_unbekannt` (Klartext in `DATA_GAP_LABELS`). `baueSnapshot`
  verschmilzt `data_gaps` mit diesen Gründen (ohne Dopplung, gemeldete Lücken
  zuerst) und gibt Stufe und Gründen dieselbe Eingabe. Die Zeile ohne Version
  behält „Preis fehlt".
  **Nachgebessert nach der Prüfung von Runde 1 (I-1):** Die erste Fassung
  (`080812a`) entschied die Stufe in `bestimmeSicherheitsstufe` und leitete
  die Gründe in `s0Gruende` ein zweites Mal ab, mit `mietquelle_unbekannt` als
  Rückfall durch Ausschluss. Ein neuer Weg nach S0 in nur einer der beiden
  Kopien hätte der Export still als „Mietquelle unbekannt" ausgegeben — eine
  erfundene Ursache. Jetzt bestimmt die interne Funktion `stufeUndGruende`
  Stufe und Gründe in **einem** Durchlauf: Jede Prüfung, die S0 auslöst, legt
  ihren Code ab, der Rückfall am Ende `mietquelle_unbekannt`.
  `bestimmeSicherheitsstufe` und `s0Gruende` sind dünne Hüllen darum (Signaturen
  unverändert). Der Typ `StufeUndGruende` verlangt für S0 eine nicht leere
  Gründeliste, sodass ein künftiger S0-Weg ohne eigenen Code `tsc` nicht
  besteht. Ein Rastertest prüft, dass `mietquelle_unbekannt` nur bei einer
  Mietquelle außerhalb der Aufzählung steht. Außerdem entdoppelt der Export
  jetzt **nach** der Übersetzung in Klartext (M-4): Altname und heutiger Name
  an einem Objekt ergeben einen Satz, nicht zwei.
  **Abnahme Punkt 1 erfüllt:** Die Vertragswache der Oberfläche
  (`web/src/daten/snapshot.vertrag.test.ts`, Web-Commits `b13c09f` und
  `128d76c`, Merge `5931300`) lief gegen die mit dem gemergten Scraper neu
  erzeugte Exportdatei grün, ohne Ausnahmeregel: voller Web-Lauf **92
  Prüfungen** grün (92 passed, 1 skipped). Die Zahl 92 statt 84 belegt, dass
  die Datei gelesen wurde. Direkt an der Datei gezählt: 0 S0-Objekte ohne
  Grund, 0 rohe Codes (Beleg: `.superpowers/sdd/2026-09-16-a18-und-die-zwei-funde/runde1-W-report.md`).
- [x] **Ein Lückencode ohne Klartext — ERLEDIGT (2026-09-16, `f1b99f0`).**
  `kaufpreis_unplausibel` (2 Objekte am 2026-09-15, 1 am 2026-09-16) steht
  in keiner `DATA_GAP_LABELS`-Zeile. Das ist der **alte Name** — A9 hat ihn
  seinerzeit in `preis_miete_unvereinbar` umbenannt, weil er eine Behauptung
  aufstellte, die die Messung nicht deckt. Diese beiden Zeilen stammen also
  aus der Zeit davor und wurden nie nachgezogen. Zu entscheiden ist, ob der
  Export alte Codes übersetzt oder ob die Daten selbst nachgezogen werden
  (Letzteres ist ein Schreibzugriff auf Produktionsdaten und damit eine
  Entscheidung des Nutzers).
  **Entscheidung: Der Export übersetzt, die Daten bleiben unberührt.** Ein
  `update` auf die Produktionszeilen (2 am 2026-09-15, 1 am 2026-09-16) wäre
  ein Schreibzugriff und löste nur diese Zeilen, nicht die nächste
  Umbenennung; ein Alias in
  `DATA_GAP_LABELS` (`telegram.ts`) wirkt dauerhaft und ist rückgängig zu
  machen. Der Altname trägt zeichengleich den Klartext von
  `preis_miete_unvereinbar` — der Test vergleicht beide gegeneinander, nicht
  gegen ein Literal.
  **Der schwerere Fund dabei: `S0_LUECKEN` (`ranking.ts`) kannte nur den neuen
  Namen.** Der Altname löste die S0-Einstufung also nicht aus — ein Objekt,
  das allein über `kaufpreis_unplausibel` nach S0 gehört, bekam eine
  Rangzahl, die auf genau den als unvereinbar gemeldeten Zahlen beruht (mit
  angegebener Miete sogar S3; so im roten Test gesehen). Der Altname steht
  jetzt auch in `S0_LUECKEN`; ein Test nagelt Stufe S0 und den Grund
  `kaufpreis_unplausibel` fest. **Für die Bestandszeilen selbst** sagt
  Entwurf 13.1, Punkt 5 („Nebenbefund, ohne Folgen"; damals zwei Zeilen):
  Beide tragen zusätzlich `rent_estimate_unreliable` und waren deshalb
  ohnehin S0. Das ist die Messung des Entwurfs, hier nicht neu gemessen; die
  Prüfung von Runde 1 fand die S0-Zahl in der Exportdatei vor und nach der
  Behebung gleich (1.841). Der Eintrag gehört trotzdem nach
  `S0_LUECKEN`: Die Stufe darf nicht davon abhängen, dass zufällig eine zweite
  Lücke mitkommt, und `s0Gruende` nennt den Altnamen jetzt als Grund.
  `pipeline.ts` erzeugt nur den neuen Namen (`bewertePreisplausibilitaet`)
  und liest den Code nirgends — dort ist nichts nachzuziehen.
- [x] **Der Snapshot trägt keinen Kaufpreisfaktor — ERLEDIGT (2026-09-16,
  `d032b53`).** `kaufpreisfaktor: number | null` am Objekt, `null` bei S0.
  Die Oberfläche zeigt ihn in der Spalte „Preis · Fläche“ als „24,3×“ mit
  `title="Kaufpreisfaktor"`. Am frischen Export: 19.574 Objekte, 17.674 mit
  Faktor, 1.900 S0, davon keines mit Faktor.
  **Im Browser angesehen (2026-09-18):** Lokaler Snapshot frisch aus der
  Produktions-DB erzeugt (21.897 Objekte, 19.681 mit Kaufpreisfaktor),
  Dev-Server gestartet, headless per Playwright geprüft. Die Zelle
  „150 m² · 473 €/m² · 5,0×" erscheint wie vorgesehen, `<span
  title="Kaufpreisfaktor">5,0×</span>` steht im DOM, keine Konsolenfehler.
  Screenshot bestätigt die Platzierung neben Fläche und €/m² in der Spalte
  „PREIS · FLÄCHE".
  *Ursprünglicher Befund:* Entwurf 2.3 sieht den Faktor „daneben als zweite
  Zahl“ vor, die Oberfläche zeigte stattdessen €/m².
- [x] **Dritte Kopien von zwei Konstanten — ERLEDIGT (2026-09-16,
  `d032b53`).** Der Snapshot hat den siebten Ast `konstanten: { karenzTage,
  dscrMeldeschwelle }`, gespeist aus `KARENZ_TAGE` und `DSCR_MELDESCHWELLE`.
  `web/` hat die eigenen Kopien entfernt und reicht die Werte als Argument
  bzw. Property durch. Aus der Prüfung kamen zwei Wachen dazu:
  `hatGueltigeKonstanten` lehnt eine Datei ohne gültige Konstanten beim Laden
  ab (vorher: weiße Seite). `karenzVorbei` ist fail-closed, eine nicht
  endliche Karenz gilt als abgelaufen (vorher: NaN, und kein Abgang verließ
  die Rangliste).

**Abnahme:** je Punkt ein zuerst rot gesehener Test. Für Punkt 1 gilt zusätzlich:
Der Vertragstest der Oberfläche
(`web/src/daten/snapshot.vertrag.test.ts`) muss danach ohne Ausnahmeregel grün
laufen — er ist der Wächter, der den Fund gemacht hat.

**Notiz aus der Prüfung von Runde 1 (M-8) — ERLEDIGT (2026-09-18,
`ce44cab`).** Die Vertragswache prüft `stufe === "S0"`, nicht
`rangzahl === null`. `rangzahl` wurde in `baueSnapshot` (`snapshot.ts`) ohne
`endlichOderNull` exportiert, anders als der Kaufpreisfaktor, und
`geschaetzterDscr` ist nach oben unbegrenzt (`metrics.ts`, Division durch
Kaufpreis plus Nebenkosten). Ein unendlicher Wert würde beim Schreiben der
Datei (`JSON.stringify`) still zu `null` — bei einem Objekt, das **nicht** S0
ist. In der Oberfläche sähe das aus wie „keine Kennzahl", und die Wache
bemerkte es nicht. Behoben: `endlichOderNull` nimmt jetzt `number | null`
und gibt `null` unveraendert durch; beide `rangzahl`-Exportstellen in
`baueSnapshot` benutzen sie. Test zuerst rot gesehen (`price_cents: 0` bei
sonst gesundem S1-Objekt treibt `geschaetzterDscr` nach `Infinity`, gemessen
vor dem Fix), danach gruen. 526 Scraper-Tests, `tsc` sauber, 94 Web-Tests
unveraendert. War 0 Fälle im Bestand zum Zeitpunkt des Fixes — praeventiv,
kein akuter Datenfehler.

# Teil B — Braucht erst einen Entwurf

Nicht direkt implementieren. Reihenfolge: `superpowers:brainstorming` → Spec
unter `docs/superpowers/specs/` → `superpowers:writing-plans` → Umsetzung.

## B1. Immowelt-Löschhoheit, Phase 2 — regionsgenaues Löschen

> **Der Entwurf liegt vor:**
> [`specs/2026-09-08-immowelt-abgaenge-optionen.md`](specs/2026-09-08-immowelt-abgaenge-optionen.md).
> Kurzfassung: **fünf** Sperren stehen vor `disappeared_at`, nicht zwei; die
> erste davon ist der Fehler A14. Die Rotation wurde validiert (fünf von fünf
> Läufen vorhergesagt), und eine Monte-Carlo-Rechnung über 3.000 Durchläufe
> sagt: drei Referenzläufe je Region sind in **13 Tagen** erreichbar
> (90. Perzentil 20) — mit einer **Fortsetzungsrotation statt der Uhr in 5,7
> Tagen, ohne einen einzigen zusätzlichen Abruf**. B1 ist also erreichbar.
>
> **Option 0 und Option 1 sind erledigt.** Option 0 war A14
> (`.in()`-Stückelung, 2026-09-08). Option 1 ist seit 2026-09-09 im Code:
> Fortsetzungsrotation und fail-closed bei fehlender Trefferzahl. Als Nächstes
> steht **Option 3** an — markieren ohne löschen.
>
> **Empfohlen wird weiterhin nicht B1, sondern Markieren ohne Löschen** —
> derselbe Code mit abgeschaltetem letztem Schritt. Grund: Selbst mit
> reparierter Trefferzahl erlaubt die 25-%-Toleranz einen Lauf mit 75 %
> Ausbeute — **bis zu 1.724** echte Objekte in einem Zug. Gelöschte Zeilen sind
> weg, ausgegraute nicht.
>
> **Alle drei Fail-open-Stellen sind geschlossen** (2026-09-09).
> `istRegionVollstaendig`: `null` heißt jetzt **unvollständig** — die Folge
> steht in **A15**. `imGeltungsbereich`: ein leerer Geltungsbereich gibt nicht
> mehr den ganzen Bestand frei. `loescheAbgelaufene`: löscht nur noch Quellen
> aus einer ausdrücklichen Erlaubnisliste, heute allein `zvg-portal`. Wer
> Immowelt dort einträgt, gibt die harte Löschung frei — das ist die
> Entscheidung, die Option 3 gerade **nicht** treffen soll.

**Harte Voraussetzung:** `sweep_region_runs` muss je Region **drei**
vollständige Läufe zeigen. Vorher ist die Aufgabe wirkungslos.

```sql
select partition, count(*) filter (where vollstaendig) as referenzlaeufe
from sweep_region_runs where source = 'immowelt'
  and gemeldete_treffer is not null   -- siehe Warnung unten
group by partition order by referenzlaeufe desc;
```

**Der Filter ist nicht optional.** Gemessen am 2026-09-09 stehen in
`sweep_region_runs` **8 Zeilen mit `vollstaendig=true`, obwohl ihre
Trefferzahl `null` ist** — Altbestand aus der Fail-open-Zeit vor dem
2026-09-09, verteilt auf `nw` (3), `mv` (3), `bw`, `sh`, `th`, `sl`. Ohne den
Filter behauptet die Abfrage Referenzläufe, für die nie ein Mengenmaßstab
existierte, und zwar ausgerechnet für die größte Region. `started_at >=
'2026-09-09'` täte es genauso.

Stand 2026-09-08: vier Regionen mit je einem Lauf (`br`, `st`, `th`, `sl`).
Die Fortsetzungsrotation lässt diese Zahl seit 2026-09-09 planbar wachsen —
Median 5,7 statt 13,1 Tage bis drei Referenzläufe je Region. **A15 ist
Voraussetzung:** `nw`, `bw`, `mv` und `sh` zählen erst wieder mit, wenn ihre
Trefferzahl parst (Nachtrag 2026-09-16 zu A15: `sh` gehört zu dieser Menge
dazu, siehe `docs/superpowers/specs/2026-09-16-regionen-ohne-trefferzahl.md`).

**Nachgemessen 2026-09-18 (waehrend Runde 4 lief, reine Lesequery gegen
`sweep_region_runs`):** Die Voraussetzung ist fuer die Mehrheit **bereits
erfuellt**. Immowelt: **12 von 16 Regionen** stehen bei **>= 3**
Referenzlaeufen (`by` 10, `st` 8, `br`/`th`/`sl`/`hb` 7, `hh`/`ni`/`rp` 6,
`be`/`he`/`sn` 5). **Nur noch `mv`, `nw`, `bw`, `sh` stehen bei 0** — exakt
die vier Regionen aus A15/A16, keine weiteren. ZVG: **alle 16 Regionen**
erfuellen die Schwelle, keine Ausnahme. Die harte Voraussetzung fuer B1 ist
damit fuer 28 von 32 Quelle-Region-Paaren bereits da; der einzige
verbleibende Block ist A16 (zweiter Vollstaendigkeitsmassstab fuer die vier
Regionen ohne Trefferzahl).

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

## B5. 350 leere Hüllen im Bestand — URSACHE GEKLÄRT (2026-09-20)

> **Untersucht und belegt:
> [`specs/2026-09-20-b5-leere-huellen-befund.md`](specs/2026-09-20-b5-leere-huellen-befund.md).**
> Drei Dinge daraus, die den Abschnitt darunter überholen:
>
> 1. **Es ist keine Sperre und kein Parserfehler**, sondern der Schreibpfad:
>    `main.ts:452` → `upsertListingOhneBewertung` (`lib/db.ts:161`) schreibt
>    nur in `listings`, nie eine `listing_versions`-Zeile; `snapshot.ts:626`
>    liefert deshalb titel/ort/plz als `null`. Am Code nachgeprüft.
>    **Der Verdacht „Immowelt-Detailsperre (B6)" ist damit widerlegt** — bei
>    diesen Objekten wurde nie eine Detailseite versucht (`last_detail_at`
>    bleibt `null`).
> 2. **Es ist keine Regression, sondern deine Entscheidung vom 2026-09-11**,
>    umgesetzt in `ea8b731` (2026-09-12) und `dd0b81b` (2026-09-13): Ein Objekt
>    ohne Preis bekommt eine Zeile, statt verloren zu gehen (A-4). Vorher gab
>    es diese Zeilen gar nicht. Belegt über `git log -S`, **nicht** über den
>    Snapshot — Schritt 1 unten bleibt offen (siehe Punkt 3).
> 3. **Die Zahl 352 unten ist falsch gezählt.** Nach der Definition
>    „titel + ort + plz alle null" sind es **350** (347 Immowelt, 3 ZVG).
>    352 ist „ohne Bundesland und ohne Ort", 356 ist „ohne Bundesland".
>
> **Der einzige echte Mangel, der bleibt:** `main.ts:427` berechnet aus der
> Titelzeile Lage, Zimmer, Wohnfläche und Grundstück — und `main.ts:452`
> übergibt nichts davon. Die Angaben sind da und werden weggeworfen.
> Die Wege dahin und ihre Preise stehen im Befund, Abschnitt „Optionen".
> **Entschieden ist nichts.**

<details><summary>Der ursprüngliche Befund vom 2026-09-19 (Zahlen teils überholt)</summary>

### 352 leere Hüllen im Bestand — Objekte, die nur aus einer URL bestehen

**Gefunden am 2026-09-19** beim Auszählen der Kartenabdeckung, also nebenbei.
**Entscheidung des Nutzers am selben Tag: festhalten, nach der Kartenaufgabe
angehen** — nicht sofort, aber auch nicht vergessen.

**Die Messung** (Snapshot vom 2026-09-18, `web/public/dashboard-snapshot.json`,
21.897 Objekte — damit niemand neu messen muss):

| | |
|---|---|
| ohne `bundesland` | **356** (1,62 %) |
| davon Immowelt | **347** |
| davon ZVG | 9 |
| davon **ohne Titel, ohne Ort, ohne PLZ** — nur eine `/expose/`-URL | **352** |
| zuletzt gesehen | 151 am 17.09., 197 am 18.09., einzelne ab 13.09. |
| Zustand | 176 unbestätigt, 171 verfügbar, 9 abgängig |

Ein Beispiel: `titel: null, ort: null, plz: null`, URL
`https://www.immowelt.de/expose/4ffe88b6-…`. Die Zeile existiert, trägt eine
Kennung und eine Adresse — und sonst nichts.

**Was das für die Oberfläche heißt:** Solche Objekte erscheinen auf der Karte
nirgends (kein Punkt, keine Kachel) und in der Liste als „Ohne Titel — die
Quelle nennt keinen". Die Kartenaufgabe behandelt sie ehrlich (kein Ring, ein
Satz, der sagt warum), **behebt die Ursache aber nicht.**

**Was ausdrücklich NICHT belegt ist:** dass dies eine neue Regression sei.
Verlockend wäre der Vergleich mit E-7 („54 Objekte ohne zuordenbare Region",
Stand 2026-09-15) — aber der taugt nicht: Dem Snapshot fehlt `first_seen`, und
E-7 zählte womöglich anders (`partitionEinesListings` liefert keine Region
gegen `bundesland === null`). **Zwei Größen mit verschiedener Definition
nebeneinanderzustellen ist genau der Fehler, den dieses Projekt bei „54 statt
157" schon einmal korrigiert hat.**

> ## SCHRITT 1 UND 2 SIND GEMESSEN (2026-09-20): B5 IST KEIN FEHLER
>
> Gemessen mit `scraper/scripts/messung-b5-leere-huellen.mts` (nur lesend)
> gegen den Livebestand:
>
> ```
> listings gesamt:                    23.054
> davon mit mindestens einer Version: 22.656
> LEERE HUELLEN:                         398
>
> first_seen:  13.09. 33 | 14.09. 92 | 15.09. 83 | 16.09. 57
>              17.09. 46 | 18.09. 56 | 19.09. 20 | 20.09. 11
> Anteil am Tageszugang: 1,5 % | 6,3 % | 6,4 % | 4,7 %
>                        4,4 % | 3,3 % | 3,5 % | 3,0 %
> ```
>
> **Schritt 1 ist beantwortet: Dauerzustand, keine Regression.** Die Hüllen
> verteilen sich über acht Tage mit stabiler Quote von 3 bis 6 % des
> Tageszugangs. Kein Sprung, kein Knick.
>
> **Und der Anfang hat ein Datum.** Der Bestand reicht bis zum 05.09.
> zurück, die erste Hülle stammt vom 13.09. Am **2026-09-12** führte
> `ea8b731` den Pfad ein: „ein Objekt ohne Preis bekommt eine Zeile statt
> eines `continue`" (A-4, Entscheidung des Nutzers vom 2026-09-11). Die
> erste Hülle entstand am Tag danach.
>
> **Damit ist die Ursache benannt, und es ist keine Sperre.** Eine leere
> Hülle ist eine `listings`-Zeile ohne `listing_versions`-Zeile, und nur
> `upsertListingOhneBewertung` erzeugt solche. Im Snapshot erscheint sie als
> `titel: null, ort: null, plz: null`, weil all diese Felder auf
> `listing_versions` liegen. Der Verdacht aus Schritt 3 -- die
> `/expose/`-Sperre -- ist damit hinfällig, und er war ohnehin schon
> widerlegt (B6 Schritt 1).
>
> **Schritt 2: E-7 und B5 sind disjunkt.** Am selben Bestand, mit beiden
> Definitionen zugleich gerechnet:
>
> ```
> ohne zuordenbare Region (E-7, partitionEinesListings): 35
> leere Huellen (B5, ohne listing_versions):            398
> beides zugleich:                                        0
> ```
>
> **Die Warnung dieses Abschnitts war berechtigt** -- die beiden Zahlen
> messen verschiedene Dinge, und zwar nachweislich überschneidungsfrei. Der
> Verdacht „das könnte dieselbe Sache sein" ist nicht bloß unbelegt, er ist
> widerlegt. Nebenbei: E-7 steht heute bei **35**, nicht bei 54.
>
> **Was bleibt:** Kein Test, kein Fix. Die Detailphase aus B6 wird die Zahl
> von selbst drücken, wo ein Exposé einen Preis nennt, den die Titelzeile
> ausließ -- das ist aber eine Nebenwirkung, kein Auftrag. **Offen bleibt
> allein Schritt 4 (E-7 im Dashboard).**

- [x] ~~**Schritt 1: Alter bestimmen, bevor irgendetwas vermutet wird.**~~ Lesende
  Abfrage über `listings.first_seen` für die betroffenen Zeilen (`cd scraper &&
  npx tsx <skript>`, nur lesend). Kommen sie alle aus wenigen Tagen, ist es
  eine Regression; verteilen sie sich über Wochen, ist es ein Dauerzustand.
  **Das Ergebnis entscheidet, ob es überhaupt ein Fehler ist.**
- [x] ~~**Schritt 2: Dieselbe Zählung mit der E-7-Definition** wiederholen~~
  (`partitionEinesListings`), damit die 54 und die 356 vergleichbar werden —
  oder belegt ist, dass sie es nicht sind.
- [x] ~~**Schritt 3: Erst nach benannter Ursache** einen scheiternden Test.~~
  **Entfällt:** Die Ursache ist benannt und sie ist gewolltes Verhalten
  (A-4). Ein scheiternder Test bräuchte einen Fehler, den es nicht gibt. Die
  Richtung hängt von Schritt 1 ab: Erfasst der Scraper Zeilen, die er besser
  gar nicht anlegte? Oder verliert er Felder, die die Quelle sehr wohl nennt?
  Naheliegender Verdacht, **ungeprüft**: `/expose/`-Detailseiten sind von
  Rechenzentrums-Adressen gesperrt (siehe `UEBERGABE.md`, „Fallen") — eine
  Zeile, die nur aus einer Expose-URL besteht, passt zu diesem Muster.
- [ ] **Schritt 4: E-7 nachziehen.** Die vom Nutzer am 2026-09-13 entschiedene
  Kategorie **„Objekte ohne Region"** ist im Dashboard **nirgends gebaut** —
  geprüft am 2026-09-19, es gibt weder Filterknopf noch Bereich. Diese
  Entscheidung steht also seit Wochen unerfüllt.

</details>

## B6. Der Immowelt-Lauf: alles auf einmal, und überall dieselben Felder

**Frage des Nutzers, 2026-09-19/20, im Wortlaut:**

> „warum bekommen wir nicht alle inserate von immowelt auf ein mal? warum
> braucht es mehrere läufe. warum sind die datensätze nie konsitent gefüllt.
> wir müssen den scraper run schlank halten der muss durch alle inserate
> durch und am besten immer einheitliche infos ganheitlich auslesen."

**Die Antworten stehen im Code und sind hier belegt, damit die Aufgabe nicht
bei null anfängt.** Der Koordinator hat sie am 2026-09-20 nachgelesen; keine
Vermutung, jede Zeile mit Fundstelle.

### Warum nicht alles auf einmal — ein Zeitbudget, kein Fehler

`SWEEP_BUDGET_MS = 12 * 60 * 1000` (`scrapers/immowelt/index.ts:62`). Die
Schleife über die 16 Bundesländer bricht ab, sobald das Budget voll ist — mit
einer Ausnahme: **eine einmal begonnene Region wird immer zu Ende geblättert**
(„ein halb erfasstes Bundesland wäre eine Lüge über die Abdeckung").

Der Kommentar an `sweepStartVersatz` (`lib/bestand.ts:400`) sagt die
Größenordnung: **„Das Zeitbudget eines Laufs reicht für genau eine große
Region — `nw` allein braucht 173 Seiten."**

Dazu die Drossel: `IMMOWELT_VERZOEGERUNG_MS = 5000` — **fünf Sekunden zwischen
zwei Seitenabrufen**. 12 Minuten ergeben damit rund **144 Seitenabrufe je
Lauf**, für alle 16 Regionen zusammen. Die Drossel ist kein Zufallswert: Ein
CAPTCHA misst eine zu hohe Abrufrate (siehe `UEBERGABE.md`, „Fallen"), und
Immowelt deckelt jede Ergebnisliste ohnehin bei `SEITEN_DECKEL = 250`.

**Die 75-Minuten-Grenze des Workflows ist die eigentliche Wand:** Der
Kommentar über `SWEEP_BUDGET_MS` warnt, ein Kill träfe **vor** dem Abgleichs-
und Löschblock — „die Marge ist die Sicherheit dieses Projekts". Wer das
Budget anhebt, riskiert also nicht nur einen abgebrochenen Lauf, sondern einen
Lauf, der seine Bestandspflege nicht mehr erreicht.

### Warum mehrere Läufe — Rotation statt Wiederholung

Jeder Lauf beginnt an einer anderen Stelle der Regionsliste
(`sweepStartVersatz` + `rotiereAuswahl`). Der Startpunkt kommt **seit
2026-09-09 aus der Historie** (`sweep_region_runs`: die am längsten nicht
gesweepte Region zuerst), nicht mehr aus der Wanduhr. Monte-Carlo über 3.000
Durchläufe: volle Abdeckung in **5,7 statt 13,1 Tagen**, ohne einen einzigen
zusätzlichen Abruf. Der Cron läuft nominell alle drei Stunden
(`scrape.yml`, `0 */3 * * *`), real fallen **43 % der Termine aus** (A10).

### Warum die Datensätze nie einheitlich gefüllt sind — DER EIGENTLICHE BEFUND

**`erfasseImmoweltDetails` wird im Produktionslauf nirgends aufgerufen.**
Geprüft am 2026-09-20: Die Funktion existiert (`scrapers/immowelt/index.ts:701`),
ist vollständig ausgebaut (Aufwärmen, Consent, Referer, Drossel), und der
einzige Verweis darauf außerhalb ihrer selbst steht in einem **Kommentar** und
in `scripts/diagnose-detail.mts`. **Kein Produktionspfad ruft sie.**

Der Grund steht im Docstring darüber: Immowelt-Detailseiten (`/expose/`) sind
**von Rechenzentrums-Adressen gesperrt** (HTTP 403 mit Hülle statt Seite). Die
Funktion „bleibt stehen, weil sie von einem gewöhnlichen Anschluss aus
nachweislich funktioniert" — als Weg für den Fall, dass der Lauf je von einer
nicht gesperrten Adresse stattfindet.

**Folge:** Alle Immowelt-Angaben stammen aus der **Titelzeile der
Ergebnisliste** (`scrapers/immowelt/titelzeile.ts`). Was `ImmoweltDetailData`
alles könnte — `zipCode`, `rooms`, `yearBuilt`, `rentColdMonthly`,
`plotAreaM2`, `units`, `descriptionText`, `photoUrls` — kommt in der Produktion
**nie** an. Das ist die Wurzel von gleich vier Dingen, die anderswo als eigene
Befunde geführt werden:

| Sichtbare Folge | Zahl |
|---|---|
| Objekte ohne verortbare PLZ | 97,4 % (nur Bundesland) |
| Miete deshalb nur bundeslandgenau geschätzt | trägt 83 % des Bestands (A11) |
| `baujahr` gefüllt | 0,3 % |
| `einheiten` gefüllt | 0,5 % |
| leere Hüllen ohne jedes Feld | 352 (**B5**) |

**Die Inkonsistenz ist also kein Parser-Fehler, sondern eine Sperre.** Wer sie
„beheben" will, muss zuerst die Netzfrage beantworten, nicht den Code ändern.

### Was zu klären ist — und in welcher Reihenfolge

> ## SCHRITT 1 IST ERLEDIGT (2026-09-20): DIE SPERRE BESTEHT NICHT MEHR
>
> **Lauf `35535674960`** (`pruefung.yml`, Skript `diagnose-detail`,
> 2026-09-20 20:28 UTC, von einer GitHub-Actions-Adresse):
>
> ```
> Suchseite (/suche/):              brauchbar
> Frische Detailseiten (/expose/):  3 von 3 brauchbar
> Gegenprobe, 2 alte URLs vom 07.09.: beide HTTP 200 mit Datenmodell
> -> Die Sperre vom 2026-09-07 besteht in dieser Form NICHT mehr.
> ```
>
> **Fünf von fünf** `/expose/`-Abrufen lieferten HTTP 200 mit rund 607.000
> Zeichen und `__UFRN_LIFECYCLE_SERVERREQUEST__` im HTML. Am 2026-09-07
> scheiterten an derselben Stelle **144 von 144**.
>
> **Was das heißt:** Die Begründung, aus der `erfasseImmoweltDetails`
> ausgehängt ist, gilt nicht mehr. Damit ist der Weg zu einheitlich gefüllten
> Datensätzen offen — PLZ, Zimmer, Baujahr, Kaltmiete, Einheiten, Fotos.
> Das ist die Wurzel von 97,4 % ohne PLZ, 0,3 % mit Baujahr und der nur
> bundeslandgenauen Mietschätzung (A11).
>
> **Was das NICHT heißt.** Drei Dinge sind ausdrücklich ungeprüft:
> 1. **Eine Momentaufnahme ist keine Dauerhaftigkeit.** Fünf Abrufe mit 5 s
>    Abstand sagen nichts über 144 Abrufe am Stück. DataDome misst die
>    Abrufrate; die Sperre kann bei Menge zurückkommen.
> 2. **Der Parser ist damit nicht bestätigt.** Geprüft wurde nur, dass das
>    Datenmodell im HTML steht — nicht, dass `parseImmoweltDetailPage` es
>    heute noch richtig liest. Die Seite kann sich in zwei Wochen geändert
>    haben.
> 3. **Das Zeitbudget bleibt, wie es war.** 144 Detailseiten je Lauf bei 5 s
>    Drossel sind 12 Minuten — die Mengenfrage aus Schritt 2 ist dadurch
>    nicht beantwortet, nur die Netzfrage.
>
> **Der nächste Schritt ist ein Wiedereinhängen mit Messung, kein Vertrauen:**
> `erfasseImmoweltDetails` zurück in den Produktionspfad, dann EINEN Lauf
> beobachten — wie viele der 144 durchkommen, ab welcher Seite es kippt, ob
> der Parser Felder liefert. Erst danach gilt es als gelöst.

- [x] ~~**Schritt 1: Die Sperre neu prüfen, bevor irgendetwas gebaut wird.**~~ Der
      Docstring sagt ausdrücklich: „Vorher aber prüfen, ob die Sperre noch
      besteht, statt sie einfach wieder einzuhängen." Letzter Beleg ist der
      Live-Lauf vom **2026-09-07** — über zwei Wochen alt. Ein einziger
      `/expose/`-Abruf aus GitHub Actions beantwortet das.
> ## SCHRITT 2 IST ENTSCHIEDEN UND SCHRITT 3 IST GEBAUT (2026-09-20)
>
> **Die Entscheidung des Nutzers: 25 Detailseiten je Lauf, rund 4 Minuten.**
> Der erste Lauf ist eine Messung, kein Nachfüllen. Keiner der Wege (a) bis
> (d) unten wurde beschritten — Drossel, `SWEEP_BUDGET_MS` und
> `timeout-minutes` sind unangetastet. Die Marge sinkt von 25 auf rund
> 21 Minuten.
>
> **Die Rechnung dahinter:** Eine Immowelt-Seite kostet gemessen 8,7 bis
> 11,5 s — die 5 s Drossel sind nur ein Teil davon, die frühere Rechnung mit
> 5 s war um mehr als das Doppelte zu optimistisch. 25 Abrufe sind rund
> 4 Minuten.
>
> **Was gebaut wurde:** `erfasseImmoweltDetails` hängt wieder im
> Produktionspfad (`main.ts`, Konstante `MAX_DETAILS_IMMOWELT = 25`). Die
> neue reine Funktion `fuegeDetailHinzu`
> (`scrapers/immowelt/zusammenfuehren.ts`, 9 Tests) legt die Detailseite über
> die Titelzeile. Ihre Regel in einem Satz: **Ein `null` auf der Detailseite
> ist keine Aussage** und darf einen Wert der Titelzeile nicht löschen —
> sonst macht die Detailphase den Bestand ärmer statt reicher.
>
> **Die Phase ist gekapselt.** Bricht sie im Ganzen weg, kostet das Felder,
> nicht den Lauf: ZVG-Sweep, Bestandsabgleich und Löschblock bleiben
> erreichbar.
>
> **Die Messung liest man an einer Zeile ab:**
> `Immowelt-Detail: n von 25 Detailseiten gelesen.` Kommt dort 0, sagen die
> Zeilen darüber (`beurteileDetailAntwort`), ob es eine Sperre oder eine
> Strukturänderung war. **Erst diese Zahl rechtfertigt ein Anheben des
> Deckels** — und dann mit 11,5 s je Seite gerechnet, nicht mit 5.
>
> **Zwei Funde aus dem Bauen stehen in B8** und sind bewusst offen: Für
> Immowelt taugt `last_detail_at` nicht als Rückstandsfilter, und ein
> Vorrang nach fehlender PLZ braucht eine Abfrage, die es noch nicht gibt.
> Die Scheibe rotiert deshalb, statt gezielt aufzuholen.

- [x] ~~**Schritt 2: Die Entscheidung, die der Nutzer treffen muss.**~~ „Alle
      Inserate auf einmal" und „schlank" stehen in Spannung zueinander:
      22.000 Objekte bei 5 s Drossel sind rechnerisch über 30 Stunden. Die
      möglichen Wege — und alle haben einen Preis:
      **(a)** Drossel senken → CAPTCHA-Risiko, und ein CAPTCHA wird in diesem
      Projekt nicht gelöst;
      **(b)** Zeitbudget und `timeout-minutes` anheben → weniger Marge vor dem
      Löschblock, und Actions-Minuten sind zwar kostenlos (öffentliches Repo),
      ein Kill mitten im Lauf aber teuer;
      **(c)** Cron dichter takten (A10) → mehr Läufe statt längerer Läufe,
      ändert nichts an „alles auf einmal";
      **(d)** Detailseiten von einer nicht gesperrten Adresse holen → das ist
      die einzige Antwort auf „einheitliche Infos", und sie ist eine
      Infrastrukturfrage, keine Codefrage.
- [x] ~~**Schritt 3: Erst nach Schritt 1 und 2** einen Plan schreiben.~~
      Als bounded eingestuft und ohne Plandokument gebaut: Der Ablauf
      existierte bereits — `main.ts` macht für ZVG genau dasselbe —, und
      `erfasseImmoweltDetails` war fertig, nur ausgehängt.
> ## SCHRITT 4 IST GEMESSEN (2026-09-21): DIE DETAILSPERRE BESTEHT
>
> **Drei Produktionsläufe mit der neuen Phase, 75 Abrufe, alle HTTP 403.**
>
> | Lauf (UTC) | Sweep, gesehene Objekte | Detailseiten |
> |---|---|---|
> | 20.09. 21:35 (`35539155621`) | 641 — eingebrochen | **0 von 25** |
> | 20.09. 22:45 (`35542642397`) | 647 — eingebrochen | **0 von 25** |
> | 21.09. 01:56 (`35552491138`) | **6.807 — normal** | **0 von 25** |
>
> **Der dritte Lauf ist der entscheidende.** Sein Sweep lief einwandfrei —
> eine große Region, 6.807 Objekte, genau das normale Bild. Die Detailseiten
> blieben trotzdem zu 25 von 25 gesperrt. Damit ist die Sperre keine Folge
> eines schlechten Laufs, sondern steht für sich.
>
> **Die Momentaufnahme vom 2026-09-20, 20:28 (5 von 5 HTTP 200) war die
> Ausnahme, nicht die Regel.** Genau davor warnt der Kasten zu Schritt 1:
> „Fünf Abrufe mit 5 s Abstand sagen nichts über 144 am Stück." Die Warnung
> war richtig, und sie hat sich innerhalb eines Tages bestätigt.
>
> ### Was die Messung nebenbei gezeigt hat
>
> **Ein Sweep-Einbruch um den Faktor 7 lief ohne eine einzige Warnzeile
> durch.** Am 20.09. fiel die gesehene Menge von 4.789 (17:45) auf 644
> (19:52) und blieb zwei Läufe dort, bevor sie sich von selbst erholte. Das
> geschah **vor** dem Wiedereinhängen der Detailphase, hat also nichts mit
> ihr zu tun.
>
> **Die Löschwache hat gehalten** — `immowelt: Loeschung ausgesetzt
> (strukturell teilweise, erwartet) — Sweep war unvollständig`. Genau dafür
> ist sie gebaut, und sie hat unter echter Belastung funktioniert.
>
> **Aber sichtbar wurde der Einbruch nirgends.**
> `pruefeMengenplausibilitaet` steigt bei `!vollstaendig` sofort mit „Sweep
> war unvollständig" aus und kommt an ihren Mengenvergleich gar nicht heran.
> Für das Löschen ist das richtig (fail-closed), für das Bemerken nicht: Die
> Zahl 641 steht nur in einer Logzeile, die jemand lesen müsste. Als **B9**
> notiert.
>
> ### Was daraus folgt
>
> ### NACHTRAG, derselbe Tag: die Sperre haengt am Sweep davor
>
> Ein zweiter Diagnoselauf auf einem **frischen** Runner (`35578149964`,
> 21.09. 08:30 UTC, nur rund sechs Seitenabrufe insgesamt) lieferte **1 von 3**
> frischen Exposés mit HTTP 200. Zusammen mit dem Lauf vom Vortag:
>
> | Umgebung | Abrufe | HTTP 200 |
> |---|---|---|
> | Diagnose, frischer Runner | 10 | **6** |
> | Produktionslauf, nach vollem Sweep | 75 | **0** |
>
> **Sechs von zehn gegen null von 75.** Die Stichproben sind klein, der
> Unterschied ist es nicht: Bei einer Durchlassquote von 60 % wären null
> Treffer in 75 Abrufen praktisch ausgeschlossen.
>
> **Damit ist die Ursache eingegrenzt.** Die Sperre hängt nicht an der
> Uhrzeit (beide Diagnosen lagen zwischen Produktionsläufen), nicht an der
> URL-Form (identisch, am Log belegt) und nicht an der Detailphase selbst
> (der Einbruch begann davor). Sie hängt am **Ruf der Adresse**, den der
> Sweep mit seinen Hunderten Abrufen vorher verbraucht.
>
> **Das eröffnet einen Weg (e), den Schritt 2 nicht kannte:** die
> Detailphase aus dem Produktionslauf herausnehmen und in einen **eigenen
> Workflow** legen, der nichts anderes tut — aufwärmen, Detailseiten holen,
> schreiben. Kein Sweep davor, also ein unverbrauchter Runner. Er bleibt in
> GitHub Actions, braucht keine fremde Infrastruktur und kostet nichts.
>
> **Was dagegen spricht und vor dem Bauen zu klären ist:** Ein solcher Lauf
> hat keine Zusammenfassungen aus einem Sweep, muss seine URLs also aus
> `listings` holen und käme ohne `ImmoweltListSummary` aus — das ist ein
> anderer Einstieg in `erfasseImmoweltDetails`. Und 6 von 10 heißt auch:
> **vier von zehn scheitern weiterhin.** Der Weg macht die Sache möglich,
> nicht zuverlässig.
>
> ### WEG (e) IST GEBAUT (2026-09-21): DIE PHASE LÄUFT VOR DEM SWEEP
>
> **Entscheidung des Nutzers: in einem Lauf, nicht in einem zweiten
> Workflow.** Die Detailphase steht jetzt **vor** `sweepImmowelt` in
> `main.ts` — damit läuft sie auf demselben unverbrauchten Runner wie die
> Diagnose, ohne zweiten Workflow, ohne zweiten Schreiber auf dieselben
> Tabellen und ohne die Frage, was bei überlappenden Läufen geschieht.
>
> **Wer den Block verschiebt, macht ihn wirkungslos.** Das steht so auch im
> Code.
>
> **Zwei Dinge mussten dafür neu gebaut werden:**
>
> 1. **`ladeDetailRueckstand`** (`lib/bestandDb.ts`). Vor dem Sweep gibt es
>    keine Zusammenfassungen, die Kandidaten kommen also aus `listings` —
>    und das ist ohnehin der richtige Ort, denn der Rückstand liegt im
>    Altbestand. Sie liefert `externalId`, `url` **und** `fundort` in einer
>    Abfrage; der Fundort ist die Wache vor der Löschung und darf auf diesem
>    Weg nicht verloren gehen. Abgängige Objekte bleiben draußen.
> 2. **`kandidatAusDetail`** (`scrapers/immowelt/zusammenfuehren.ts`). Die
>    Detailscheibe wählt über alle 16 Regionen, der Sweep deckt eine einzige
>    ab — die meisten im Detail erfassten Objekte stehen gar nicht in der
>    Ergebnisliste dieses Laufs. Ohne diesen Weg wären fast alle Abrufe
>    umsonst gewesen. Steht ein Objekt doch in beiden, gewinnt weiterhin
>    `fuegeDetailHinzu` die Detailseite.
>
> **Möglich wurde das erst durch die Korrektur an `last_detail_at` (B8-1).**
> Vorher trug das Feld bei jedem Upsert einen Zeitstempel und taugte nicht
> als Rückstandsfilter; jetzt sagt es die Wahrheit, und der Rückstand baut
> sich ohne Wiederholungen ab.
>
> **Was das NICHT ist: ein Sieg über die Sperre.** Vier von zehn Abrufen
> scheitern weiterhin. Der Deckel von 25 hält den Preis eines schlechten
> Tages klein und bleibt zugleich die laufende Messung — die Logzeile
> `Immowelt-Detail: n von 25` ist weiterhin die Zahl, die man liest.
>
> **Weg (d) bleibt offen** — Detailseiten von einer nicht gesperrten Adresse
> — und wäre die Antwort, falls die 60 % nicht reichen.
>
> ### ERSTER LAUF MIT WEG (e): 0 VON 25 — UND NICHT AUSWERTBAR
>
> Lauf `35585454873` (2026-09-21): `Immowelt-Detail: 0 von 25 Detailseiten
> gelesen (Rueckstand insgesamt 9.747)`. Die Detailphase lief korrekt vor dem
> Sweep, auf frischem Runner — und bekam trotzdem 25-mal HTTP 403.
>
> **Der Lauf taugt aber nicht als Widerlegung.** Im selben Log steht
> `Immowelt: 590 von 644 gesehenen Objekten` — 644 statt der 4.800 bis 6.800
> eines gesunden Laufs. Immowelt machte zum Messzeitpunkt generell dicht, so
> wie am Vorabend. Die Reihenfolge-Hypothese ist damit **weder bestätigt noch
> widerlegt**; der Test fand unter Blockade statt und ist zu wiederholen,
> wenn der Sweep wieder normale Mengen sieht.
>
> **Zwei Unterschiede zur erfolgreichen Diagnose, bisher übersehen:**
>
> 1. **Die Herkunft der URL.** `diagnose-detail` holt die Exposé-URLs
>    **frisch aus der Suchseite, die es gerade geladen hat**. Weg (e) nimmt
>    sie aus `listings` — teils tagealt, und ihr `search=`-Parameter stammt
>    aus einer fremden, längst beendeten Sitzung.
> 2. **Der Referer passt nicht zur Seite.** Die Diagnose wärmt an genau der
>    Liste auf, aus der die URL stammt. `erfasseImmoweltDetails` wärmt an
>    einer festen `AUFWAERM_URL` auf, während die Exposé-URL aus einer
>    beliebigen anderen Region kommt.
>
> **Beides ist Rätselraten um einen Bot-Schutz** und deshalb kein guter Ort,
> um weiter Zeit zu investieren. Die Diagnose `diagnose-netz` prüft
> stattdessen, ob wir die PLZ überhaupt brauchen.

- [ ] **Schritt 4, neu: Die Messung lesen.** Nach dem ersten Produktionslauf
      mit der neuen Phase die Zeile `Immowelt-Detail: n von 25` auswerten und
      hier festhalten. Davon hängt ab, ob der Deckel steigt, ob der Parser
      nachgezogen werden muss und ob B8 überhaupt lohnt.

**Hängt zusammen mit:** A10 (Cron-Takt), A11 (Mietschätzung — die
Bundeslandstufe existiert nur, weil die PLZ fehlt), B1 (Löschhoheit braucht
vollständige Regionsläufe), B5 (die leeren Hüllen).

**Vorsicht, eine Falle:** „Alle Inserate in einem Lauf" klingt wie eine reine
Mengenfrage, ist aber auch eine Sicherheitsfrage. Die Vollständigkeit eines
Regionslaufs ist die **Wache vor der Massenlöschung** (B1). Ein Lauf, der mehr
schafft, verschiebt auch, wann gelöscht werden darf.

---

## B7. Zwei Befunde aus dem Oberflächen-Audit, die nicht in den Kartenplan gehörten

**Herkunft:** Task 10 des Kartenplans, 2026-09-20. Beide sind belegt, beide
sind bewusst nicht dort behoben worden — sie berühren Dinge außerhalb des
Plans.

**B7-1: Der Filterzustand steht nicht in der URL.** Bundesländer, PLZ-Bereiche,
Stufen, Spannen, aufgeklappte Bereiche — alles lebt nur in `useState`. Folgen:
Eine Auswahl lässt sich niemandem schicken, ein Neuladen wirft sie weg, und
der Zurück-Knopf des Browsers verlässt die Seite statt den Filter zu lösen.
Betroffen sind `App.tsx` (Zustand `filter`, `offen`, `kartengroesse`) und
`logik/filter.ts` (`Filter`-Typ, `LEERER_FILTER`). **Erster Schritt ist ein
Entwurf, kein Umbau:** Welche Felder gehören in die URL, wie kurz darf sie
bleiben, und was passiert mit einer URL, deren Filter nichts mehr trifft.

**B7-2: `title`-Attribute tragen Erklärungen, die Touch und Tastatur nicht
erreichen.** In `Objektzeile.tsx` hängen an Kaufpreisfaktor, Stufenabzeichen
und Zustandsmarke `title`-Attribute; auf einem Fingergerät erscheint dort nie
etwas, und für die Tastatur ist es unzuverlässig. Seit Task 9 gibt es ein
eigenes, sofortiges Tooltip-Element (`ui/KartenTooltip.tsx`) — die Frage ist,
ob es sich von der Karte lösen und allgemein verwenden lässt, ohne dass die
Zeile ihr Memo verliert (sie wird 18.000-fach gezeichnet).


## B8. Zwei Funde aus dem Wiedereinhängen der Immowelt-Detailphase

**Herkunft:** B6 Schritt 3, 2026-09-20. Beide sind belegt, beide sind bewusst
nicht sofort behoben worden — sie hätten die Messung aufgehalten, um die es
bei B6 gerade geht.

**B8-1: `last_detail_at` sagt bei Immowelt nicht die Wahrheit.**
`listingUpsertZeile` (`scraper/lib/db.ts`) setzt `last_detail_at` bei **jedem**
Upsert auf jetzt. Der Schalter `detailGelesen`, den
`upsertListingOhneBewertung` dafür anbietet, greift deshalb nur auf dem
preislosen Pfad — `upsertListingAndVersion` überschreibt das Feld ohnehin.
Jedes bewertete Immowelt-Objekt sieht damit „frisch im Detail erfasst" aus,
obwohl bis zum 2026-09-20 nie eine Detailseite gelesen wurde.

**Folge:** `ladeVeralteteExternalIds` ist für Immowelt kein brauchbarer
Rückstandsfilter. Die neue Detailscheibe in `main.ts` wählt aus genau diesem
Grund per Rotation statt per Alter — das läuft über den ganzen Bestand, aber
langsam und ohne Vorrang für die Objekte, denen am meisten fehlt.

**Vorsicht beim Beheben:** Das Feld hängt an der Detailbudgetierung von ZVG.
Wer es richtigstellt, prüft zuerst, ob ZVG-Objekte dadurch in jedem Lauf
erneut geholt werden.

**B8-2: `zip_code` liegt auf `listing_versions`, nicht auf `listings`.** Der
saubere Vorrang für die Detailphase wäre „hole die Objekte, die noch keine
PLZ haben" — der eigentliche Rückstand, 97,4 % des Bestands. Diese Auswahl
braucht eine Abfrage über die **jeweils neueste** Version je Listing, die es
heute nicht gibt. Erst mit ihr holt die Detailphase gezielt auf, statt zu
rotieren.

**Reihenfolge:** Beides lohnt erst, wenn die Messung aus B6 sagt, dass die
Detailphase überhaupt trägt. Ein Vorrang für Objekte, deren Seiten alle
abgewiesen werden, wäre nur ein schnellerer Weg ins Nichts.


## B9. Ein Mengeneinbruch um den Faktor 7 erzeugt keine Warnung

**Herkunft:** B6 Schritt 4, 2026-09-21.

**Der Vorfall:** Am 2026-09-20 fiel die vom Immowelt-Sweep gesehene Menge von
**4.789** (17:45 UTC) auf **644** (19:52) und blieb über drei Läufe dort,
bevor sie sich von selbst erholte (6.807 am 21.09., 01:56). Jede der 16
Regionen war binnen vier Minuten „abgearbeitet" — die Signatur eines
Soft-Blocks auf der Ergebnisliste, nicht eines leeren Marktes.

**Was gut war:** Die Löschwache hat gehalten. Im Log steht
`immowelt: Loeschung ausgesetzt (strukturell teilweise, erwartet) — Sweep war
unvollständig`. Kein einziges Objekt wurde fälschlich als Abgang markiert.
Genau dafür ist die Fail-closed-Umstellung gebaut, und sie hat unter echter
Belastung funktioniert.

**Was fehlt:** Es gab **keine Warnzeile**. `pruefeMengenplausibilitaet`
(`lib/plausibilitaet.ts`) prüft als Erstes `!vollstaendig` und kehrt sofort
mit „Sweep war unvollständig." zurück — der Mengenvergleich dahinter wird bei
Immowelt nie erreicht, weil `vollstaendig` dort strukturell hart `false` ist.
Für die Löschentscheidung ist das richtig. Für das **Bemerken** ist es eine
Lücke: Die 641 stehen in einer Logzeile, die jemand lesen müsste.

**Vorsicht bei der Behebung:** Die Wache darf ihre Reihenfolge **nicht**
ändern — „unvollständig" muss weiterhin zuerst und fail-closed greifen. Eine
Warnung ist etwas anderes als eine Erlaubnis, und beides in dieselbe Funktion
zu legen wäre genau die Vermischung, die B-2 aufgeräumt hat. Der Ort ist eher
eine eigene, rein meldende Prüfung gegen die Sweep-Historie, die es mit
`ladeSweepHistorie` schon gibt.

**Offen ist auch die Schwelle.** Faktor 7 ist eindeutig, aber der normale Lauf
schwankt von Natur aus stark: 4.789 gegen 6.807 sind beides gesunde Läufe, je
nachdem, welche Region die Rotation erwischt. Eine Warnung, die das nicht
berücksichtigt, meldet ständig — und eine Warnung, die 94 % der Läufe trägt,
warnt vor nichts (die Lehre aus 3.6).


## B10. Gemessen: Immowelt liefert nichts Reicheres, das wir wegwerfen

**Herkunft:** 2026-09-21. Die Frage hinter B6, gestellt bevor weiter an der
Detailsperre gedreht wird: **Brauchen wir die Detailseiten überhaupt?**

**Die Vermutung war:** Der Sweep lädt die Ergebnisliste mit einem echten
Browser, und Immowelt lädt Seite 2+ clientseitig über `classified-search`
bzw. `serp-bff/search` nach. Diese Antworten fliegen ohnehin durch unseren
Browser. Trügen sie PLZ und Gesamttrefferzahl, wären B6 (einheitliche
Daten), A11 (bundeslandgenaue Miete) und A16 (Vollständigkeitsmaßstab für
`nw`, `bw`, `mv`, `sh`) auf einen Schlag erledigt — ohne einen einzigen
zusätzlichen Abruf und ohne die robots.txt-Abwägung anzufassen, denn das
Skript **hört nur zu**.

**Gemessen** mit `scraper/scripts/diagnose-netz.mts` (Lauf `35587430113`,
Nordrhein-Westfalen — größte Region und eine der vier ohne Trefferzahl im
Titel):

```
Antworten aufgefangen:       58
davon Kerndienst MIT Inhalt: 12
classified-search:           HTTP 200, 1.030.989 Zeichen
Typ:                         text/html; charset=utf-8
Anfang:                      "<!DOCTYPE html>
<html lang=\"de\">..."
PLZ im Kerndienst:           nein
Trefferzahl im Kerndienst:   nein
```

**DER BEFUND: `classified-search` ist kein Datendienst.** Es liefert die
fertig gerenderte Seite 2 als HTML — genau das, was
`parseImmoweltListPage` ohnehin schon verarbeitet. Es gibt nichts
Reicheres mitzulesen, weil es nichts Reicheres gibt.

**Folge:** Die Titelzeile der Ergebniskarte ist nicht eine von mehreren
Quellen, sondern **die einzige**, die der erlaubte Weg hergibt. Damit ist
belegt, was bisher nur angenommen war:

- **B6** („einheitliche Infos ganzheitlich auslesen") ist endgültig eine
  **Infrastrukturfrage**, keine Codefrage. Nur die Detailseite trägt PLZ,
  Baujahr und Kaltmiete, und sie ist von Rechenzentrums-Adressen
  überwiegend gesperrt.
- **A16** bekommt seine Trefferzahl auch aus der Nachladeantwort nicht. Der
  zweite Vollständigkeitsmaßstab bleibt nötig.
- **A11** (bundeslandgenaue Mietschätzung) hat keinen billigen Ausweg.

**Unabhängig gegengeprüft** mit `diagnose-liste` (Lauf `35587691307`,
Bremen, anderes Skript, andere Region):

```
Seite: 1.593.158 Zeichen
Fuenfstellige Zahlen im Seiten-HTML: keine
PLZ-Pfade im Datenmodell (35 Knoten durchsucht): keine gefunden
```

**Zwei Skripte, zwei Regionen, rund 2,6 Millionen Zeichen HTML — keine
einzige fünfstellige Zahl.** Das ist kein Messfehler, sondern die
Seitenarchitektur: Preise tragen einen Tausenderpunkt („75.000"), Kennungen
sind UUIDs, und eine PLZ steht schlicht nirgends. Nebenbei zeigt die
Gegenprobe, dass das Datenmodell der Suchseite mit **35 Knoten** praktisch
leer ist — anders als das der Detailseite.

**Was der Lauf NICHT sagt:** Er hat eine Region zu einem Zeitpunkt gemessen.
Ändert Immowelt seine Seitenarchitektur auf einen echten JSON-Dienst, lohnt
die Frage erneut — das Skript liegt dafür im Repo.

**Die Falle, die dieser Spike gekostet hat, steht in der Übergabe:** Der
erste Lauf meldete ein sauber aussehendes „PLZ: nein / Trefferzahl: nein"
über **0 gelesene Zeichen**, weil der Körper nur bei
`content-type: json` geholt wurde. Das Skript hat deshalb jetzt eine Wache,
die ausdrücklich `NICHT GEMESSEN` meldet statt `nein`.


## B11. Die Bewertung ist nebenläufig — der Deckel wartet auf die Messung

**Herkunft:** 2026-09-21, Commit `39616c5`.

**Das gemessene Problem:** Ein bewertetes Objekt kostet rund **0,6 s**, und
fast alles davon ist Warten. `upsertListingAndVersion` macht drei
Datenbankrunden nacheinander bei rund 100 ms Umlaufzeit. Auf den Deckel von
600 gerechnet sind das sechs Minuten — **mehr als der Sweep selbst braucht**
(Lauf `35539155621`: Sweep 4 min, Bewertung 6 min).

**Was das kostet, und zwar nicht an Zeit:** Bei 600 Bewertungen je Lauf,
real 4,5 Läufen am Tag und über 23.000 Objekten im Bestand wird ein Objekt
nur alle **8,5 Tage** neu bewertet. So spät fällt eine Preissenkung auf — bei
einem Werkzeug, dessen Kernversprechen Preissenkungen sind.

**Gebaut:** Rechnen und Schreiben laufen zu `BEWERTUNGSBREITE` (6)
gleichzeitig, der **Meldeteil** unverändert streng nacheinander. Zwischen
`darfSenden` und `verbuchen` liegt ein Telegram-Versand; zwei parallele
Meldungen sähen dasselbe freie Kontingent.

- [x] **Schritt 1: Lauf `35588951096` ausgewertet (2026-09-21).** Zwei Läufe
      eine Stunde auseinander, mit praktisch gleicher Last — 644 gegen 645
      gesehene Objekte, je 600 ausgewählt:

      | | Lauf `35585454873` (nacheinander) | Lauf `35588951096` (nebenläufig) |
      |---|---|---|
      | Bewertung allein | **5 min 22 s** für 590 Objekte | **1 min 04 s** für 588 Objekte |
      | je Objekt | 0,55 s | **0,11 s — Faktor 5,0** |
      | Sweep allein | 4 min 15 s | 4 min 16 s (unverändert, Kontrolle) |
      | `Kandidat fehlgeschlagen` | 0 | **0** |
      | Meldungen | 3 von 25 | **1 von 25** |
      | ganzer Lauf | rund 14 min | **9 min 42 s** gegen `timeout-minutes: 75` |

      Der unveränderte Sweep ist die Kontrolle: Nur die Bewertungsphase hat
      sich bewegt, nicht der Runner und nicht die Gegenseite.

- [x] **Schritt 2: `MAX_BEWERTUNGEN_IMMOWELT` von 600 auf 3.000 angehoben.**
      Die Grenze ist nicht „so viel wie möglich", sondern **die bereits
      belegte Zeit**: 3.000 × 0,11 s ≈ 5,5 min — genau so lange, wie die
      Bewertung vor der Nebenläufigkeit für 600 Objekte brauchte. Der Lauf
      wird dadurch nicht länger als der längste bisherige (50 min gegen 75).
      **Wirkung:** ein Objekt wird statt alle 8,5 Tage alle **1,7 Tage** neu
      bewertet.

- [ ] **Schritt 3: Unter normaler Sweep-Menge nachmessen.** Die 0,11 s je
      Objekt sind an rund 590 Objekten gemessen, nicht an 3.000 — Immowelt
      lieferte an diesem Tag nur 645 statt der üblichen rund 6.800. Der
      Deckel von 3.000 hat deshalb **noch gar nicht gegriffen**. Erst ein
      Lauf mit normaler Menge zeigt, ob die Kosten je Objekt gleich bleiben.
      Rechnung: Bewertungsdauer geteilt durch bewertete Objekte. Deutlich
      über 0,11 s heißt: Supabase ist der Engpass, nicht die Rundenzahl —
      dann `BEWERTUNGSBREITE` prüfen, nicht den Deckel.

**Der Rückweg ist eine Zahl:** `BEWERTUNGSBREITE = 1` ergibt exakt das alte
Verhalten. Kein Umbau nötig.

**Vorsicht beim Anheben der Breite:** Die Gegenseite ist hier die eigene
Datenbank, nicht ein fremdes Portal — es gibt keine Drossel zu beachten.
Aber Supabase deckelt gleichzeitige Anfragen, und ein Lauf, der in sein Limit
rennt, ist teurer als einer, der eine Minute länger braucht.

## B12. ZVG ohne Browser — belegt, aber bewusst nicht umgesetzt

**Herkunft:** 2026-09-21, aus der Arbeit am ZVG-Link.

**Der Fund:** Die ZVG-Terminsuche läuft **ohne Browser** per einfachem
HTTP-POST gegen `index.php?button=Suchen`. Zwei Felder genügen —
`land_abk` und `plz`; `obj=4` filtert auf Mehrfamilienhäuser. Verifiziert
ohne Referer, mit fremdem Referer und mit Origin-Header.

**Warum es trotzdem nicht umgesetzt wird:**

| | |
|---|---|
| ZVG-Anteil an der Laufzeit | **52 s von 11 min — 8 %** |
| möglicher Gewinn | höchstens ~30 s |
| berührt | die **einzige Quelle mit Löschhoheit** |

Das ist das schlechteste Verhältnis von Gewinn zu Risiko im Projekt. Der
Browser wird für Immowelt ohnehin gestartet; ZVG teilt ihn sich nur.

**Wann es sich lohnen würde:** Falls Immowelt je ganz wegfällt und ZVG die
einzige Quelle wird — dann spart der Verzicht auf Playwright den ganzen
Browserstart. Vorher nicht.

**Offen und ungeprüft:** Die Paginierung per POST. `&seite=` allein
genügt nicht; das JavaScript der Seite reicht zusätzlich `l`, `r` und
`all` mit, deren Herkunft nicht untersucht wurde.


# Teil C — Bewusst zurückgestellt

Aus früheren Entwürfen, mit Begründung. Nur auf ausdrücklichen Wunsch.

| Punkt | Warum zurückgestellt |
|---|---|
| **Ertragswertverfahren nach ImmoWertV** statt der 6-%-Näherung | Braucht Bodenrichtwerte. Die laufen je Bundesland über ein eigenes BORIS-Portal, uneinheitlich, meist ohne API. 16 Anbindungen lohnen erst, wenn sich die Näherung als zu ungenau erweist. |
| **Konfigurierbare Schwellen** (heute fest 15 / 1,3) | Gehört zur Bewertungslogik, nicht zur Bestandsführung. |
| **„Wieder da"-Meldung** bei Rückkehr in der Karenz | Die Meldehistorie verhindert Doppelmeldungen ohnehin; zusätzliche Nachrichten wären Rauschen. |
| **Retry mit Backoff** innerhalb eines Laufs | Der Cron ist das Wiederholungsintervall — nominell alle drei Stunden, gemessen alle ~5 h (43 % der Termine fallen aus, A10). Das verlängert die Wiederholung, ersetzt sie aber nicht. |
| **Rückwirkendes Nacherfassen** übersprungener Immowelt-Objekte | Der `data_gaps`-Retrofit wirkt nur auf künftige Scans. |
| **Gebots-Schätzformel** (Verkehrswert × Annahmefaktor) für ZVG | Erfundene Zahl auf erfundener Zahl. |
| **PDF-Extraktion** der amtlichen Bekanntmachung | Die HTML-Detailseite liefert dieselben Kerninhalte als Text. |
| **Umkreis-Filterung, feste Preisobergrenze** | Nie angefordert. |
| **ImmoScout24 über bezahlten Anti-Bot-/Proxy-Dienst** | Verstößt gegen die Projektvorgabe. |
| **Automatisierte Kontaktaufnahme** mit Verkäufern | Nicht gewollt. |
| **Sitemap-Umbau für Immowelt** (8.901 Ortsseiten) | **Am 2026-09-08 hinfällig:** Blättern funktioniert, `classified-search` und `serp-bff/search` antworten mit HTTP 200. Der Befund war eine Fehldiagnose der Overlay-Blockade. |
