# Mietqualität (Teilprojekt 2) — Befund und Neuzuschnitt

**Stand:** 2026-09-08
**Status:** Messung am Produktionsbestand. Ersetzt den bisherigen Zuschnitt
„`rent_estimates` als Korpus, ZVG-Mieternte".

## Warum es diesen Befund gibt

Teilprojekt 2 war als Mietkorpus geplant: echte Mietangaben sammeln,
`rent_estimates` daraus füllen, die handrecherchierte Regionaltabelle
ablösen. Eine Messung am Bestand hat das widerlegt, bevor Code entstand.

## Was gemessen wurde

Alle Zahlen aus der Produktionsdatenbank, 2026-09-08.

**Es gibt praktisch keine echten Mietangaben.**

| Mietquelle | neueste 400 Versionen |
|---|---|
| `geschaetzt_regional` | 392 |
| `geschaetzt_bundesweit` | 5 |
| `angegeben` | **3** |

Im gesamten Bestand: **zwei** Objekte mit angegebener Miete, Fläche und PLZ.
Ein Korpus aus zwei Beobachtungen ist kein Korpus.

**In den ZVG-Gutachten stehen keine Mieten.** Von 442 Texten ohne erfasste
Wohnfläche:

| Muster | Treffer |
|---|---|
| „Miete"/„Pacht" irgendwo | 83 (19 %) |
| **„Jahresmiete"/„Jahresrohertrag"** | **0 (0 %)** |

Die ZVG-Mieternte hat damit keine Grundlage. Erwähnt wird Miete meist als
Randbemerkung („vermietet", „Mietverhältnis"), nicht als Betrag.

## Das eigentliche Problem liegt woanders

**Über die Hälfte des Bestands hat keine Wohnfläche.** 210 der 400 neuesten
Versionen, weit überwiegend ZVG.

Ohne Fläche rechnet `ermittleJahreskaltmiete` mit 0 m² → Jahresmiete 0 →
Bruttorendite 0. Das Objekt fällt durch alle Schwellen und sieht am Ende aus
wie **geprüft und schlecht** — dabei fehlt schlicht die Grundlage.
`bewerteMietschaetzung` fängt das nicht ab: sie schlägt nur bei einer zu
*hohen* Rendite an, nie bei null.

Für ein Ranking-Dashboard ist das der gefährlichste Zustand: Ein Objekt, über
das nichts bekannt ist, wird wie ein geprüft schlechtes einsortiert.

## Was daraufhin umgesetzt wurde

**1. Wohnflächen aus den Gutachten ernten.** 92 Texte enthielten „Wohnfl",
der Parser las daraus **null**. Die Lücke waren durchweg Füllwörter zwischen
Label und Zahl: `insgesamt`, `rd.`, `beträgt`, `ges.`, `:`.

Zugelassen ist jetzt eine **Whitelist** solcher Füllwörter, beliebig oft
wiederholt, und sonst nichts. Bewusst kein `.*?` — in denselben Texten stehen
Grundstücksgrößen („Größe 284 qm") und Einzelwohnungen („Wohnflächen: Wohnung
EG rd. 57 m²"). Letzteres wäre der teurere Fehler: Der Kaufpreisfaktor fiele
um ein Vielfaches zu gut aus und das Objekt landete fälschlich ganz oben.
Lieber eine Angabe verlieren als eine falsche übernehmen. Alle Testfälle sind
wörtliche Fundstellen aus echten Gutachten, die Negativfälle eingeschlossen.

**2. Fehlende Fläche ausdrücklich machen.** Neue Datenlücke
`wohnflaeche_fehlt`. Am Meldeverhalten ändert sie nichts — die Schwellen
schließen solche Objekte ohnehin aus —, aber sie macht den Unterschied
zwischen „geprüft und schlecht" und „nicht beurteilbar" sichtbar. Das
Dashboard braucht genau diesen Unterschied.

## Was bewusst nicht gemacht wurde

- **Wohnfläche aus der Einheitenzahl hochrechnen** (Einheiten × übliche
  Wohnungsgröße). Das wäre eine erfundene Fläche mal einer geschätzten Miete —
  zwei Schätzungen übereinander, und der Kaufpreisfaktor wäre nicht mehr
  belastbar. Vom Nutzer abgelehnt.
- **Objekte ohne Fläche aussortieren.** Zwangsversteigerungen ohne
  Flächenangabe sind oft trotzdem lohnend; sie sollen sichtbar bleiben, nur
  eben als das, was sie sind.
- **`rent_estimates` befüllen.** Die Tabelle bleibt leer und ungenutzt. Sie
  wieder aufzugreifen lohnt erst, wenn eine Quelle mit echten Mietangaben
  dazukommt.

## Was offen bleibt

Rund 80 % der Objekte ohne Wohnfläche behalten sie auch nach der Ernte — die
Zahl steht nicht im Text. Sie sind ab jetzt als nicht beurteilbar markiert.
Sie zu bewerten hieße, eine Quelle für Wohnflächen zu erschließen, die es im
ZVG-Portal nicht gibt.

Die **Regionaltabelle** in `lib/rentEstimate.ts` bleibt damit die Grundlage
jeder Schätzung — 95 handrecherchierte Werte, unvalidiert. Das ist die
größte verbleibende Unsicherheit im Ertragsmodell und sollte beim Entwurf des
Dashboard-Rankings ausdrücklich berücksichtigt werden: Ein Prüfkandidat mit
geschätzter Miete ist etwas anderes als ein Top-Treffer mit angegebener.
