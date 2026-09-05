# ImmoSearch

Findet und bewertet Anlageimmobilien für die **100 %-Finanzierung** – mit
Schwerpunkt auf Nischenportalen und Kleinanzeigen, wo Objekte häufiger unter
Marktwert inseriert werden. Große Portale sind zuschaltbar, damit dir dort
nichts entgeht.

Kernidee: Nicht „schöne Häuser“ finden, sondern Objekte, die sich **ohne
Eigenkapital selbst tragen**. Deshalb rechnet das Tool zu jedem Inserat die
vollständige Finanzierung durch – inklusive Kaufnebenkosten, nicht
umlagefähiger Bewirtschaftungskosten, Annuität und Steuereffekt – und sortiert
nach Cashflow, nicht nach Optik.

```
$ immosearch calc --preis 420000 --miete-jahr 34800 --flaeche 420 \
    --einheiten 6 --baujahr 1972 --plz 45879 --modus 110

╭──────────────────────── Score 73/100 ────────────────────────╮
│ Kaufnebenkosten:      50 694 € (12.07 %)                     │
│ Darlehen:             470 694 € (Beleihungsauslauf 112 %)    │
│ Annuität:             25 888 €/Jahr (2 157 €/Monat)          │
│ Nettomietertrag:      27 756 €                               │
│ Cashflow n. St.:      1 083 €/Jahr = 90 €/Monat              │
│ Kaufpreisfaktor 12.1 · Brutto 8.29 % · Kapitaldienst 1.07    │
╰──────────────────────────────────────────────────────────────╯
```

---

## Installation

```bash
git clone <dieses Repo> && cd Immosearch
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
immosearch init                # legt config/config.yaml an
```

## Erste Schritte

```bash
immosearch sources             # welche Quellen gibt es?
immosearch doctor              # greifen die Selektoren? (siehe Warnung unten)
immosearch search -p ruhrgebiet
immosearch search -p ruhrgebiet --detail 3          # Top 3 ausführlich
immosearch search --grosse-portale                  # große Portale zusätzlich
immosearch search --nur-kleinanzeigen               # nur Kleinanzeigen
immosearch watch --intervall 60                     # Dauerlauf, meldet nur Neues
```

Auswertung des Bestands:

```bash
immosearch show --preissenkungen     # Objekte, deren Preis gefallen ist
immosearch show --langlieger --tage 60   # lange inseriert = verhandlungsbereit
immosearch export treffer.csv
```

---

## Wie bewertet wird

Jedes Inserat durchläuft vier Stufen:

**1. Extraktion.** Aus Titel und Beschreibung werden Kaufpreis, Wohnfläche,
Anzahl Einheiten, Baujahr, PLZ und – am wichtigsten – die **Ist-Miete**
gezogen. Sätze wie „Jahresnettokaltmiete 32.400 EUR“ oder „Mieteinnahmen 2.700 €
monatlich“ werden erkannt. Die Regeln sind bewusst konservativ: lieber keine
Zahl als eine falsche.

**2. Finanzierungsrechnung.**

| Position | Herkunft |
|---|---|
| Grunderwerbsteuer | automatisch aus dem Bundesland (über die PLZ) |
| Notar + Grundbuch | 2,0 % (konfigurierbar) |
| Maklercourtage | entfällt bei erkannt provisionsfreien Angeboten |
| Darlehen | Modus `100` (Kaufpreis) oder `110` (Kaufpreis + Nebenkosten) |
| Annuität | (Zins + Tilgung) × Darlehen |
| Verwaltung | €/Einheit/Monat |
| Instandhaltung | €/m²/Jahr |
| Mietausfallwagnis | % der Jahresmiete |
| Steuereffekt | Zinsen und AfA gegen deinen Grenzsteuersatz |

Ergebnis: Cashflow vor und nach Steuern, Kaufpreisfaktor, Brutto- und
Nettomietrendite, Kapitaldienstdeckungsgrad, Restschuld nach Zinsbindung.

**3. Harte Filter.** Objekte, die eine Grenze reißen, fallen raus – etwa
negativer Cashflow, Faktor über 20, oder Ausschlusswörter wie *Erbbaurecht*,
*Nießbrauch*, *Teilverkauf*. Mit `--zeige-abgelehnte` siehst du sie samt Grund.

**4. Score 0–100.** Gewichtete Kriterien plus Bonus für Chancen-Signale
(provisionsfrei, Erbengemeinschaft, Renovierungsbedarf, Leerstand,
Preissenkung) und Malus für Risiken (Sanierungsstau, Milieuschutz,
Gewerbeanteil, sehr schlechte Energieklasse).

Alle Schwellen und Gewichte stehen in `config/config.yaml`:

```yaml
harte_filter:
  min_cashflow_nach_steuer_monat: 0
  max_faktor: 20
  min_brutto_rendite: 5.5
  min_dscr: 1.0

kriterien:
  cashflow:       { gewicht: 30, schlecht: -300, gut: 400 }
  faktor:         { gewicht: 20, schlecht: 25,   gut: 13 }
  brutto_rendite: { gewicht: 15, schlecht: 4.0,  gut: 9.0 }
  dscr:           { gewicht: 15, schlecht: 0.9,  gut: 1.4 }
```

