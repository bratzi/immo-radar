# Kennzahlen und warum die Standardwerte so gesetzt sind

Diese Datei begründet jede Zahl in `config/config.example.yaml`. Passe sie an –
aber wisse, was du änderst.

## Die Logik der 100 %-Finanzierung

Bei Vollfinanzierung fällt die Frage „wie hoch ist meine Eigenkapitalrendite?“
weg – es gibt kein Eigenkapital, die Rendite wäre rechnerisch unendlich. Die
entscheidende Frage ist stattdessen:

> Trägt das Objekt seinen eigenen Kapitaldienst, und zwar mit Puffer?

Deshalb sind **Cashflow (30 %)** und **Kapitaldienstdeckungsgrad (15 %)**
zusammen fast die Hälfte des Scores. Ein Objekt mit 10 % Bruttorendite und
negativem Cashflow ist für diese Strategie schlechter als eines mit 7 % und
positivem.

---

## Die einzelnen Kennzahlen

### Kaufpreisfaktor (Vervielfältiger)

```
Faktor = Kaufpreis / Jahresnettokaltmiete
```

Wie viele Jahresmieten kostet das Objekt. Der Kehrwert der Bruttorendite.
Standard: `gut` bei 13, `schlecht` bei 25.

Als grobe Orientierung, wann eine Vollfinanzierung überhaupt aufgeht: bei
4 % Zins und 1,5 % Tilgung kostet das Darlehen 5,5 % p.a. Weil bei 110 %
Finanzierung rund 1,1 × Kaufpreis finanziert werden, muss die Nettomiete
etwa 6 % des Kaufpreises erreichen – bei etwa 25 % nicht umlagefähigen Kosten
also gut 8 % brutto, was einem Faktor um 12–13 entspricht. Faktoren über 20
funktionieren ohne Eigenkapital praktisch nie.

### Bruttomietrendite

```
Brutto = Jahresnettokaltmiete / Kaufpreis
```

Der Wert, mit dem Inserate werben. Ignoriert Nebenkosten und Bewirtschaftung –
deshalb nur mit 15 % gewichtet und nie allein betrachtet.

### Nettomietrendite

```
Netto = (Jahresmiete − nicht umlagefähige Kosten) / (Kaufpreis + Kaufnebenkosten)
```

Die ehrlichere Zahl: gegen die **Gesamtinvestition**, nicht gegen den Kaufpreis.
Der Abstand zwischen Brutto und Netto beträgt typischerweise 2–3 Prozentpunkte –
genau die Lücke, die in Verkäuferrechnungen fehlt.

### Kapitaldienstdeckungsgrad (DSCR)

```
DSCR = Nettomietertrag / Annuität
```

So prüft die Bank. Unter 1,0 zahlst du drauf. Standard: `gut` ab 1,4,
`schlecht` unter 0,9, harter Filter bei 1,0. Banken verlangen für eine
Vollfinanzierung meist 1,1–1,3.

### Cashflow

```
vor Steuern  = Nettomietertrag − Annuität
nach Steuern = + (Zinsen + AfA − Mietüberschuss) × Grenzsteuersatz
```

Die Tilgung ist **nicht** steuerlich abzugsfähig, Zinsen und AfA schon. Bei hoher
Tilgung kann der Cashflow negativ sein, obwohl das Objekt Vermögen aufbaut –
deshalb steht die Tilgung als eigener Parameter in der Konfiguration.

---

## Die Kostenannahmen

### Kaufnebenkosten

Grunderwerbsteuer kommt automatisch aus dem Bundesland (abgeleitet aus der PLZ,
siehe Einschränkung unten). Dazu 1,5 % Notar, 0,5 % Grundbuch und 3,57 %
Courtage. In NRW summiert sich das auf gut 12 % – bei 110 %-Finanzierung startest
du also mit rund 112 % Beleihungsauslauf. Das ist der eigentliche Grund, warum
der Kaufpreis so weit unter Marktwert liegen muss.

