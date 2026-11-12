# Übergabe — Stand 2026-11-12, 13:30 Uhr

**Arbeitsweise:** `CLAUDE.md` (Caveman und Credit-Regeln, lädt automatisch).

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
  Supabase-Connector (`execute_sql`). Seit 2026-11-12: Filterleiste (Warmmiete, Zimmer, Fläche,
  Balkon, offene Angaben, befristet, Quellen; nur in der Seite, `dash/params` als Startwerte),
  Karte nach PLZ-Mittelpunkt (`files/plz.js`, WZB-Datensatz), je Wohnung „online seit“
  (falls die Quelle es nennt), „im Radar seit“ und „zuletzt gesehen“. Die Pipeline speichert seit
  `2157904` alles Gesehene, auch „nein“, damit sich das Profil lockern lässt. Die Such-URLs nutzen
  seit `826b3b7` das **Fangnetz** `FANGNETZ` in `lib/profil.ts` (bis 1.800 €, ab 1 Zi., ab 30 m²);
  das Profil selbst bleibt 1.300 € / 2 Zi. / 45 m².
- Radar seit 2026-11-12 außerdem: Karte der 25 Stadtbezirke (`files/bezirke.js`, opendata.muenchen.de,
  dl-de/by-2-0; Ringe für d3 im Uhrzeigersinn gedreht), Klick auf Bezirk filtert; Filter €/m², Bezirk,
  „nur neu 24 Std.“, Sortierung; Diagramme Mietverteilung, Fläche gegen Miete, neu je Tag;
  Ansicht Karten oder Tabelle. **Falle:** Elemente außerhalb des eigenen `data-draw` anzuhängen
  (Tooltip an `parentNode`) meldet `check` als `stray_write`.
- **Routine „Reparatur“ gebaut** (`9d7874f`, Plan `plans/2026-11-12-routine-reparatur.md`):
  - `lib/brueche.ts` enthält die reinen Regeln (13 Tests).
  - `scripts/pruefe-brueche.mts` ist der letzte Schritt in `scrape.yml` (`if: always()`, Fehler werden nur geloggt). Es legt die Issues an: „Reparatur: <quelle>“ mit Label `reparatur` bei 2× fehler oder 0 gesehen, „Sperre: <quelle>“ bei 3× gesperrt.
  - Bei Erholung kommentiert es das offene Issue einmal.
  - **Falle:** Issues vom GITHUB_TOKEN starten keine `issues`-Workflows. Deshalb startet das Skript `reparatur.yml` selbst per workflow_dispatch.
  - `reparatur.yml` nutzt claude-code-action mit Opus, PR „Fixes #n“, kein Merge. Es ist **ungetestet, bis der Nutzer `ANTHROPIC_API_KEY` anlegt**; ohne das Secret bricht es mit einem Hinweis ab.
- **Suchgebiet seit `91a4ecc`:**
  - Stadt plus die Südwest-Bucht der Stadtgrenze (`UMLAND_SUEDWEST`: 82061 Neuried, 82152 Planegg/Martinsried, 82166 Gräfelfing), auf Wunsch des Nutzers („Leerraum unten links“).
  - Fürstenried war schon drin (8147x, ~63 Inserate).
  - ImmoScout fragt alle vier Geocodes kommagetrennt ab. Probelauf `pruefung.yml` pruefe-quelle immoscout24: Run 43213437738.
  - Kleinanzeigen (`l6411`) und WG-Gesucht (`city_id=90`) suchen weiter nur die Stadt. Ohne-Makler liefert das Umland ohnehin.
  - WG-Gesucht ordnet Fürstenried/Forstenried jetzt 81476 und Solln 81479 zu, statt 81379.
  - Radar: `files/plz.js` v2 mit `PLZ_UMLAND`; `index.html` v17 lässt „ausserhalb_muenchen“ für diese PLZ durch.
