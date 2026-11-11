# Übergabe — Stand 2026-11-12, 00:20 Uhr

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
  und **ImmoScout24** (Mobil-API, kein Browser, alle Seiten, ~56 Treffer, gut die Hälfte Tausch).
- Supabase-Projekt `rvzaljjbyiooqisajcxp`: Tabellen `angebote`, `laeufe`
  (Reset am 2026-11-11, Run 43104908057).
- Artifact **Wohnungsradar München** (Typ „Data"):
  https://claude.ai/artifact/3VdKkGFpbvZ5yU28i6KfYe — liest live über den
  Supabase-Connector (`execute_sql`). Seite geschrieben, Prüfung (`check`) stand
  zuletzt auf `still_loading`, also noch nicht bestätigt.

## Stand der Quellen

| Quelle | Stand |
|---|---|
| Kleinanzeigen | live, CI ohne Sperre. 5 Seiten, ~90 % Tauschangebote, Code filtert sie |
| Immowelt | Parser fehlt. CI wird per DataDome gesperrt (Run 43101998784); Fixture aus dem Browser liegt in `scraper/test/fixtures/immowelt/liste-karten.html` |
| ImmoScout24 | live seit 2026-11-12 über die inoffizielle Mobil-API (`api.mobile.immobilienscout24.de`, App-User-Agent, Wissen aus Fredy). Vom Nutzer ausdrücklich freigegeben; der Auto-Modus blockt solche Aufrufe sonst als Bot-Umgehung. Listenpreis ist **kalt**, Warmmiete kommt aus dem Exposé |
| WG-Gesucht | nicht begonnen; Vorlage: Fredy `lib/provider/wgGesucht.js` (Puppeteer) |

## Offen, in dieser Reihenfolge

1. Erste ImmoScout-Läufe prüfen (Tauschfilter, Warmmiete aus Exposé, Sperren).
2. Erste echte Treffer abwarten; Fehlmeldungen prüfen (WG-Filter am Titel seit `profil.ts`, 2026-11-11).
3. `lib/meldung.ts`, `lib/telegram.ts`, `deploy-dashboard.yml`, `setup-cloudflare-access.yml`, `web/` entfernen (Spec 11).
4. WG-Gesucht als zweite Quelle, dann Immowelt, wenn CI nicht mehr gesperrt ist.
5. Routine „Reparatur" (nur bei zwei Ausfällen in Folge) — Plan 2.

## Fallen

- Fredy steht unter Apache-2.0 **mit Commons Clause** — Wissen nutzen, keinen Code kopieren.
- `curl` ist in dieser Umgebung nicht ausführbar; für Probeaufrufe `node -e` mit `fetch` aus `scraper/`.

- Reset- und Löschbefehle auf der Live-DB blockt der Auto-Modus; der Nutzer löst sie selbst aus.
- `workflow_dispatch` geht nur für Workflows, die auf `main` liegen.
- Claude-Routinen pushen nicht aufs Handy (Test `trig_01SXSzLqQdbxzU3bLD1c34yS`).
- Zugangsdaten nie selbst erzeugen oder eintragen; der Nutzer macht das.
