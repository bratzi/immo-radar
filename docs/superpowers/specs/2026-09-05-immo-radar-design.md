# immo-radar — Design

Datum: 2026-09-05
Status: Vom Nutzer bestätigtes gemeinsames Verständnis, bereit für Implementierungsplan.

## Ziel

Ein eigenständiges, privates Hobby-Tool, das deutschlandweit Mehrfamilienhäuser
(≥3 Einheiten) auf gängigen Immobilienplattformen findet, die für eine
100%-Finanzierung geeignet erscheinen. Bewertung erfolgt über
Rendite-/Finanzierbarkeits-Kennzahlen (Kaufpreisfaktor, geschätzter
Schuldendienstdeckungsgrad/DSCR), nicht über Preis oder Ort allein. Treffer
werden per Telegram sofort gemeldet und in einem passwortgeschützten
Web-Dashboard mit Verlauf dargestellt.

Kontext/Inspiration: Podcast „{ungeskriptet}" Folge 316 mit Matthias Beerbaum
(„So profitierst du von Deutschlands Absturz") — Kernthese: Kredit als Hebel
statt Schuldenangst, Off-Market- und Behörden-/Zwangsversteigerungs-Fehler als
Quelle lukrativer Mehrfamilienhaus-Deals. Ohne Video-Transkript (Browserzugriff
vom Nutzer nicht freigegeben) konnte nur die Einordnung aus Sekundärquellen
einfließen, keine wortgetreuen Zitate/Schritte.

## Architektur

Bewusst analog zum bestehenden Margn-Projekt (bekannter, bewährter
Stack, $0-Betrieb):

```
Quellen (6 Plattformen, HTML-Scraping)
   -> scraper/main.ts     Suchergebnisse abgreifen, Objekt+Version+Kennzahlen
                           speichern (alle 3h, GitHub Actions Cron)
   -> Supabase             Postgres, neues eigenständiges Projekt (nicht Margn)
   -> Telegram-Bot          Sofort-Alarm bei Top-Treffer / Preisänderung
   -> web/                 Next.js-Dashboard (Vercel), passwortgeschützt
```

- **Repo:** neues **privates** GitHub-Repo `immo-radar`, getrennt von Margn.
- **Lokaler Projektordner:** `C:\immo-radar`.
- **Cron:** GitHub Actions, alle 3 Stunden (~8 Läufe/Tag). Privates Repo hat
  2.000 Freiminuten/Monat — bei reinem Listen-Scraping (kein durchgängiges
  Playwright-Rendering nötig, außer ggf. für Cloudflare-geschützte Seiten)
  ausreichend Puffer.
- **DB:** neues Supabase-Projekt (Free Tier), gleiches Muster wie Margn
  (`SUPABASE_SERVICE_KEY` nur im Scraper, `NEXT_PUBLIC_SUPABASE_ANON_KEY` +
  RLS im Frontend).
- **Dashboard-Hosting:** Vercel, eigenes neues Projekt.
- **Auth:** einfacher Login wie Margns `lib/auth.ts`-Muster — nur der Nutzer
  kommt rein.

## Datenquellen und Scraping-Ansatz

6 Plattformen ab Start:

1. ImmoScout24
2. Immowelt
3. Immonet
4. Kleinanzeigen.de
5. ZVG-Portal (Zwangsversteigerungstermine)
6. Immoverkauf24

**Bewusst akzeptiertes Risiko:** Alle sechs Plattformen untersagen
automatisiertes Auslesen typischerweise in ihren AGB. Der Nutzer hat sich
informiert für direktes Scraping statt offizieller Kanäle (E-Mail-Alerts,
RSS) entschieden. Vorgehen zur Risikominimierung (analog Margns
„freundliche Crawl-Rate"):

- Headless-Browser (Playwright), kein bezahlter Anti-Bot-/Proxy-Dienst
  (0€-Budget-Entscheidung). ImmoScout24 ist Cloudflare-geschützt — Abdeckung
  dort ist **best effort**, kein Zuverlässigkeits-Versprechen. Bricht das
  regelmäßig, wird das im Betrieb sichtbar (Fehlerquote je Quelle im
  Dashboard) und kann später neu entschieden werden.
- Gedrosselte Anfragen, keine parallelen Massenzugriffe.
- Kein Login bei den Plattformen (kein Account-Bezug, kein Zugriff auf
  Kontaktdaten/Chat-Funktionen — nur öffentlich sichtbare Sucheergebnis- und
  Detailseiten).
- Nur Metadaten/eigene Berechnungen werden dauerhaft gespeichert; keine
  Weiterverbreitung von Fotos/Volltext-Exposés, Link zur Originalquelle im
  Dashboard.

## Datenmodell (Kern, analog Margns `articles`/`article_versions`)

- `listings` — ein Eintrag je eindeutige URL/Objekt-ID einer Plattform.
- `listing_versions` — eine Version je Scan mit Preis, Miete (falls
  angegeben), Wohnfläche, Einheitenzahl, Adresse/PLZ, berechneten Kennzahlen,
  `changed`-Flag. Ermöglicht Preisverlauf/-senkungs-Erkennung.
- `rent_estimates` — laufend aus dem eigenen Korpus berechnete
  Durchschnittsmiete/m² je PLZ (nur aus Inseraten mit tatsächlicher
  Mietangabe), inkl. Stichprobengröße.
- `notifications` — Log gesendeter Telegram-Alarme (Top-Treffer /
  Preisänderung), zur Vermeidung von Duplikat-Alarmen.

## Bewertungslogik

Professionalisiert gegenüber der ersten Fassung: statt einer pauschalen
"Jahresnettomiete" wird ein echtes **NOI (Net Operating Income /
Reinertrag)** nach dem in der Immobilienbewertung üblichen Schema
(Rohertrag → Bewirtschaftungskosten → Reinertrag, vgl. § 8 ff. ImmoWertV)
gebildet. Alle Kennzahlen bauen darauf auf.

**1. Rohertrag** = Jahresnettokaltmiete (angegeben oder geschätzt, s.u.)

**2. Bewirtschaftungskosten** (vom Rohertrag abgezogen), je Baustein:

| Baustein | Ansatz | Quelle |
|---|---|---|
| Verwaltungskosten | 300 €/Einheit/Jahr (Mittelwert der üblichen 250–350 €) | [homeday.de](https://www.homeday.de/de/immobilienwissen/bewirtschaftungskosten/) |
| Instandhaltungsrücklage | gestaffelt nach Gebäudealter (Baujahr aus Inserat, sonst „unbekannt" → mittlere Stufe): ≤22 Jahre 7,10 €/m²/Jahr, 22–32 Jahre 9,00 €/m²/Jahr, >32 Jahre 11,50 €/m²/Jahr | Statutorische Werte der II. BV / Peters'sche Formel, [bestehausverwaltung.com](https://bestehausverwaltung.com/articles/instandhaltungsrucklage-berechnung) |
| Mietausfallwagnis | 2% der Bruttomiete | [kettenbach-immobilien.de](https://www.kettenbach-immobilien.de/bibliothek/immobilienbewertung/bewirtschaftungskosten) |

Plausibilitätsgrenze: Die Summe der drei Bausteine wird auf 20–35% der
Nettokaltmiete geklammert (branchenübliche Spanne für Mehrfamilien-/
Zinshäuser laut [kim-bewertung.de](https://www.kim-bewertung.de/wissen/bewirtschaftungskosten/))
— unrealistische Ausreißer bei sehr kleinen/großen Objekten werden so
abgefangen, ohne die Objekt-spezifische Berechnung zu verwerfen.

**3. NOI (Reinertrag)** = Rohertrag − Bewirtschaftungskosten

**Kennzahlen je Objekt** (nur berechenbar mit Mietangabe/-schätzung):

- Bruttomietrendite = Rohertrag ÷ Kaufpreis × 100
- Nettomietrendite / Cap Rate = NOI ÷ (Kaufpreis + Kaufnebenkosten) × 100
- Kaufpreisfaktor = Kaufpreis ÷ Rohertrag
- Geschätzter DSCR = NOI ÷ ((Kaufpreis + Kaufnebenkosten) × 6%) —
  Kapitaldienst-Annahme 6%/Jahr (4,5% Zins + 1,5% Tilgung), leicht
  konservativer als der recherchierte Vollfinanzierungs-Marktzins von 4,21%
  (Stand September 2026, [baufi24.de](https://www.baufi24.de/bauzinsen/)),
  als Sicherheitspuffer für die Schätzung.

**4. Vereinfachte Beleihungswert-Schätzung + Finanzierungsrisiko-Flag**
(neu, professionelle Ergänzung — der eigentliche Kern von "100%
finanzierbar"): Banken finanzieren nicht gegen den Kaufpreis, sondern
gegen ihren eigenen, meist konservativeren **Beleihungswert** (typisch
70–90% des Marktwerts, [vr.de](https://www.vr.de/privatkunden/themenwelten/wohnen-immobilien/bauen-kaufen/beleihungswert.html)).
Ein Objekt kann also einen guten Kaufpreisfaktor/DSCR haben und trotzdem
für 100%-Finanzierung ungeeignet sein, wenn der Kaufpreis den
bankseitigen Sicherheitswert deutlich übersteigt — dann müsste der
Käufer die Differenz doch aus Eigenkapital decken.

Vereinfachte Schätzung (ohne vollständiges, bodenrichtwert-abhängiges
Ertragswertverfahren, s. Ausbaustufe 2 unten):

`Geschätzter Beleihungswert ≈ NOI ÷ 6%` (Kapitalisierung mit demselben
konservativen Satz wie beim DSCR, als grobe Ertragswert-Näherung ohne
separaten Bodenwert-Split)

`Finanzierungsrisiko-Flag` = Kaufpreis > 110% des geschätzten
Beleihungswerts → Objekt wird als „Beleihungswert-Lücke" markiert.

**Kaufnebenkosten-Annahme** (bundesweit einheitlich in den Formeln
verwendet, aber je Bundesland unterschiedlich — sonst wäre "bundesweit"
nicht konsistent berechenbar):

Kaufnebenkosten = Grunderwerbsteuer (nach Bundesland, Tabelle unten) + 1,5%
Notar/Grundbuch (Pauschalannahme) + 3,57% Makler-Courtage (typischer
Käuferanteil bei Zinshäusern/Mehrfamilienhäusern — die 2020 eingeführte
hälftige Maklerkosten-Teilung gilt nur für Wohnungen/Einfamilienhäuser,
nicht für Mehrfamilienhäuser, daher hier die traditionelle
Käufer-Courtage angesetzt).

| Bundesland | Grunderwerbsteuer |
|---|---|
| Bayern | 3,5% |
| Sachsen | 5,5% (seit 01.01.2023) |
| Baden-Württemberg, Niedersachsen, Rheinland-Pfalz, Sachsen-Anhalt, Thüringen | 5,0% |
| Bremen, Hamburg | 5,5% |
| Berlin, Hessen, Mecklenburg-Vorpommern | 6,0% |
| Brandenburg, Nordrhein-Westfalen, Saarland, Schleswig-Holstein | 6,5% |

Quelle: [finanz-tools.de](https://www.finanz-tools.de/grunderwerbsteuer/bundeslaender-tabelle),
Stand 2026. Die Zuordnung erfolgt über die PLZ/Adresse des Inserats.

**Mietangabe-Kennzeichnung** (Präzisions-Reihenfolge, erste verfügbare Quelle
gewinnt):

1. Tatsächliche Angabe im Inserat → Kennzeichnung „angegeben"
2. Eigener Korpus-Durchschnitt je PLZ (aus `rent_estimates`, nur bei
   ausreichender Stichprobe) → „geschätzt (eigene Daten, PLZ)"
3. Miet-Check.de-Durchschnitt für die Stadt/Gemeinde → „geschätzt
   (Miet-Check.de)"
4. ImmoScout24-Wohnpreisatlas-Durchschnitt für die Stadt → „geschätzt
   (ImmoScout-Atlas)"
5. Bundesweiter Durchschnitt als letzter Fallback → „geschätzt (bundesweit)"

Jede Kennzeichnung bleibt im Dashboard sichtbar (keine verschleierte
Schätzung).

**„Top-Treffer"-Kriterium** (löst Telegram-Sofort-Alarm aus):

- Kaufpreisfaktor ≤ 15 **UND** geschätzter DSCR ≥ 1,3 **UND** kein
  Finanzierungsrisiko-Flag (Kaufpreis ≤ 110% des geschätzten
  Beleihungswerts) — die dritte Bedingung ist neu und stellt sicher, dass
  nicht nur die Rendite stimmt, sondern die Bank das Objekt realistisch
  auch nahe 100% beleihen würde.

Alle anderen Objekte (auch unterhalb der Schwelle, mit
Finanzierungsrisiko-Flag, oder ohne jede Mietgrundlage) erscheinen
weiterhin im Dashboard, nur ohne Sofort-Alarm.

**Filter-Kriterien für Aufnahme überhaupt:**

- Mindestens 3 Einheiten
- Keine geografische Einschränkung (bundesweit)
- Keine feste Preisobergrenze

## Preisverlauf & Änderungs-Alarme

Wie Margns `article_versions`/`headline_edits`: jeder Scan schreibt eine neue
`listing_versions`-Zeile. Sinkt der Preis gegenüber der letzten Version,
löst das einen eigenen Telegram-Alarm aus („Preis gesenkt bei Objekt X: alt →
neu"), unabhängig vom Top-Treffer-Status.

## Benachrichtigung

- **Telegram-Bot:** zwei Alarm-Typen — neuer Top-Treffer, Preisänderung an
  bereits bekanntem Objekt. Enthält Link, Adresse/PLZ, Preis, Einheitenzahl,
  Kennzahlen samt Mietangabe-Kennzeichnung.
- **Web-Dashboard:** passwortgeschützte Next.js-App auf Vercel. Tabelle aller
  gefundenen Objekte, filterbar nach Kennzahlen/Quelle/Status, mit
  Preisverlauf je Objekt.

## Offene technische Setup-Schritte (nicht Teil der Design-Entscheidungen,
sondern Ausführung im Implementierungsplan)

- Neues privates GitHub-Repo `immo-radar` anlegen und Fernzugriff einrichten.
- Neues Supabase-Projekt anlegen (Schema analog Margn, aber eigenständig).
- Neues Vercel-Projekt anlegen.
- Telegram-Bot über BotFather erstellen, Token als Secret hinterlegen.

Diese vier Schritte betreffen externe Konten/Dienste des Nutzers und werden
im Implementierungsplan als einzelne, vom Nutzer zu bestätigende Schritte
behandelt (nicht automatisch im Hintergrund angelegt).

## Bewusst nicht enthalten (YAGNI, spätere Ausbaustufe falls gewünscht)

- Bezahlter Anti-Bot-/Proxy-Dienst für ImmoScout24.
- Automatisierte Kontaktaufnahme mit Verkäufern/Maklern.
- Geografische Umkreis-Filterung.
- Feste Preisobergrenze.
- **Vollständiges Ertragswertverfahren nach ImmoWertV** (statt der
  vereinfachten Beleihungswert-Näherung oben): Bodenwert (Bodenrichtwert ×
  Grundstücksfläche) + Gebäudeertrag (Reinertrag abzüglich
  Bodenwertverzinsung, kapitalisiert mit einem lagespezifischen
  Liegenschaftszinssatz von Gutachterausschüssen, typ. 1,5–4,5% bei
  Wohnimmobilien) + Bodenwert. Fachlich präziser als die 6%-Pauschale,
  aber setzt eine Bodenrichtwert-Anbindung voraus — die läuft in jedem
  Bundesland über ein eigenes BORIS-Portal (uneinheitlich strukturiert,
  meist ohne echte API, teils nur Kartenabfrage). Der Aufwand für 16
  unterschiedliche Länder-Anbindungen lohnt sich erst, wenn sich die
  einfache Näherung im Betrieb als zu ungenau erweist.
