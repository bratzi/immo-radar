# immo-radar 2.0 — Mietwohnung in München (Entwurf)

**Stand:** 2026-11-11. **Status:** Entwurf, vom Nutzer in der Sitzung
beauftragt; die Entscheidungen unten sind seine Antworten.

## 1. Ziel

Der Nutzer sucht eine Mietwohnung in München. Das Projekt soll neue Angebote
schnell finden, hart filtern und sofort per Telegram melden. Das bisherige
Ziel (Mehrfamilienhäuser mit Rendite, Zwangsversteigerungen) entfällt
vollständig.

**Suchprofil (Pflicht):**

| Merkmal | Regel |
|---|---|
| Ort | Stadt München (alle Stadtbezirke) |
| Art | Wohnung zur Miete, kein WG-Zimmer, keine Zwischenmiete unter 12 Monaten |
| Warmmiete | höchstens 1.300 € |
| Zimmer | mindestens 2 |
| Wohnfläche | mindestens 45 m² |
| Balkon | Pflicht (Balkon, Loggia, Terrasse oder Dachterrasse zählen) |

**Bonus (nur Reihung, kein Ausschluss):** 3 Zimmer, niedrige Warmmiete je m²,
Nähe zur Stadtmitte, Angebot jünger als 2 Stunden.

**Erfolg heißt:** ein passendes Angebot erscheint innerhalb eines Laufs nach
seiner Veröffentlichung als Telegram-Nachricht mit Link, Preis, Fläche,
Zimmern, Balkonbeleg und Stadtteil. Fehlmeldungen (kein Balkon, zu teuer)
sind der Hauptfehler, den der Entwurf vermeidet.

## 2. Entscheidungen des Nutzers vom 2026-11-11

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Budget kalt oder warm | **Warm, 1.300 €.** Fehlt die Warmmiete, wird sie als Kaltmiete + Nebenkosten gerechnet; fehlt auch das, gilt Kaltmiete × 1,25 als Schätzung und der Treffer wird als „Warmmiete geschätzt" markiert. |
| 2 | Quellen | **Immowelt, ImmoScout24, Kleinanzeigen, WG-Gesucht.** Reihenfolge der Umsetzung: Immowelt (vorhanden), Kleinanzeigen, WG-Gesucht, ImmoScout24 (höchstes Sperr-Risiko, zuletzt). |
| 3 | Datenbank | **Alle alten Tabellen löschen**, neues Schema. Telegram-Bot, Supabase-Projekt und Cloudflare-Pages-Projekt bleiben. |
| 4 | Takt | **Alle 30 Minuten.** GitHub-Cron ist Bemühen, real eher 45 bis 60 Minuten. |

## 3. Was bleibt, was geht

**Bleibt (Infrastruktur, bewährt):**

- Playwright mit sichtbarem Chromium unter `xvfb-run` in GitHub Actions. Immowelt sperrt headless (HTTP 403, DataDome). Ein CAPTCHA wird nicht gelöst, sondern als Drosselsignal gewertet.
- Sperre gegen Live-Läufe am privaten Anschluss (`lib/nurInCi.ts`). Lokal laufen nur `npm test` und `tsc`.
- Supabase als Datenbank, Zugriff nur mit `service_role`, RLS ohne Policies.
- Telegram-Versand (`lib/telegram.ts`: `sendTelegramMessage`, `sendTelegramPhotos`, Mediengruppen).
- Consent- und Overlay-Behandlung (`scrapers/consent.ts`, `scrapers/overlays.ts`).
- Blätterlogik und Detail-Urteil des Immowelt-Scrapers (`blaettereWeiter`, `beurteileDetailAntwort`).
- Dashboard: Vite + React, Snapshot-JSON aus der Datenbank, Cloudflare Pages hinter Access (nur die E-Mail des Nutzers). Virtuelle Liste und Filterleiste werden umgebaut, nicht neu geschrieben.
- Workflows `scrape.yml`, `deploy-dashboard.yml`, `pruefung.yml`; Secrets unverändert.

**Geht (Fachlogik der alten Aufgabe):**

