# B5 — Die leeren Hüllen: Befund vom 2026-09-20

**Untersuchung, kein Umbau.** Kein Produktionscode geändert, kein Live-Abruf.
Grundlage: der Code im Repo, die Git-Historie und
`web/public/dashboard-snapshot.json` (erzeugt 2026-09-18T21:12:27Z, 21.897
Objekte). Jede Zahl unten ist an diesem Snapshot nachgerechnet.

> **Die Kurzfassung:** Es ist keine Sperre, kein Parserfehler und keine
> Regression. Es ist eine **bewusste Entscheidung des Nutzers vom 2026-09-11**,
> umgesetzt am 2026-09-12 (`ea8b731`) und 2026-09-13 (`dd0b81b`): Ein Objekt
> ohne Preis bekommt eine `listings`-Zeile **ohne** `listing_versions`-Zeile.
> Genau diese fehlende Version ist die leere Hülle. Der einzige echte Mangel:
> Die Titelzeile wird beim Schreiben **verworfen**, obwohl sie Lage, Zimmer,
> Wohnfläche und Grundstück enthält.

---

## Frage 1 — Welcher Codepfad legt ein Objekt ohne Titel und ohne Ort an?

**Nicht `list.ts`, nicht `titelzeile.ts`.** Beide sind unschuldig:

- `scraper/scrapers/immowelt/list.ts:36` — `if (!href || !title) return;`.
  Eine Karte **ohne** `title`-Attribut wird gar nicht erst aufgenommen. Ein
  Treffer aus `parseImmoweltListPage` hat per Konstruktion eine nicht-leere
  `titleLine`.
- `scraper/scrapers/immowelt/index.ts:415` — zusätzlich muss
  `istMehrfamilienhausKandidat(karte.titleLine)` greifen
  (`list.ts:20`, `/^(Mehrfamilienhaus|Zinshaus|Wohn- und Geschäftshaus)/i`).
  Die Titelzeile ist also nicht nur vorhanden, sondern wohlgeformt.

**Der Pfad ist `main.ts` → `upsertListingOhneBewertung`:**

| Stelle | Was passiert |
|---|---|
| `scraper/main.ts:427` | `const werte = werteAusTitelzeile(zusammenfassung.titleLine)` |
| `scraper/main.ts:430` | `if (werte.preisCents === null) { … }` |
| `scraper/main.ts:452` | `await upsertListingOhneBewertung(sb, { source: "immowelt", externalId, url, fundort })` |
| `scraper/main.ts:463` | `continue` — **`werte` wird nie wieder angefasst** |
| `scraper/lib/db.ts:161–182` | schreibt **nur** in `listings`, kein `listing_versions` |
| `scraper/lib/snapshot.ts:626–659` | `if (version === null)` → `titel: null, ort: null, bundesland: null, plz: null`, alle Kennzahlen `null` |

**Beide Quellen, aber sehr ungleich verteilt.** Der ZVG-Zwilling steht in
`scraper/main.ts:552` (`zvgDetails.ohneVerkehrswert`, `detailGelesen: true`),
eingeführt in `dd0b81b`. Gemessen im Snapshot: **347 Immowelt, 3 ZVG.**

**Fundstelle der Entscheidung:** `ea8b731` (2026-09-12), Commit-Text wörtlich:
„Entscheidung des Nutzers vom 2026-09-11: eine listings-Zeile ohne
listing_versions-Zeile." Der Docstring über `upsertListingOhneBewertung`
(`lib/db.ts:140–160`) begründet dasselbe noch einmal.

## Frage 2 — Woran genau scheitert es?

**Die Ergebnisliste liefert sehr wohl etwas. Der Parser wirft nichts weg. Der
Schreibpfad wirft etwas weg.**

Zerlegt:

1. **Die Titelzeile existiert.** Sonst wäre das Objekt nie durch `list.ts:36`
   und `index.ts:415` gekommen.
