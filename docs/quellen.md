# Quellen anlegen, reparieren und fair abfragen

## Warum Nischenportale

Auf den großen Portalen inserieren fast ausschließlich Makler. Der Preis ist
professionell angesetzt, die Courtage kommt obendrauf, und bei einem guten
Objekt konkurrierst du mit hunderten Interessenten am selben Tag.

Interessanter sind:

- **Kleinanzeigen** – Privatverkäufer, Erbengemeinschaften, Kleinvermieter, die
  ihr Objekt nicht bewerten lassen haben. Fast immer provisionsfrei.
- **Provisionsfrei-Portale** (ohne-makler.net und ähnliche) – Verkauf von privat,
  spart mehrere Prozent Nebenkosten.
- **Zwangsversteigerungen** (zvg-portal.de) – amtliche Termine mit
  Verkehrswertgutachten. Der klassische Weg zu Objekten deutlich unter Wert.
  Achtung: Finanzierung muss vor dem Termin stehen, Besichtigung oft nur von
  außen, Räumung kann Sache des Erstehers sein.
- **Regionalportale und Zeitungen** – wenig Reichweite, wenig Wettbewerb.
- **Sparkassen- und Volksbank-Immobilienportale** – oft Objekte aus
  Nachlassverwaltung und Zwangsverwertung.

Die großen Portale bleiben trotzdem eingeschaltet-**bar**: `--grosse-portale`.
Manche Makler inserieren nur dort, und Preissenkungen sieht man dort früh.

## Eine Quelle hinzufügen

In `config/sources.yaml`:

```yaml
- id: mein-portal
  name: Regionales Immobilienportal
  type: html            # html | rss | kleinanzeigen
  category: nische      # nische | kleinanzeigen | zwangsversteigerung | gross
  enabled: true
  base_url: https://portal.de
  search_url: "https://portal.de/suche?ort={ort}&umkreis={umkreis}&max={preis_max}"
  pagination: { param: "seite", start: 1, max_pages: 3 }
  fetch_details: true   # Detailseite nachladen (kostet Zeit, bringt die Miete)
  max_details: 15
  selectors:
    item: "article.listing"        # der Container je Treffer
    url: "a.title@href"            # "@attribut" liest ein Attribut
    title: "a.title"
    price: ".price"
    living_area: ".area"
    city: ".location"
    image: "img@src"
  detail_selectors:
    description: "#objektbeschreibung"
```

Verfügbare Platzhalter: `{ort}`, `{ort_slug}`, `{plz}`, `{umkreis}`,
`{preis_min}`, `{preis_max}`, `{keywords}`, `{keywords_space}` sowie alles, was
unter `defaults:` in der Quelle selbst steht.

## Selektoren finden und reparieren

```bash
immosearch doctor                             # welche Quellen liefern nichts?
immosearch inspect mein-portal --save s.html  # Roh-HTML sichern
```

Dann `s.html` im Browser öffnen, per Rechtsklick → „Untersuchen“ den Container
eines Treffers suchen und dessen Klasse als `item` eintragen. Die übrigen
Selektoren sind relativ zu diesem Container.

Mehrere Kandidaten lassen sich mit Komma angeben – der erste Treffer gewinnt:

```yaml
item: "article.listing, li.result, .search-result"
```

Das ist der Grund, warum die mitgelieferten Selektoren so großzügig sind: Sie
sollen bei einer der üblichen Markup-Varianten greifen, auch ohne dass die Seite
vorher live geprüft wurde.

## RSS bevorzugen

Bietet eine Seite einen Feed, nimm ihn:

```yaml
- id: makler-feed
  name: Makler XY – Neuobjekte
  type: rss
  category: nische
  feed_url: "https://makler-xy.de/immobilien/feed"
```

Feeds sind zum Abonnieren gedacht, ändern sich selten und belasten die Seite
kaum. Viele Makler-, Sparkassen- und Volksbank-Seiten (WordPress, TYPO3, ImmoTool)
haben unter `/feed`, `/rss` oder `/?feed=rss2` einen – einfach ausprobieren.

## Große Portale: der belastbare Weg

ImmoScout24, Immowelt und Immonet untersagen automatisierte Abfragen in ihren
AGB und setzen Bot-Erkennung ein. Die Scraper-Konfiguration in dieser Datei
funktioniert erfahrungsgemäß nur unzuverlässig und ist deshalb bei ImmoScout24
standardmäßig `enabled: false`.

Robuster und regelkonform:

1. Beim Portal selbst einen **Suchagenten** anlegen (E-Mail bei neuen Treffern).
2. Diese Mails in einen eigenen Ordner filtern.
3. Den Ordner per IMAP auslesen und die enthaltenen Links durch die Bewertung
   schicken.

Schritt 3 ist noch nicht implementiert – die Anbindung wäre eine weitere Quelle
mit `type: imap`. Sag Bescheid, wenn du das willst, dann baue ich sie.

## Bitte fair bleiben

Voreingestellt sind 2,5 Sekunden Pause pro Host, `respect_robots: true` und ein
ehrlicher User-Agent. Diese Werte sind bewusst konservativ gewählt: Ein Suchlauf
über 15 Quellen dauert damit ein paar Minuten – das ist für ein Tool, das
stündlich läuft, völlig ausreichend, und es hält die Last auf fremden Servern
niedrig. `ignore_robots: true` existiert als Schalter, steht aber in keiner
mitgelieferten Quelle auf `true`.