- `lib/metrics.ts`, `rentEstimate.ts`, `grunderwerbsteuer.ts`, `meldung.ts`, `meldebudget.ts`, `ranking.ts`, `regionsMassstab.ts`, `plausibilitaet.ts`, `bestand.ts`, `bestandDb.ts`, `snapshot*.ts` in jetziger Form.
- `scrapers/zvg-portal/` komplett.
- Regionsrotation, Vollständigkeitsmaßstäbe, Hochwassermarken, Sweep-Historie, Löschhoheit, Karenz, Mengenplausibilität. Begründung: diese Wachen schützten einen Bestand von 23.000 Zeilen vor Massenlöschung. Der neue Bestand ist ein paar hundert Angebote groß und wird je Lauf vollständig neu gesehen. Ein Angebot, das zwei Läufe fehlt, gilt als weg. Mehr braucht es nicht.
- Deutschlandkarte, PLZ-Bundesland-Tabellen, Mietprüfdaten.
- Alle alten Specs und Pläne wandern nach `docs/archiv/2026-09-mehrfamilienhaus/`. `BACKLOG.md`, `TODO.md`, `UEBERGABE.md`, `ABNAHME-BASIS.md` werden neu geschrieben.

## 4. Architektur

```
scraper/
  main.ts                 Lauf: alle Quellen sweepen -> Kandidaten filtern
                          -> Details nur für Unklare -> neue Treffer melden
                          -> Abgänge markieren -> Snapshot schreiben
  lib/
    profil.ts             DAS Suchprofil als Konstante + reine Filterfunktion
                          pruefeProfil(angebot) -> { passt, gruende[] }
    warmmiete.ts          Warmmiete bestimmen: angegeben / kalt+NK / geschätzt
    balkon.ts             Balkonbeleg aus Merkmalsliste, Titel, Beschreibung
    reihung.ts            Punkte für Bonusmerkmale, stabile Sortierung
    angebote.ts           Tabelle angebote: upsert, zuletzt gesehen,
                          verschwunden, bereits gemeldet
    meldung.ts            Telegram-Text für Treffer / Preissenkung
    lauf.ts               Tabelle laeufe: je Quelle gesehen, gefiltert,
                          gemeldet, Dauer, Fehler
    snapshot.ts           Dashboard-JSON
    nurInCi.ts, nebenlaeufig.ts, supabase.ts, telegram.ts (bleiben)
  scrapers/
    typen.ts              Angebot (gemeinsames Modell aller Quellen)
    immowelt/             Mietsuche München, Liste + Detail
    kleinanzeigen/        Liste + Detail
    wg-gesucht/           Kategorie 2- bis 3-Zimmer-Wohnung, Liste + Detail
    immoscout24/          Liste + Detail, mit Abbruch bei Sperre
    consent.ts, overlays.ts (bleiben)
web/                      Dashboard: Trefferliste, Filter, Stadtkarte München
```

### 4.1 Gemeinsames Angebotsmodell

```ts
interface Angebot {
  quelle: "immowelt" | "kleinanzeigen" | "wg-gesucht" | "immoscout24";
  externalId: string;
  url: string;
  titel: string;
  kaltmieteCents: number | null;
  nebenkostenCents: number | null;
  warmmieteCents: number | null;
  warmmieteQuelle: "angegeben" | "kalt_plus_nk" | "geschaetzt" | "unbekannt";
  zimmer: number | null;
  flaecheM2: number | null;
  balkon: "ja" | "nein" | "unbekannt";
  balkonBeleg: string | null;      // der Textschnipsel, der "ja" begründet
  plz: string | null;
  stadtteil: string | null;
  verfuegbarAb: string | null;
  befristet: boolean | null;
  bildUrls: string[];
  veroeffentlichtAm: string | null;
  detailGeladen: boolean;
}
```

### 4.2 Datenfluss je Lauf

1. **Sweep je Quelle**, nacheinander, Drossel je Quelle (Immowelt 5 s, andere 3 s). Die Suchfilter der Portale übernehmen Ort, Miete, Zimmer, Fläche vorab; der Code prüft trotzdem jedes Feld selbst. Portalfilter sind Vorauswahl, nicht Beleg.
2. **Profilprüfung auf Listendaten.** Eindeutig raus (zu teuer, zu klein, 1 Zimmer): verwerfen, nicht speichern. Eindeutig rein: weiter. Unklar (Balkon unbekannt, Warmmiete fehlt): Detailseite laden.
3. **Detailseiten** nur für Unklare und für neue Treffer (Bilder, Beschreibung). Budget 10 Minuten je Lauf.
4. **Abgleich mit `angebote`:** neu, bekannt, Preis gesunken, nicht mehr gesehen. Ein Angebot, das in zwei aufeinanderfolgenden vollständigen Sweeps seiner Quelle fehlt, bekommt `verschwunden_am`. Keine harte Löschung im Lauf; ein Monatsjob räumt Verschwundenes älter als 60 Tage.
5. **Meldung:** jeder neue Treffer sofort, höchstens 15 je Lauf (Rest im nächsten Lauf, Reihung entscheidet). Preissenkung bei bekanntem Treffer: eine Zeile. Kein Abgangsalarm per Telegram, Abgang nur im Dashboard.
6. **Lauf protokollieren**, Snapshot schreiben.

