# Immowelt: vollständige Erfassung über die Sitemap — Befund

**Stand:** 2026-09-07
**Status:** ÜBERHOLT seit 2026-09-08 — historisch, kein offenes Arbeitspaket.
Der Umbau auf die Sitemap ist **nicht nötig**: Das Blättern funktioniert
(`blaettereWeiter` in `scraper/scrapers/immowelt/index.ts`, im Betrieb
verwendet), der hier beschriebene Befund war eine Fehldiagnose der
Overlay-Blockade. Vermerkt in `docs/superpowers/TODO.md` („Der Sitemap-Umbau
ist nicht nötig") und `docs/superpowers/BACKLOG.md` („Am 2026-09-08
hinfällig"). Was folgt, bleibt als Recherchestand stehen.

## Warum es diesen Befund gibt

Teilprojekt 1 wollte Immowelt vollständig erfassen, indem es nach Bundesland
sucht und jede Ergebnisliste durchblättert. Ein Rauchtest an Bremen hat das
widerlegt.

## Was tatsächlich passiert

Ein Klick auf „nächste Seite" verlässt die serverseitig gerenderte Liste:

```
GET  403  /classified-search?…&page=2&order=PriceAsc
POST 403  /serp-bff/search
GET  200  geo.captcha-delivery.com/captcha/?…
```

Immowelt antwortet mit **HTTP 403 und einem DataDome-CAPTCHA**. Die leere
SPA-Hülle, die im Browser zurückbleibt, ist nur die Folge — die Seite bekommt
keine Daten. `?sp=2` und `?page=2` auf dem `/suche/`-Pfad liefern HTTP 200,
aber unverändert dieselben 42 Karten; die Parameter werden ignoriert.

Die im ersten Spike abgelesenen Seitenzahlen (NRW: 188 Seiten) hat die SPA
gerendert — erreichbar waren sie nie.

**Daraus folgt:** Über die Blätter-Steuerung ist Immowelt nicht vollständig
erfassbar, ohne ein aktives Anti-Bot-System zu umgehen. Das steht sowohl gegen
die Projektvorgabe „kein bezahlter Anti-Bot-/Proxy-Dienst" als auch gegen die
Grundregel, Erkennungsmechanismen nicht auszuhebeln.

## Der Weg, der funktioniert

`https://www.immowelt.de/robots.txt` verweist auf
`https://www.immowelt.de/sitemaps/sitemap_index.xml` (204 Einträge). Darin liegt
eine Sitemap für **exakt den Filter dieses Projekts**:

```
BUY-BUY-AUCTION-COMPULSORY-AUCTION_HOUSE_MULTI-FAMILY-HOUSE_ORDER-PRICEASC_
INVESTMENT-NEW-BUILD-PROJECTED-RESALE/…_1.xml
```

Inhalt: **8.901 `<loc>`-Einträge**, ausschließlich `/suche/…`-URLs, keine
einzige `/expose/`-URL. Pfadtiefe nach `/mehrfamilienhaus/`: 14 Einträge auf
Bundeslandebene, 8.887 auf Stadt- oder Stadtteilebene. Ein zweiter Teil
(`_2.xml`) existiert nicht (HTTP 410).

Diese URLs veröffentlicht Immowelt selbst für Crawler, sie liegen auf dem von
robots.txt erlaubten `/suche/`-Pfad, und DataDome greift dort nicht.

**Die Rechnung geht auf:** 8.901 Orte auf 35.398 Objekte sind im Schnitt vier
Objekte je Ort. Bremen (209) zerfällt in Stadtteile mit 6–15 Objekten. Fast
jeder Ort passt damit auf seine eine erreichbare Seite — und genau eine Seite
je Ort ist das, was funktioniert.

## Was ein Umbau braucht

- **Sitemap laden und cachen.** 1,3 MB XML, ändert sich selten; nicht bei jedem
  Lauf neu holen.
- **Rotation mit Geltungsbereich.** 8.901 Abrufe à 1 s sind rund 2,5 Stunden —
  bei einem 3-Stunden-Takt wären das ~71.000 Anfragen täglich und damit genau
  das Sperr-Risiko, das wir meiden. (Der Takt ist gemessen keine drei, sondern
  rund fünf Stunden — ~43.000 statt ~71.000 Anfragen. Am Schluss ändert das
  nichts.) Stattdessen je Lauf ein Bruchteil der Orte,
  voller Umlauf über einen Tag, und gelöscht wird nur innerhalb der Orte, die
  der Lauf tatsächlich gesehen hat. Das ist derselbe Mechanismus, den ZVG über
  `geltungsbereich` schon nutzt.
- **Ortsbezug je Listing speichern.** ZVG trägt sein Bundesland in der
  `externalId` (`sn-40908`); Immowelts UUID verrät nichts. Für eine
  ortsgenaue Löschung braucht `listings` eine Spalte mit dem Ort, an dem das
  Objekt gefunden wurde.
- **Überlauf erkennen.** Ein Ort mit mehr als ~40 Treffern ist weiterhin
  abgeschnitten. Die vorhandene Prüfung `istRegionVollstaendig` (gesammelt
  gegen ausgewiesene Zahl) deckt das ab und muss je Ort statt je Bundesland
  greifen. Solche Orte müssten über ihre feineren Unterorte aufgelöst werden —
  die Sitemap enthält diese Ebene bereits.

## Was heute im Code steht

`sweepImmowelt` sammelt Seite 1 je Bundesland (~640 Objekte statt der 1–3, die
der alte HTTP-Scraper bundesweit fand), vergleicht das Ergebnis mit der vom
Portal ausgewiesenen Zahl, erkennt den Fehlbetrag und meldet
`vollstaendig: false`. Immowelt liefert damit Kandidaten, **autorisiert aber
keine Löschung**. ZVG ist davon unberührt und löscht vollständig.

Das ist ein sicherer Zwischenzustand, kein Endzustand.
