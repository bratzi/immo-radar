# Nachtrag 2026-09-15 — die Oberfläche: Gliederung, Karte, Filter, Technik

**Gehört zu** [`2026-09-09-dashboard-entwurf.md`](2026-09-09-dashboard-entwurf.md).
Dieser Nachtrag ersetzt nichts an den Schritten 0–3 und an den Abschnitten 2 bis
7; er entscheidet, was die Schritte 4 bis 7 dort konkret werden. **Er ist kein
neues Projekt** — der Nutzer hat am 2026-09-15 die Priorität auf die Oberfläche
gesetzt, nicht den Entwurf verworfen.

**Neu gemessen am 2026-09-15** (lesend, gegen die Produktionsdatenbank). Der
Entwurf rechnet mit dem Stand vom 2026-09-12 (n = 12.611); heute:

```
listings gesamt          17.078     immowelt 16.879, zvg-portal 199
mit disappeared_at          351
ohne listing_version        128     (kein Preis, S0)
listing_versions         25.709
```

---

## N1. Die Gliederung folgt der Trefferklasse, nicht der Sicherheitsstufe

**Entscheidung des Nutzers vom 2026-09-15.** Abschnitt 3.2 des Entwurfs
gliedert die Seite in vier Blöcke nach Sicherheitsstufe (S3/S2/S1/S0) mit einer
Schwellenlinie in jedem Block. Der Nutzer hat stattdessen gewählt: **drei
sichtbare Bereiche nach Trefferklasse**, die Sicherheitsstufe wird zum Abzeichen
am Objekt und zum Filter.

| Bereich | Wer hineingehört |
|---|---|
| **Top-Treffer** | Objekte, die die Meldeschwelle **auch an der unteren Bandkante** halten |
| **Normale Treffer** | Objekte mit Rangzahl, die die Schwelle nicht (oder nur im Band) halten |
| **Nicht beurteilbar** | S0 — keine Kennzahl, nur der Grund im Klartext |
| **Abgänge** | `disappeared_at` gesetzt und Karenz vorbei |

**Warum „nicht beurteilbar" trotzdem ein eigener Bereich bleibt und nicht bloß
ein Filterwert ist:** Diese Objekte tragen überhaupt keine Rangzahl (3.7). Man
kann sie in keine nach Rang sortierte Liste einsortieren, auch nicht ans Ende —
genau das ist der Zustand, den der Mietqualitäts-Befund „den gefährlichsten"
nennt. Die Entscheidung des Nutzers betrifft die *Gliederung nach
Belegtheitsgrad*; sie hebt die Trennung „mit Kennzahl / ohne Kennzahl" nicht
auf, weil die keine Darstellungsfrage ist.

### N1.1 Was ein Top-Treffer im Dashboard ist

Der Code kennt `topTreffer` (`metrics.ts`) als Punktwert-Prüfung: Faktor 3…15
**und** DSCR ≥ 1,3 **und** kein Finanzierungsrisiko. Auf eine geschätzte Miete
angewandt ist das eine Aussage über den Mittelwert der Schätzung.

**Entscheidung: Das Dashboard verlangt für „Top-Treffer" die Schwelle an der
unteren Bandkante.** Ein Objekt heißt hier Top-Treffer, wenn es die
Meldeschwelle auch dann noch hält, wenn die Mietschätzung gegen es läuft.

**Begründung:** Abschnitt 3.5 sortiert bereits nach der unteren Bandkante, mit
genau dieser Begründung — *ein Objekt steigt nur, wenn es auch dann noch gut
ist, wenn die Schätzung gegen es läuft.* Eine Trefferklasse, die den Punktwert
nähme, würde die Sortierung darunter widerlegen. Und 3.6 hat gemessen, dass
25 % aller bewertbaren Objekte Schwellenwechsler sind: Nähme man den Punktwert,
bestünde der Top-Bereich zu einem erheblichen Teil aus Objekten, deren Rang
allein an der Schätzung hängt.

**Der Preis, offen benannt:** S3 trägt heute **ein** Objekt, und das hält die
Schwelle nicht (3.8). Der Top-Bereich wird also überwiegend oder ganz aus
S1-Objekten bestehen — geschätzte Mieten mit Band. Das Abzeichen am Objekt sagt
das; der Bereich verschweigt es nicht.

---

## N2. Die Karte: Bundesländer eingefärbt, Punkte nur wo es Punkte gibt

**Gemessen am 2026-09-15**, jüngste Version je Objekt (n = 16.950):