### 4.3 Profilprüfung (`lib/profil.ts`)

Reine Funktion, vollständig testbar. Gibt `passt: "ja" | "nein" | "unklar"`
und Gründe zurück. Regeln:

- Warmmiete über 130.000 Cents: raus. Null: unklar.
- Zimmer unter 2: raus. Null: unklar.
- Fläche unter 45: raus. Null: unklar.
- Balkon „nein": raus. „unbekannt": unklar.
- Befristet unter 12 Monaten oder WG-Zimmer: raus.
- PLZ außerhalb 80331 bis 81929: raus (Münchner Stadtgebiet). Null: unklar.

„Unklar" nach geladener Detailseite wird zu „raus" bei Balkon und Warmmiete
(ohne Beleg keine Meldung) und zu „rein mit Hinweis" bei PLZ, wenn der
Stadtteil erkennbar ist.

### 4.4 Balkonbeleg (`lib/balkon.ts`)

Quellen in dieser Reihenfolge: strukturierte Ausstattungsliste des Portals,
Titel, Beschreibung. Positiv: `balkon`, `loggia`, `terrasse`,
`dachterrasse`, `südbalkon`, `westbalkon` und ähnliche. Negativ-Muster
gewinnen: `kein balkon`, `ohne balkon`, `balkon nicht vorhanden`,
`französischer balkon` (zählt nicht). Der Treffer-Schnipsel wird gespeichert
und in der Telegram-Nachricht gezeigt, damit der Nutzer den Beleg selbst sieht.

### 4.5 Reihung (`lib/reihung.ts`)

Punkte, höher ist besser: 3 und mehr Zimmer +30; Warmmiete je m² unter 22 €
+20, unter 25 € +10; Stadtteil in Ring 1 (Altstadt, Maxvorstadt, Schwabing,
Haidhausen, Au, Isarvorstadt, Ludwigsvorstadt, Neuhausen, Glockenbach) +15,
Ring 2 +5; jünger als 2 Stunden +10; Warmmiete angegeben +5. Reihung
bestimmt nur die Reihenfolge der Meldungen, nie den Ausschluss.

### 4.6 Quellen

| Quelle | Einstieg | Besonderheit |
|---|---|---|
| Immowelt | `immowelt.de/suche/muenchen/wohnungen/mieten` mit Parametern Zimmer ab 2, Fläche ab 45, Miete bis 1.300 | sichtbarer Browser, 5 s Drossel, DataDome |
| Kleinanzeigen | Kategorie Mietwohnungen, Ort München, Preis bis 1.300, Zimmer ab 2 | Warmmiete fehlt oft, Nebenkosten im Detail |
| WG-Gesucht | Kategorie 2- und 3-Zimmer-Wohnungen, Stadt München | viele Zwischenmieten, Befristung aus Detail lesen |
| ImmoScout24 | Suche Wohnung mieten München | harter Bot-Schutz; bei 403 oder CAPTCHA bricht die Quelle ab, der Lauf läuft weiter, `laeufe` vermerkt „gesperrt" |

Jede Quelle liefert `Angebot[]` und `{ vollstaendig: boolean }`. Nur
vollständige Sweeps zählen für Abgänge.

### 4.7 Schema (neu, `schema.sql`)

```sql
drop table if exists notifications, listing_versions, listings, sweep_runs,
  sweep_region_runs, rent_estimates cascade;

create table angebote (
  id uuid primary key default gen_random_uuid(),
  quelle text not null,
  external_id text not null,
  url text not null,
  titel text,
  kaltmiete_cents integer,
  nebenkosten_cents integer,
  warmmiete_cents integer,
  warmmiete_quelle text not null default 'unbekannt',
  zimmer numeric,
  flaeche_m2 numeric,
  balkon text not null default 'unbekannt',
  balkon_beleg text,
  plz text,
  stadtteil text,
  verfuegbar_ab text,
  befristet boolean,
  bild_urls text[] not null default '{}',
  veroeffentlicht_am timestamptz,
  passt text not null,                 -- 'ja' | 'nein' | 'unklar'
  gruende text[] not null default '{}',
  punkte integer not null default 0,
  erstmals_gesehen timestamptz not null default now(),
  zuletzt_gesehen timestamptz not null default now(),
  verschwunden_am timestamptz,
  detail_geladen_am timestamptz,
  gemeldet_am timestamptz,
  letzte_warmmiete_gemeldet_cents integer,
  unique (quelle, external_id)
);

create table laeufe (
  id uuid primary key default gen_random_uuid(),
  gestartet_am timestamptz not null default now(),
  quelle text not null,
  gesehen integer not null,
  passend integer not null,
  unklar integer not null,
  gemeldet integer not null,
  vollstaendig boolean not null,
  status text not null,                -- 'ok' | 'gesperrt' | 'fehler'
  dauer_ms integer,
  hinweis text
);
```

