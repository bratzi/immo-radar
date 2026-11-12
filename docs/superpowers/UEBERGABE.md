# Übergabe — Stand 2026-11-12, 01:00 Uhr

**Zweck:** private Mietwohnungssuche des Nutzers in München (≤ 1.300 € warm,
≥ 2 Zi., ≥ 45 m²; Balkon seit 2026-11-12 nur Pluspunkt, +15 in der Reihung). Kein Kauf, keine Hausobjekte, kein Telegram,
vorerst keine Push-Benachrichtigung.

**Spec:** `specs/2026-11-11-muenchen-mietwohnung-design.md` — maßgeblich sind
Abschnitt 11 (schlanke Endfassung, fünf Bausteine) und 10 (kein Telegram).
**Plan:** `plans/2026-11-11-muenchen-miete-plan1-reset-kern-immowelt.md` inkl. Nachtrag.
**Portal-Analyse:** `../analyse/2026-11-11-portale-muenchen.md`.

## Was läuft (ohne Rechner des Nutzers)

- `scrape.yml` auf `main`, Takt nach Tageszeit (Mo–Fr 8–14 und täglich 18–23 Uhr
  alle 15 min, sonst 30 min, nachts 2 h). Quellen: **Kleinanzeigen** (Portalfilter in der URL, 5 Listenseiten je Lauf)
  , **ImmoScout24** (Mobil-API, kein Browser, alle Seiten, ~56 Treffer, gut die Hälfte Tausch)
  , **WG-Gesucht** (Kategorie Wohnungen, Liste ohne Detailabruf, ~5 Treffer)
  und **Ohne-Makler.net** (seit 2026-11-12, `?page=N`, Kartenpreis kalt; verteilt selbst an die großen
  Portale, liefert deshalb vor allem Dubletten; die hinteren Seiten zeigen auch Umland, ~120 Karten).
- **Dubletten** filtert die Abfrage `treffer` des Artifacts, nicht die Datenbank: andere Quelle,
  gleiche Zimmerzahl, Fläche ±1 m², gleiche PLZ (bei WG-Gesucht die ersten 3 Ziffern), Kalt- oder
  angegebene Warmmiete ±3 %. Es bleibt ImmoScout vor Kleinanzeigen vor WG-Gesucht vor Ohne-Makler;
  die Karte zeigt „auch auf …“. Positiv geprüft mit einer nachgebauten Kopie, am 2026-11-12 keine echten Paare.
- Supabase-Projekt `rvzaljjbyiooqisajcxp`: Tabellen `angebote`, `laeufe`
  (Reset am 2026-11-11, Run 43104908057).
- Artifact **Wohnungsradar München** (Typ „Data"):
  https://claude.ai/artifact/3VdKkGFpbvZ5yU28i6KfYe — liest live über den
  Supabase-Connector (`execute_sql`). Am 2026-11-12 geöffnet: zeigt korrekt an,
  kein `runs`-Fehlerbericht.

## Stand der Quellen

| Quelle | Stand |
|---|---|
| Kleinanzeigen | live, CI ohne Sperre. 5 Seiten, ~90 % Tauschangebote, Code filtert sie |
| Immowelt | Parser fehlt. CI wird per DataDome gesperrt (Run 43101998784); Fixture aus dem Browser liegt in `scraper/test/fixtures/immowelt/liste-karten.html` |
| ImmoScout24 | live seit 2026-11-12 über die inoffizielle Mobil-API (`api.mobile.immobilienscout24.de`, App-User-Agent, Wissen aus Fredy). Vom Nutzer ausdrücklich freigegeben; der Auto-Modus blockt solche Aufrufe sonst als Bot-Umgehung. Listenpreis ist **kalt**, Warmmiete kommt aus dem Exposé |
| WG-Gesucht | live seit 2026-11-12, Browser-Abrufer, Filter in der URL. Kartenpreis ist **Gesamtmiete**. Keine PLZ auf der Karte: eine repräsentative PLZ je Stadtbezirk (`plzFuerStadtteil`), unbekannter Ort bleibt „unklar“. Kein Detailabruf, weil die Detailseite aus CI ohne Eckdaten kam. Testseite ohne Namen der Inserierenden |

## Offen, in dieser Reihenfolge

1. ImmoScout beobachten. Lauf 43118553524 (Commit `150dd09`): 23 gesehen, 19 passend, 15 Exposés, keine Sperre. 4 Wohnungen warten noch auf ihr Exposé (Deckel 15 je Lauf). **Falle:** `gh workflow run` direkt nach dem Push läuft noch auf dem alten Commit — `headSha` des Laufs prüfen.
2. Fehltreffer prüfen. Der WG-Filter am Titel erkennt seit 2026-11-12 auch Einzelzimmer ohne „WG“ („Ein privates Zimmer für …“).
3. Erledigt am 2026-11-12 (`5f71631`): Telegram, Meldung, `web/`, Snapshot und beide Cloudflare-Workflows sind entfernt. Noch offen und nur vom Nutzer lösbar: Die alte Seite `immo-radar-dashboard.pages.dev` bleibt mit dem letzten Stand online, bis sie in Cloudflare gelöscht wird. Die Secrets `TELEGRAM_*` und `CLOUDFLARE_*` in GitHub werden nicht mehr gebraucht.
4. Immowelt: am 2026-11-12 erneut geprüft (Run 43123724920). Schon der erste Aufruf der Suchseite im sichtbaren Browser bekommt **403 DataDome**. Fredys Weg (DataDome-Cookie per Seitenaufruf holen, dann die interne API) ist Umgehung einer Bot-Erkennung und wird bewusst nicht gebaut. Mögliche legitime Wege: Suchauftrag-Mails auslesen oder ein Abruf vom Rechner des Nutzers; beides braucht seine Entscheidung.
5. Routine „Reparatur" (nur bei zwei Ausfällen in Folge) — Plan 2.

## Fallen

- Fredy steht unter Apache-2.0 **mit Commons Clause** — Wissen nutzen, keinen Code kopieren.
- `curl` ist in dieser Umgebung nicht ausführbar; für Probeaufrufe `node -e` mit `fetch` aus `scraper/`.

- Reset- und Löschbefehle auf der Live-DB blockt der Auto-Modus; der Nutzer löst sie selbst aus.
- `workflow_dispatch` geht nur für Workflows, die auf `main` liegen.
- Claude-Routinen pushen nicht aufs Handy (Test `trig_01SXSzLqQdbxzU3bLD1c34yS`).
- Zugangsdaten nie selbst erzeugen oder eintragen; der Nutzer macht das.
