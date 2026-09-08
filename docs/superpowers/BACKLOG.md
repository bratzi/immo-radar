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
- [~] **Schritt 3 — Teil 2 erledigt, Teil 1 und 3 offen.** Zu reparieren ist
      nicht das Lesen, sondern der Umgang mit dem Fehlen.
      1. **OFFEN — ist ein Objekt ohne Verkehrswert bewertbar?** Ohne
         Vergleichsmaßstab gibt es keine Kennzahl und keine Meldung. Es
         konsequent wie `wohnflaeche_fehlt` zu behandeln — speichern und die
         Lücke sichtbar machen, statt es fallen zu lassen — würde
         `price_cents` nullbar verlangen, also eine Schemaänderung. Das ist
         eine Entscheidung des Nutzers, keine Aufräumarbeit.
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

- [ ] **Schritt 1:** Entscheiden, ob der Cron dichter getaktet wird.
- [ ] **Schritt 2:** Falls ja, danach messen, ob die Ausfallquote sinkt und ob
      Immowelt haerter drosselt.

**Abnahme:** Die Annahme „alle drei Stunden" steht nirgends mehr unwidersprochen
im Repo.

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