Gewicht `0` schaltet ein Kriterium ab. Die Defaults sind ein Startraster für
Cashflow-orientiertes Buy-and-Hold, keine Empfehlung – siehe
[docs/kennzahlen.md](docs/kennzahlen.md) für die Begründung jeder Zahl.

---

## Quellen

| Kategorie | Beispiele | Standard |
|---|---|---|
| `kleinanzeigen` | kleinanzeigen.de (Häuser, Wohnungen) | **an** |
| `nische` | ohne-makler.net, immobilo, immoportal, wohnungsboerse, quoka, markt.de, kalaydo | **an** |
| `zwangsversteigerung` | zvg-portal.de, Grundstücksauktionen | **an** |
| `gross` | ImmoScout24, Immowelt, Immonet | aus, per `--grosse-portale` |

Eine weitere Seite aufzunehmen kostet keinen Code, nur einen Eintrag in
`config/sources.yaml`:

```yaml
- id: mein-portal
  name: Regionalportal XY
  type: html
  category: nische
  base_url: https://portal.de
  search_url: "https://portal.de/suche?ort={ort}&max={preis_max}"
  selectors:
    item: "article.listing"
    url: "a.title@href"
    title: "a.title"
    price: ".price"
```

Bietet eine Seite einen RSS-Feed, nimm `type: rss` – das ist stabiler und
höflicher als Scraping. Details in [docs/quellen.md](docs/quellen.md).

### ⚠️ Selektoren müssen einmal verifiziert werden

Die mitgelieferten CSS-Selektoren und URL-Muster sind **Startwerte, die noch
nicht gegen die Live-Seiten geprüft wurden** (siehe „Stand der Umsetzung“). Sie
sind so gebaut, dass sie mehrere plausible Klassennamen abdecken, aber Portale
ändern ihr Markup laufend. Der Ablauf zum Reparieren:

```bash
immosearch doctor                          # zeigt: OK / LEER / FEHLER je Quelle
immosearch inspect ohne-makler --save s.html   # Roh-HTML ansehen
# Selektoren in config/sources.yaml korrigieren, doctor erneut laufen lassen
```

`doctor` ist so gebaut, dass genau das schnell geht – eine leere Quelle blockiert
den Rest des Laufs nie.

### Fair scrapen

Standardmäßig gilt: `robots.txt` wird respektiert, zwischen zwei Abrufen desselben
Hosts liegen 2,5 Sekunden, der User-Agent ist ehrlich gesetzt. Bitte lass das so.
Die großen Portale untersagen automatisierte Abfragen in ihren AGB und setzen
Bot-Erkennung ein – der belastbarere Weg dorthin ist ein **Suchagent per E-Mail**
beim Portal selbst. `docs/quellen.md` beschreibt, wie du dessen Mails auswertest.

---

## Benachrichtigungen

`immosearch watch` meldet nur, was neu ist oder im Preis gesenkt wurde:

```yaml
benachrichtigung:
  min_score: 60
  html_report: reports/immosearch.html
  telegram_token: "123456:ABC..."     # Bot über @BotFather
  telegram_chat_id: "987654321"       # eigene ID über @userinfobot
  smtp_host: smtp.example.de
  smtp_to: [ich@example.de]
```

Das SMTP-Passwort kann auch aus `IMMOSEARCH_SMTP_PASSWORD` kommen, statt in der
Datei zu stehen.

---

## Stand der Umsetzung

Ehrlich getrennt nach dem, was geprüft ist, und dem, was noch nicht:

**Getestet (40 Unit-Tests, `python3 -m pytest tests/`)**
- Finanzierungsmodell inkl. Grunderwerbsteuer je Bundesland, Annuität,
  Restschuld, Steuereffekt, Mietschätzung
- Freitext-Extraktion (Miete, Einheiten, Fläche, Baujahr, PLZ, Provision)
- Scoring, harte Filter, Bonus/Malus-Deckelung
- Quellen-Schicht gegen HTML-Fixtures, Registry-Filter, Fehlertoleranz
- Speicher: Dublettenerkennung, Preishistorie, Langlieger

**Noch nicht live verifiziert**
- Alle URL-Muster und CSS-Selektoren in `config/sources.yaml` (`status: ungeprueft`).
  Die Entwicklungsumgebung hatte keinen Netzzugang, deshalb konnte kein Portal
  tatsächlich abgerufen werden. Erster Schritt bei dir: `immosearch doctor`.
- Die Ort-Auflösung von Kleinanzeigen (`s-ort-empfehlungen.json`). Schlägt sie
  fehl, sucht das Tool bundesweit statt im Umkreis – es bricht nicht ab.

---

## Keine Anlageberatung

Alle Kennzahlen beruhen auf Angaben aus Inseraten und den Annahmen in deiner
`config.yaml`. Inserierte Mieten sind oft Soll- statt Ist-Mieten, Flächen sind
oft geschätzt. Das Tool sortiert vor – die Prüfung von Ist-Mietverträgen,
Grundbuch, Teilungserklärung, Instandhaltungsstau und Energieausweis ersetzt es
nicht.