Die Migration läuft über einen einmaligen Workflow `reset-datenbank.yml`
(SQL per Supabase-Management-API, Secret vorhanden), nicht lokal: der
Auto-Modus sperrt Schreibzugriffe auf die Live-Datenbank.

### 4.8 Telegram-Nachricht

```
Treffer · Schwabing-West · 1.240 € warm
2,5 Zi · 52 m² · 23,8 €/m² warm · Balkon ja („sonniger Südbalkon")
frei ab 01.01.2027 · Immowelt · vor 40 min
https://…
```

Danach bis zu 10 Bilder als Mediengruppe. „Warmmiete geschätzt" steht als
eigene Zeile, wenn zutreffend.

### 4.9 Dashboard

Eine Seite: Trefferliste (passend, sortiert nach Punkten), Reiter
„Unklar" und „Verschwunden", Filter nach Quelle, Zimmer, Stadtteil, Preis.
Karte: Münchner Stadtgebiet mit Punkten je Treffer (PLZ-Mittelpunkte der
Münchner Postleitzahlen als Tabelle im Repo). Betriebstafel: letzter Lauf je
Quelle, Status, gesehen und gemeldet.

### 4.10 Betrieb

- `scrape.yml`: `cron "17,47 * * * *"`, Timeout 25 Minuten, Budgets: Sweep
  3 Minuten je Quelle, Details 10 Minuten gesamt.
- `deploy-dashboard.yml`: unverändert, läuft nach jedem Scrape.
- `pruefung.yml`: `pruefe-quelle -f quelle=immowelt` zeigt Liste und
  Profilurteil ohne Datenbank und Telegram.
- Lokal: `npm test`, `tsc --noEmit`, Fixtures aus echten Seiten im Repo.

## 5. Fehlerbehandlung

- Eine gesperrte oder kaputte Quelle stoppt nie den Lauf. Sie wird in
  `laeufe` mit Status vermerkt; drei gesperrte Läufe in Folge ergeben eine
  Telegram-Warnung, danach Ruhe bis zum nächsten Erfolg.
- Kein Feld wird geraten, außer Warmmiete (markiert). Unbelegter Balkon
  meldet nicht.
- Doppelte Angebote über Quellen (gleiches Objekt bei Immowelt und
  ImmoScout24) werden nicht zusammengeführt. Bewusst: Erkennung ist unsicher,
  eine Doppelmeldung kostet weniger als eine verschluckte.

## 6. Tests

- `profil`, `warmmiete`, `balkon`, `reihung`: Tabellen-Tests, reine Funktionen.
- Je Scraper: Parser-Tests gegen HTML-Fixtures aus `scraper/test/fixtures/<quelle>/`, aufgenommen in CI über `pruefung.yml`.
- `main`: Pipeline-Test mit gefälschten Quellen und gefälschter Datenbank (bestehendes Muster aus `pipeline.test.ts`).
- Dashboard: Snapshot-Vertragstest bleibt, Inhalt angepasst.

## 7. Reihenfolge der Umsetzung

1. Reset: Archiv, altes Schema fällt, neues Schema per Workflow, Doku neu.
2. Kern: `typen.ts`, `profil.ts`, `warmmiete.ts`, `balkon.ts`, `reihung.ts`, `angebote.ts`, `meldung.ts`, `main.ts` mit einer Fake-Quelle grün.
3. Immowelt umbauen, erster Produktionslauf, erste Telegram-Treffer.
4. Dashboard umbauen.
5. Kleinanzeigen, WG-Gesucht, ImmoScout24 nacheinander, jede mit eigenem Prüflauf.

Ab Schritt 3 liefert das Projekt Nutzen; Schritt 5 ist Ausbau.