- `pruefung.yml` bietet jetzt alle Quellen zur Auswahl.
- **Radar-Redesign (`index.html` v19, 2026-11-12):** vier Kennzahlen oben (passen, neu online 24 Std., günstigste, Median €/m²); Filter als Pillen, Selteneres unter „Weitere Filter“; ab 1000 px Liste links, Karte rechts mitlaufend; Karten mit großem Preis, drei Eckdaten-Kacheln, Statusleiste links, „Neu“ nach frühestem Zeitpunkt (online seit, sonst im Radar seit; gilt auch für den Filter „nur neu“). Auswertung und Läufe klappbar. v21: Hover beidseitig auch in der Tabelle; Klick auf Punkt springt zur Karte oder Zeile der aktuellen Ansicht. v20: Hover beidseitig (Punkt hebt Karte hervor, Karte lässt Punkt pulsieren, auch per Tastaturfokus; Puls nur ohne „Bewegung reduzieren“). Vorlage v17 steht nicht im Repo; `files/index.html` Version 18 = erste Fassung.
- **Takt:** GitHub startet `schedule` nur etwa 3-mal am Tag statt ~50-mal (gemessen 2026-11-03
  bis 2026-11-12). Seit `0c01274` stößt Supabase den Lauf selbst an: `pg_cron` (6 Jobs `radar-*`,
  gleicher Takt in UTC) → `public.starte_lauf()` → `pg_net` → workflow_dispatch. Höchstens 1×
  je 5 min, nicht während ein Lauf läuft. SQL: `scripts/sql/2026-11-12-lauf-starten.sql`.
  `lauf_status` (eine Zeile) schreibt `main.ts`, `lauf_anfragen` protokolliert jeden Versuch.
  Radar: Knopf „Jetzt scannen“ setzt `anfrage` (Ziffern), Datenquelle `betrieb` ruft
  `radar_betrieb('{{anfrage}}')`; neue Nummer = ein Start, gleiche Nummer = nichts.
  **Token liegt seit 2026-11-12 im Vault** (fine-grained `immo-radar-scrape-start`, nur `bratzi/immo-radar`,
  Actions: Read and write, läuft am 2027-02-10 ab — vorher erneuern). Erster Start: Run 43201166311, GitHub 204.
  Früher: GitHub-Token (fine-grained, `bratzi/immo-radar`, Actions: Read and write)
  im Supabase-Vault als `github_actions_token`. Bis dahin meldet jeder Versuch „kein Token“,
  und es laufen nur die ~3 GitHub-Läufe am Tag. Beide Funktionen sind für `anon`/`authenticated`
  gesperrt.
- Exposé-Daten bleiben seit `a82c62d` erhalten, solange die Kaltmiete gleich ist; das
  Detailbudget (15) geht zuerst an passende, dann an knapp zu teure Angebote.
- ImmoScout liest seit `9c65d30` bis 16 Seiten (Fangnetz ~720 Inserate), Lauf 43191744692:
  614 gesehen, 19 passend, vollständig, gut 3 min — nahe am Sweep-Budget von 3 min.
- „Online seit“: Kleinanzeigen genau, ImmoScout („vor 8 Stunden“) und WG-Gesucht („2 T.“ oder Datum)
  seit `634d683`; der früheste Wert bleibt. Ohne-Makler nennt nichts.
- **Falle WG-Gesucht:** `rmMin=1` filtert auf 3 statt 103 Treffer; bei „ab 1 Zimmer“ weglassen (`0286478`).
- Der Laufbericht „passend“ zählt nur, was der Lauf selbst gesehen hat; bei unvollständigen Läufen
  (Kleinanzeigen, Ohne-Makler) stehen ältere Treffer weiter in der Datenbank.

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
5. Erledigt: Routine „Reparatur“. Offen beim Nutzer: Secret `ANTHROPIC_API_KEY`.
6. Erledigt: WG-Gesucht 42 gesehen, vollständig. ImmoScout mit Umland (Lauf 13:08, `f10d656`): 624 gesehen, 23 passend, vollständig, 182 s. Budget reicht noch.

## Fallen

- Fredy steht unter Apache-2.0 **mit Commons Clause** — Wissen nutzen, keinen Code kopieren.
- `curl` ist in dieser Umgebung nicht ausführbar; für Probeaufrufe `node -e` mit `fetch` aus `scraper/`.

- Reset- und Löschbefehle auf der Live-DB blockt der Auto-Modus; der Nutzer löst sie selbst aus.
- `workflow_dispatch` geht nur für Workflows, die auf `main` liegen.
- Claude-Routinen pushen nicht aufs Handy (Test `trig_01SXSzLqQdbxzU3bLD1c34yS`).
- Zugangsdaten nie selbst erzeugen oder eintragen; der Nutzer macht das.