| Ortsangabe | Abdeckung | Brauchbar für |
|---|---|---|
| PLZ | **239 (1,4 %)**, davon 194 ZVG | echte Punkte |
| Ortsname (`city`) | 16.899 (99,7 %) — aber 624× „Erstbezug", 297× „Süd", dazu Stadtteile | erst nach einer Orts→Koordinaten-Tabelle |
| Bundesland | **16.944 (100,0 %)** | Flächenfärbung |

Seit Immowelt aus der Ergebnisliste statt von der gesperrten Detailseite
gelesen wird, gibt es dort **keine PLZ mehr**. Eine Karte, die jede Wohnung als
Punkt zeigt, behauptet damit eine Ortsgenauigkeit, die in 98,6 % der Fälle
nicht existiert — dieselbe Sorte Behauptung, die dieser Entwurf an drei anderen
Stellen ablehnt.

**Entscheidung: zweischichtige Karte.**

1. **Grundschicht — die 16 Bundesländer als Fläche**, eingefärbt nach der
   gewählten Größe (Anzahl Objekte, Anzahl Top-Treffer, oder Median-DSCR;
   umschaltbar). Klick auf ein Land filtert die Liste darunter. Das ist die
   „Sortierung nach Bundesländern", die der Nutzer verlangt hat, und sie ist zu
   100 % gedeckt.
2. **Punktschicht — die 239 Objekte mit PLZ** als echte Punkte, auf dem
   PLZ-Zweisteller-Mittelpunkt. Die Koordinaten liegen bereits im Repo:
   `scraper/lib/karte.ts` führt eine Tabelle aller 100 Zweisteller, heute für
   das Kartenbild in der Telegram-Meldung.

**Die Legende sagt die Abdeckung**, dauerhaft und aus den Daten gerechnet:
*„239 von 17.078 Objekten sind punktgenau verortbar. Die übrigen sind nur ihrem
Bundesland zuzuordnen."*

**Ausbaupfad, nicht Teil dieses Schritts:** Eine Orts→Koordinaten-Tabelle
(4.634 verschiedene `city`-Werte, davon ein Teil unbrauchbar) hebt die
Punktschicht auf ~96 %. Sie braucht eine Quelle, eine Bereinigung der
Müllwerte und eine eigene Abnahme — eigener Backlog-Punkt.

---

## N3. Die Filter

Nur, was heute in einer Spalte steht. Jeder Filter ist gegen die vorhandenen
Daten geprüft:

| Filter | Quelle | Anmerkung |
|---|---|---|
| Bundesland | `listing_versions.bundesland` | 100 % gedeckt, auch per Kartenklick |
| Kaufpreis von–bis | `price_cents` | |
| Wohnfläche von–bis | `living_area_m2` | fehlt bei einem Teil → solche Objekte sind ohnehin S0 |
| Grundstücksfläche | `plot_area_m2` | |
| Baujahr von–bis | `year_built` | |
| Einheiten | `units` + `units_confident` | „angenommen" wird als solches markiert |
| Quelle | `listings.source` | Immowelt / Zwangsversteigerung |
| Sicherheitsstufe | aus `ranking.ts` | S3/S2/S1/S0 als Filter statt als Gliederung (N1) |
| Zustand | `disappeared_at`, `last_seen` | verfügbar / unbestätigt / abgängig (6.3) |
| Nur über der Meldeschwelle | Bandkante (N1.1) | |
| Nur Preissenkungen | `price_dropped` | |
| Datenlücke | `data_gaps` | einzeln auswählbar |
| Zwangsversteigerungstermin | `auction_at` | nur ZVG |