2. **Was fehlt, ist allein der Preis.** `werteAusTitelzeile` liefert
   `preisCents === null`, wenn kein `€` im Titel steht („Preis auf Anfrage")
   oder das `€` da ist, aber `PREIS` (`titelzeile.ts:63`) nicht greift.
   Der Code unterscheidet beide Fälle sauber
   (`ermittleLueckencodeOhnePreis`, `titelzeile.ts:131`) — **aber nur im
   Protokoll** (`main.ts:441`). In die Datenbank kommt der Lückencode nicht.
   **Am Bestand lässt sich daher heute nicht ablesen, welcher der beiden
   Fälle vorliegt.** Das ist die einzige Stelle, an der der Code
   Informationen verliert, die er schon hat.
3. **Der Rest der Titelzeile wird ebenfalls verworfen.** `werte.lage`,
   `werte.wohnflaecheM2`, `werte.grundstueckM2`, `werte.zimmer` sind an
   `main.ts:427` berechnet und werden an `main.ts:452` nicht übergeben —
   `upsertListingOhneBewertung` nimmt diese Felder gar nicht entgegen
   (`db.ts:163–175`).
4. **Die PLZ ist kein Sonderfall dieser 350.** Der Docstring
   `titelzeile.ts:17–21` sagt: Die Postleitzahl steht weder im Seiten-HTML
   noch im Datenmodell der Suchseite. Gemessen: **21.673 von 21.897 Objekten
   (99,0 %) haben keine PLZ**, nicht nur die Hüllen.

**Mechanistische Gegenprobe, die den „kein Preis"-Befund bestätigt:** Alle
Immowelt-URLs tragen `order=PriceAsc` (21.701 von 21.703). Preislose Inserate
sortiert das Portal damit ans Ende. Und genau dort liegen die Hüllen:

| | Median `page`-Parameter | min | max |
|---|---|---|---|
| alle Immowelt-Objekte (n = 20.634 mit Parameter) | **40** | 2 | 173 |
| leere Hüllen (n = 331 mit Parameter) | **117** | 9 | 169 |

Zur Kontrolle, dass `PriceAsc` wirklich wirkt — Medianpreis je Seitenblock in
der größten Region (`AD04DE8`, 3.389 Objekte): Seiten 0–19 348.000 €, 20–39
459.000 €, 40–59 575.000 €, 60–79 699.000 €, 80–99 899.500 €, 100–119
1.490.000 €. Streng monoton. Die Hüllen sitzen hinter dem Preisband, weil sie
keinen Preis haben — nicht, weil eine Seite kaputt war.

**Damit ist der im Backlog notierte Verdacht widerlegt:** „`/expose/`-Detail-
seiten sind gesperrt, eine Zeile, die nur aus einer Expose-URL besteht, passt
zu diesem Muster." Sie passt zwar, aber die Ursache ist eine andere. Für diese
350 Objekte wurde **nie eine Detailseite abgerufen** — `main.ts:452` übergibt
kein `detailGelesen`, `db.ts:180` setzt `last_detail_at: null`. Die Sperre aus
B6 ist der Grund, warum **alle** Immowelt-Objekte dünn sind; sie ist nicht der
Grund, warum **diese** leer sind.

## Frage 3 — Ist das eine Regression?

**Nein, und das lässt sich diesmal belegen — nicht über den Snapshot, sondern
über die Historie.**

`git log -S"upsertListingOhneBewertung"` kennt genau zwei Commits:

- `ea8b731` (2026-09-12) — „feat(a4): ein Objekt ohne Preis bekommt eine Zeile
  **statt eines continue**"
- `dd0b81b` (2026-09-13) — dasselbe für ZVG ohne Verkehrswert

**Vor dem 2026-09-12 gab es diese Zeilen nicht**, weil solche Objekte
kommentarlos übersprungen wurden. Die leeren Hüllen sind also kein Verlust
gegenüber früher, sondern das **beabsichtigte Gegenteil**: Abnahmekriterium
A-4 verlangt, dass ein Objekt nach dem Lauf auffindbar bleibt. Vorher fiel es
spurlos durch.

Das passt auch zum Alter im Snapshot: kein Objekt mit `zuletztGesehen` vor dem
2026-09-13, und die Masse sehr frisch (siehe Frage 4) — erwartbar, da jeder
Lauf höchstens `MAX_BEWERTUNGEN_IMMOWELT = 600` Objekte überhaupt ansieht
(`main.ts:145`) und die Rotation den Rest erst später einholt.

**Der E-7-Vergleich bleibt ungültig, und zwar aus einem zusätzlichen Grund**,
der im Backlog noch nicht steht: siehe „Was nicht belegt ist".

## Frage 4 — Welche Quelle haben die Hüllen? Zahlen.

**Vorbemerkung zur Zahl 352.** Sie ist im Backlog der Definition „ohne Titel,
ohne Ort, ohne PLZ" zugeordnet. Nachgerechnet trifft sie diese Definition
nicht:

| Definition | Anzahl |
|---|---|
| `titel`, `ort` **und** `plz` alle `null` | **350** |
| `titel === null` (allein) | **350** |
| `bundesland === null` **und** `plz === null` | **352** |
| `bundesland === null` **und** `ort === null` | **352** |
| `bundesland === null` (allein) | **356** |

Die 352 aus dem Backlog sind also „ohne Bundesland und ohne Ort". **Die echten
Hüllen sind 350**; 2 weitere Objekte haben einen Titel, aber kein Bundesland.
Der Unterschied ist klein, die Verwechslung aber genau die Sorte, die dieses
Projekt schon einmal korrigiert hat.

**Die 350 im Detail** (alle Werte gemessen, nicht geschätzt):

| Merkmal | Verteilung |
|---|---|
| Quelle | Immowelt **347**, ZVG **3** |
| Anteil am Bestand | 350 / 21.897 = **1,60 %** |
| Anteil an Immowelt | 347 / 21.703 = **1,60 %** |
| Zustand | verfügbar 171, unbestätigt 170, abgängig 9 |
| Zustand × Quelle | immowelt verfügbar 171 / unbestätigt 167 / abgängig 9; zvg unbestätigt 3 |
| Trefferklasse | `nichtBeurteilbar` **350 / 350** (100 %) |
| Stufe | `S0` **350 / 350** |
| Datenlücken | „Preis fehlt — die Quelle nennt keinen verwertbaren Kaufpreis" bei **350 / 350** |
| `abgaengigSeit` gesetzt | 9 (alle am 17./18.09.) |

**Welche Felder überhaupt gefüllt sind:** genau fünf — `id`, `quelle`, `url`,
`zustand`, `zuletztGesehen` (plus `abgaengigSeit` bei den 9 Abgängen). Alle
übrigen 19 Felder sind bei allen 350 `null` bzw. `false`:
`titel`, `ort`, `bundesland`, `plz`, `kaufpreisEuro`, `wohnflaecheM2`,
`grundstueckM2`, `baujahr`, `einheiten`, `rangzahl`, `kaufpreisfaktor`,
`band`, `termin` (je `null`); `einheitenAngenommen`, `preisGesenkt`,
`istSchwellenwechsler` (je `false`).

**Alter** (`zuletztGesehen`, Tagesauflösung — nicht `first_seen`, siehe unten):

| Tag | Anzahl |
|---|---|
| 2026-09-18 | 191 |
| 2026-09-17 | 151 |
| 2026-09-16 | 3 |
| 2026-09-15 | 2 |
| 2026-09-14 | 2 |
| 2026-09-13 | 1 |

**Regionale Verteilung** (Immowelt-Hüllen, `locations`-Parameter der URL):
AD04DE8 126, AD04DE9 98, AD04DE5 31, AD04DE3 24, AD04DE14 12, AD04DE16 11,
AD04DE15 10, AD04DE1 8, AD04DE7 7, AD04DE12 6, AD04DE6 5, AD04DE10 4,
AD08DE8634 2, AD04DE13 2, AD08DE1113 1. Zum Vergleich der Gesamtbestand:
AD04DE5 5.137, AD04DE9 3.660, AD04DE8 3.389, AD04DE3 1.864. **AD04DE8 ist
überrepräsentiert** (36 % der Hüllen bei 16 % des Bestands), AD04DE5
unterrepräsentiert (9 % bei 24 %) — das ist ein Rotationseffekt, welche
Regionen zuletzt in der 600er-Bewertungsscheibe lagen, keine Aussage über den
Markt.

**Die 3 ZVG-Hüllen** sind namentlich:
`zvg_id=4820&land_abk=hb`, `zvg_id=49119&land_abk=by`,
`zvg_id=167869&land_abk=nw`. Alle `unbestaetigt`. Bei ihnen wurde die
Bekanntmachung sehr wohl gelesen, sie nennt nur keinen Verkehrswert
(`main.ts:535–545`) — inhaltlich also ein anderer Fall als bei Immowelt,
obwohl er im Snapshot gleich aussieht.

## Frage 5 — Was wäre der kleinste ehrliche Umgang? (Optionen, keine Empfehlung)

**(a) Gar nichts tun.** Begründung: Die Hüllen sind A-4 in Reinform — ein
Objekt, das nicht bewertet werden kann, bleibt trotzdem auffindbar und
unterliegt der normalen Abgangs- und Löschwache. Die Oberfläche behandelt sie
seit der Kartenaufgabe bereits ehrlich. **Preis:** 1,60 % des Bestands bleiben
Zeilen, die in der Liste nichts erzählen; und der Backlog-Punkt bleibt als
Daueraufgabe stehen und wird wieder und wieder neu untersucht.
**Anmerkung:** Die Behauptung „B6 ist die Wurzel" trägt hier **nicht**. B6
erklärt, warum alle Immowelt-Objekte dünn sind; die Hüllen entstehen davor,
am fehlenden `€` in der Titelzeile. Eine entsperrte Detailseite würde diese
350 zwar mit auffüllen, aber nur als Nebenwirkung.

**(b) Die Titelzeile mitschreiben.** Der kleinste Eingriff mit sichtbarem
Ertrag: `upsertListingOhneBewertung` um die schon berechneten Werte aus
`werteAusTitelzeile` erweitern — bzw. eine Version mit `price_cents = null`
schreiben. Damit bekämen die 350 einen Titel, eine Lage (Stadtteil), Zimmer,
Wohnfläche, Grundstück. **Preis:** Es entstünden `listing_versions`-Zeilen
ohne Preis — genau das, was `ea8b731` bewusst vermieden hat („ohne dass eine
Metrik eine Zeile ohne Preis sieht"). Jede Auswertung über
`listing_versions` müsste geprüft werden. Das ist kein kleiner Umbau, sondern
ein Eingriff in eine getroffene Entscheidung; er gehört dem Nutzer.
**Ehrlicher Zwischenschritt:** nur `title` und `city` mitschreiben und
Preis/Fläche weiterhin weglassen — dann sieht keine Preismetrik etwas Neues,
die Liste aber einen Namen.

**(c) Den Lückencode persistieren.** `ermittleLueckencodeOhnePreis` liefert
bereits `preis_auf_anfrage` vs. `preis_unlesbar`, geschrieben wird er nicht.
Eine Spalte (oder ein Eintrag in `data_gaps`) machte am Bestand sichtbar, ob
der Parser versagt hat. **Preis:** eine Migration; der Ertrag ist reine
Diagnose, keine Verbesserung für den Nutzer der Oberfläche. **Wert:** Ohne
diesen Code bleibt jede künftige B5-Untersuchung wieder auf das Protokoll
eines einzelnen Laufs angewiesen.

**(d) E-7 nachziehen** (Kategorie „Objekte ohne Region" im Dashboard). Davon
unabhängig, seit 2026-09-13 entschieden und nirgends gebaut. **Preis:** reine
Frontend-Arbeit, betrifft 356 Objekte (nicht 350) und behebt an B5 nichts —
macht sie nur sichtbar.

**Nicht auf der Liste, weil widerlegt:** die Detailsperre prüfen, um B5 zu
lösen. Das ist B6 Schritt 1 und steht für sich; für diese 350 ändert es nichts
an der Ursache.

---

## Was nicht belegt ist

- **`first_seen` wurde nicht ausgewertet.** Die Spalte **existiert**
  (`schema.sql:8`) und wird sogar geladen (`lib/snapshotDb.ts:79`,
  `lib/snapshot.ts:139`) — sie landet nur nicht je Objekt im Snapshot-JSON,
  sondern nur aggregiert in der Kopfzeile (`snapshot.ts:757`). Die Zahlen zum
  „Alter" oben sind deshalb **`zuletztGesehen`, nicht das Entstehungsdatum.**
  Backlog-Schritt 1 („Alter bestimmen") ist damit **nicht erledigt**; er
  braucht eine lesende Abfrage, die hier verboten war. Meine Aussage zu
  Frage 3 stützt sich ausschließlich auf die Git-Historie, nicht auf das
  Alter der Zeilen.
- **Der Vergleich mit den 54 aus E-7 ist weiterhin keiner.** Ich habe
  `partitionEinesListings` nicht gegengerechnet (Backlog-Schritt 2 bleibt
  offen). Zusätzlich neu: Die 54 stammen vom 2026-09-15, also **drei Tage
  nach** `ea8b731`. Selbst eine saubere Nachrechnung verglich damit zwei
  Stände derselben, bereits geänderten Logik — die Zahl taugt auch dann nicht
  als Beleg für „Regression".
- **Ich weiß nicht, wie viele der 347 `preis_auf_anfrage` und wie viele
  `preis_unlesbar` sind.** Der Code unterscheidet es, die Datenbank nicht
  (siehe Option c). Damit ist **nicht ausgeschlossen**, dass unter den 347
  doch ein Parserfehler steckt — die Seitenverteilung (Median 117 bei
  `PriceAsc`) spricht stark dagegen, beweist es aber nicht. Wer es wissen
  will, liest das Protokoll eines Laufs: `main.ts:441` schreibt jede
  Titelzeile mit Fundort ins Log.
- **Die 350 vs. 352 sind am Snapshot vom 2026-09-18 gemessen**, nicht am
  heutigen Bestand. Beide Zahlen wandern mit jedem Lauf.
- **Nicht geprüft:** ob es außer `main.ts:452` und `main.ts:552` noch einen
  dritten Weg gibt, eine `listings`-Zeile ohne Version anzulegen (etwa ein
  abgebrochener `upsertListingAndVersion` zwischen dem `listings`-Upsert
  `db.ts:186` und dem Versions-Insert). Das ist theoretisch möglich; die
  einheitliche Datenlücke „Preis fehlt" bei 350/350 Objekten passt aber genau
  zum bekannten Pfad und zu keinem anderen.
- **Kein Live-Abruf, kein `npm ci`, kein Testlauf.** Es wurde kein
  Produktionscode angefasst, also gibt es nichts zu testen; `vitest`/`tsc`
  wurden entsprechend nicht ausgeführt.