Erkennt das Tool „provisionsfrei“ im Text, entfällt die Courtage – das sind
mehrere Prozentpunkte und ein Hauptgrund, warum Nischenportale und Kleinanzeigen
interessanter sind als die großen Portale.

### Nicht umlagefähige Bewirtschaftungskosten

| Position | Standard | Anmerkung |
|---|---|---|
| Verwaltung | 25 €/Einheit/Monat | Fremdverwaltung; bei Eigenverwaltung niedriger, aber dann kostet es Zeit |
| Instandhaltung | 10 €/m²/Jahr | Für Bestand ab Baujahr ~1970. Bei unsaniertem Altbau eher 15 € |
| Mietausfallwagnis | 3 % der Jahresmiete | In schwachen Lagen eher 5 % |

Diese drei Positionen fressen typischerweise 20–30 % der Kaltmiete. Sie
wegzulassen ist der häufigste Fehler in Renditerechnungen.

### Steuern

`grenzsteuersatz: 42` ist der Spitzensteuersatz ohne Reichensteuer – setze
deinen tatsächlichen ein. `gebaeudeanteil: 75` schätzt, welcher Teil der
Investition abschreibbar ist (Grund und Boden wird nicht abgeschrieben); in
teuren Lagen ist der Bodenanteil höher, also der Gebäudeanteil niedriger.
`afa_satz: 2.0` gilt für Bestandsgebäude ab Baujahr 1925; für ältere sind es
2,5 %. Für Neubauten und Sonderfälle (Denkmal, degressive AfA) gelten andere
Regeln – dann den Satz manuell setzen.

---

## Chancen- und Risikosignale

Der Textscanner sucht nach Formulierungen, die auf Verhandlungsspielraum
hindeuten:

**Chancen** – provisionsfrei/von privat, Erbengemeinschaft/Nachlass,
Zwangsversteigerung/Insolvenz, Verkaufsdruck, VB, Renovierungsbedarf, Leerstand,
angedeuteter Preis unter Marktwert, Mietsteigerungspotenzial.

Renovierungsbedarf und Leerstand zählen bewusst als **Chance**, nicht als Risiko:
Der Preisabschlag ist meist größer als die Kosten, und leerstehende Einheiten
lassen sich zur Marktmiete neu vermieten, statt an einen Altvertrag gebunden zu
sein. Wer das anders sieht, verschiebt die Einträge in `scoring.py`.

**Risiken** – Sanierungsstau, Asbest/Schimmel, Energieklasse G/H, Gewerbeanteil
(erschwert die Finanzierung), Milieuschutz, strukturschwacher Standort.

**Harte Ausschlüsse** – Erbbaurecht, Nießbrauch/lebenslanges Wohnrecht,
Teilverkauf, Timesharing. Diese Konstruktionen sind vollfinanziert kaum
darstellbar; Banken beleihen sie schlecht oder gar nicht.

---

## Bekannte Ungenauigkeiten

- **Bundesland aus der PLZ** ist eine Näherung. PLZ-Gebiete folgen der Post, nicht
  den Landesgrenzen – an Grenzen (z. B. 32xxx, 49xxx, 68xxx, 88xxx) kann das
  Bundesland falsch sein und damit die Grunderwerbsteuer um 1–3 Prozentpunkte.
  Im Suchprofil lässt sich `bundesland:` fest setzen.
- **Inserierte Mieten** sind häufig Soll- statt Ist-Mieten. Objekte ohne
  Mietangabe werden mit `markt_miete_pro_qm` geschätzt und im Report als
  „Miete geschätzt“ markiert – behandle sie als Vorauswahl, nicht als Ergebnis.
- **Zinsentwicklung nach der Zinsbindung** ist nicht modelliert. Die ausgewiesene
  Restschuld nach 10 Jahren zeigt dir, wie groß das Anschlussrisiko ist.
- **Modernisierungskosten** fließen nicht ein. Ein Objekt mit Sanierungsstau
  bekommt zwar einen Malus, aber keine Kostenschätzung.