**Bewusst nicht dabei — Zimmerzahl.** Sie steht im Titel („8 Zimmer, 226,4 m²"),
aber in keiner Spalte. Ein Filter darauf verlangt einen Parser, eine
Schemaspalte und einen Nachlauf über den Bestand — eigener Schritt, eigener
Backlog-Punkt. **Nicht** heimlich aus dem Titel zur Anzeigezeit geraten: Ein
Titel ohne Zimmerangabe würde sonst als „0 Zimmer" filterbar.

---

## N4. Der Datenweg bleibt der beschlossene: eine Datei

Abschnitt 5.3 hat C1 (Snapshot-Export) entschieden, Abschnitt 11 hält E-1
fest. **Daran ändert dieser Nachtrag nichts.** Die Oberfläche liest
ausschließlich eine veröffentlichte Datei, hält keinen Schlüssel und spricht
nie mit der Datenbank.

**Das Dateiformat ist die Schnittstelle zwischen zwei Arbeitssträngen** und
steht deshalb hier, bevor einer von beiden beginnt:

```jsonc
{
  "erzeugtAm": "2026-09-15T01:00:00Z",
  "lauf": { "id": "34910160636", "beendetAm": "..." },
  "kopfzeile": {                    // 3.9, zur Anzeigezeit gerechnet
    "objekteGesamt": 17078,
    "mitBelegterMiete": 1,
    "topTrefferSeit": "2026-09-07",
    "anteilBundeslandgenau": 0.98
  },
  "bundeslaender": [                // Grundschicht der Karte (N2)
    { "name": "Nordrhein-Westfalen", "objekte": 4170, "topTreffer": 3,
      "medianDscr": 0.94, "standAlterTage": 6.2 }
  ],
  "objekte": [
    {
      "id": "uuid", "quelle": "immowelt", "url": "https://...",
      "titel": "...", "ort": "Peine", "bundesland": "Niedersachsen",
      "plz": null,                  // 239 von 17.078 tragen eine
      "kaufpreisEuro": 348900, "wohnflaecheM2": 146, "grundstueckM2": 1000,
      "baujahr": 1998, "einheiten": 3, "einheitenAngenommen": true,
      "stufe": "S1",                // ranking.ts
      "trefferklasse": "normal",    // N1: top | normal | nichtBeurteilbar
      "rangzahl": 0.94,             // DSCR, null bei S0
      "band": { "unten": 0.62, "oben": 1.31 },   // null bei S3 und S0
      "istSchwellenwechsler": true,
      "zustand": "verfuegbar",      // verfuegbar | unbestaetigt | abgaengig
      "datenluecken": [],           // Klartext-Gründe, DATA_GAP_LABELS
      "preisGesenkt": false, "zuletztGesehen": "...", "abgaengigSeit": null,
      "termin": null                // nur ZVG
    }
  ],
  "betrieb": {                      // Abschnitt 8
    "uebersprungeneJeLauf": { "preis_auf_anfrage": 12, "preis_unlesbar": 3 },
    "regionsstand": [ { "region": "nw", "letzterLauf": "...", "vollstaendig": false } ],
    "meldebudget": { "gesendet": 25, "hoechstens": 25, "zurueckgestellt": 117 }
  }
}
```

**Alle abgeleiteten Felder kommen aus `scraper/lib/ranking.ts`**, nicht aus in
SQL oder im Frontend nachgebauten Schwellen — der Grund steht in 5.3, Punkt 4.

Bei 17.078 Objekten und diesem Feldumfang liegt die Datei grob bei 6–10 MB
unkomprimiert, mit gzip deutlich darunter. Sollte sie unhandlich werden, ist
die Teilung in eine schlanke Listendatei und Detaildateien je Objekt der
nächste Schritt — **erst messen, dann teilen.**

---

## N5. Technik und Veröffentlichung

- **Statische Seite, ein Bündel.** Vite + React + TypeScript, im neuen
  Verzeichnis `web/`. Kein Server, kein Backend, keine Datenbankverbindung.
- **Die Karte wird gezeichnet, nicht geladen.** Inline-SVG mit den
  Bundeslandumrissen als mitgeliefertes Bündel; **kein Kachel-Dienst**, keine
  Fremdanfrage zur Laufzeit. Das hält die Seite frei von externen Abhängigkeiten
  und funktioniert hinter einem Zugriffsschutz.
- **Lange Listen werden virtualisiert.** 17.078 Zeilen gehören nicht alle ins
  DOM.
- **Veröffentlichung wie in E-8 entschieden:** Cloudflare Pages, davor
  Cloudflare Access mit E-Mail-Einmalcode an genau die eine erlaubte Adresse.
  Kostenlos, und strenger als ein geteiltes Passwort.
- **Der Snapshot wird vom Lauf erzeugt**, der den Service-Key ohnehin hält
  (GitHub Actions), und als Artefakt veröffentlicht.

---

## N6. Was dieser Nachtrag **nicht** löst

- **Hausgenaue Punkte** für Immowelt-Objekte. Ursache ist die gesperrte
  Detailseite, nicht die Oberfläche.
- **Zimmerzahl** als Filter (N3).
- **Frische der Daten.** Die Seite ist so aktuell wie der letzte Lauf — real
  alle 5,4 Stunden, je Region alle 5,7 Tage (A10). Sie zeigt das an, sie ändert
  es nicht.
- **Ob bundeslandgenaue Schätzungen melden dürfen** (E-4) — unverändert offen,
  betrifft Telegram, nicht das Dashboard.
