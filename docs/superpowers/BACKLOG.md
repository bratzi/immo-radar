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

## A13. „39 von 600 ohne Preis" ist die Quelle, nicht der Parser

**Untersucht am 2026-09-08** für Abnahmekriterium A-4. Der Verdacht lautete
Parserfehler in der Titelzeile. **Er ist stark entkraeftet, aber nicht
abschliessend bewiesen** — und der Grund dafuer ist genau der A-4-Verstoss:
Die 39 Titelzeilen sind nirgends gespeichert. Der `continue` steht vor jedem
Schreibzugriff, `sweep_runs` haelt nur Zaehlwerte.

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
- [ ] **Schritt 2 — Entscheidung des Nutzers, wie A-4 dauerhaft erfuellt wird:**
      **(a)** eine `listings`-Zeile ohne `listing_versions`-Zeile anlegen —
      ohne Schemaaenderung, das Objekt bleibt sichtbar und taucht im Abgleich
      auf, wird aber nicht bewertet. Beruehrt `bestandDb.ts` und damit die
      Loeschwachen. **(b)** `price_cents` nullbar machen plus Lueckencode
      `preis_auf_anfrage` analog zu `wohnflaeche_fehlt` — sauber, aber eine
      **Migration auf Produktionsdaten** und sie beruehrt jede Metrik, die
      `priceCents / 100` rechnet (`pipeline.ts:270`).
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

**Abnahme:** Nach Schritt 1 zeigt ein Lauf die echten Titelzeilen, und die
Klassifikation „Quelle nennt keinen Preis" gegen „Parser hat versagt" steht
mit Zahlen fest. A-4 gilt erst mit Schritt 2 als erfuellt: Ein Objekt ohne
Preis ist nach dem Lauf noch auffindbar.

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

---

## A16. Ein zweiter Vollständigkeitsmaßstab für Regionen ohne ausgewiesene Menge

**Entsteht aus dem A15-Befund** und ist die Voraussetzung für B1, seit
feststeht, dass `nw`, `bw` und `mv` ihre Trefferzahl nie nennen.

**Das Problem:** `istRegionVollstaendig` misst die eingesammelte Menge gegen
die vom Portal gemeldete. Nennt das Portal keine, ist die Region fail-closed
unvollständig — richtig, aber dauerhaft. Die drei größten Regionen sammeln so
nie Referenzläufe an.

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
Voraussetzung:** `nw`, `bw` und `mv` zählen erst wieder mit, wenn ihre
Trefferzahl parst.

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
| **Retry mit Backoff** innerhalb eines Laufs | Der Cron ist das Wiederholungsintervall — nominell alle drei Stunden, gemessen alle ~5 h (43 % der Termine fallen aus, A10). Das verlängert die Wiederholung, ersetzt sie aber nicht. |
| **Rückwirkendes Nacherfassen** übersprungener Immowelt-Objekte | Der `data_gaps`-Retrofit wirkt nur auf künftige Scans. |
| **Gebots-Schätzformel** (Verkehrswert × Annahmefaktor) für ZVG | Erfundene Zahl auf erfundener Zahl. |
| **PDF-Extraktion** der amtlichen Bekanntmachung | Die HTML-Detailseite liefert dieselben Kerninhalte als Text. |
| **Umkreis-Filterung, feste Preisobergrenze** | Nie angefordert. |
| **ImmoScout24 über bezahlten Anti-Bot-/Proxy-Dienst** | Verstößt gegen die Projektvorgabe. |
| **Automatisierte Kontaktaufnahme** mit Verkäufern | Nicht gewollt. |
| **Sitemap-Umbau für Immowelt** (8.901 Ortsseiten) | **Am 2026-09-08 hinfällig:** Blättern funktioniert, `classified-search` und `serp-bff/search` antworten mit HTTP 200. Der Befund war eine Fehldiagnose der Overlay-Blockade. |
