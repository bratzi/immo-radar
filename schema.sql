create extension if not exists "pgcrypto";

create table listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  url text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  -- Zeitpunkt, ab dem das Objekt im vollstaendigen Sweep fehlte. Nach Ablauf
  -- der Karenz wird die Zeile hart geloescht. null = regulaer im Angebot.
  disappeared_at timestamptz,
  -- Letzte Detailerfassung. Steuert, wann die Detailseite neu geholt wird.
  last_detail_at timestamptz,
  -- Region, auf deren Ergebnisliste das Objekt gefunden wurde (Bundesland-
  -- kuerzel, z. B. "he"). null = nicht zuzuordnen.
  --
  -- WOZU: Immowelts external_id ist eine UUID und verraet den Fundort nicht,
  -- anders als ZVGs "sn-40908". Ohne diese Angabe laesst sich nicht sagen,
  -- welcher Sweep ein Objekt ueberhaupt abgedeckt hat -- und damit darf
  -- Immowelt nie auf Abwesenheit hin loeschen. Die Spalte sammelt die
  -- Grundlage dafuer; das Loeschverhalten aendert sie noch nicht.
  --
  -- null bleibt bewusst zulaessig: der Altbestand hat keinen Fundort mehr,
  -- und ZVG braucht keinen. Unzuordenbares ist nie ein Abgang -- dieselbe
  -- Regel, die `imGeltungsbereich` fuer unlesbare ZVG-Partitionen anwendet.
  fundort text,
  unique (source, external_id)
);

create table listing_versions (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  price_cents bigint not null,
  rent_cold_monthly_cents bigint,
  rent_source text not null,
  living_area_m2 numeric,
  plot_area_m2 numeric,
  units integer,
  units_confident boolean not null default false,
  year_built integer,
  zip_code text,
  city text,
  bundesland text,
  title text,
  changed boolean not null default false,
  price_dropped boolean not null default false,
  metrics jsonb not null,
  auction_at timestamptz,
  court text,
  case_number text,
  raw_notice_text text,
  data_gaps text[] not null default '{}'
);

create index listing_versions_listing_id_idx on listing_versions (listing_id, scanned_at desc);

create index listings_disappeared_at_idx on listings (disappeared_at)
  where disappeared_at is not null;

-- Referenz fuer die Mengenplausibilitaet. Ohne Historie keine Loeschung.
create table sweep_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  started_at timestamptz not null default now(),
  -- Was das Portal als Trefferzahl ausweist; null, wenn es keine nennt
  -- (zvg-portal.de nennt keine).
  gemeldete_treffer integer,
  -- Was der Sweep tatsaechlich eingesammelt hat.
  gesehene_objekte integer not null,
  vollstaendig boolean not null,
  geltungsbereich text[] not null default '{}'
);

create index sweep_runs_source_idx on sweep_runs (source, started_at desc);

-- Mengenhistorie je REGION. Bewusst eine eigene Tabelle und keine Spalte in
-- sweep_runs: `ladeSweepHistorie` bildet den Median dort ueber alle Zeilen
-- einer Quelle und filtert nur auf `vollstaendig`. Regionszeilen wuerden in
-- genau diesen Median einflieszen -- eine Region mit 200 Objekten neben einem
-- Quellenlauf mit 5.000 verschiebt ihn beliebig -- und damit die Wache
-- verfaelschen, die vor einer Massenloeschung schuetzt. Getrennt kann das
-- strukturell nicht passieren, und keine bestehende Abfrage aendert sich.
--
-- Diese Tabelle aendert heute NICHTS am Loeschverhalten. Sie sammelt die
-- Referenzlaeufe, die eine spaetere regionsgenaue Loeschhoheit braucht --
-- wirksam wird die ohnehin erst, wenn eine Region MIN_REFERENZLAEUFE eigene
-- erfolgreiche Laeufe vorweisen kann.
create table sweep_region_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  -- Bundeslandkuerzel, z. B. "he".
  partition text not null,
  started_at timestamptz not null default now(),
  gesehene_objekte integer not null,
  gemeldete_treffer integer,
  vollstaendig boolean not null,
  -- WORAN die Vollstaendigkeit gemessen wurde: 'gemeldete_treffer',
  -- 'hochwassermarke' oder 'keiner'. Nullable NUR wegen der acht Altzeilen
  -- vom 2026-09-08, die aus der Zeit vor jedem Massstab stammen (belegt in
  -- specs/2026-09-16-vollstaendig-ohne-trefferzahl.md). Sie sind die
  -- einzigen Zeilen mit vollstaendig=true ohne Beleg, und genau daran
  -- sollen sie erkennbar bleiben.
  massstab text,
  -- Die Menge, gegen die geurteilt wurde. Bei massstab='keiner' null.
  referenz_menge integer
);

create index sweep_region_runs_idx
  on sweep_region_runs (source, partition, started_at desc);

create table rent_estimates (
  zip_code text primary key,
  avg_rent_per_m2_cents integer not null,
  sample_size integer not null,
  updated_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  detail jsonb
);

-- Postgres legt fuer Fremdschluessel keinen Index an; hoechsteGemeldeteKlasse
-- fragt notifications einmal je Kandidat ab.
create index notifications_listing_id_idx on notifications (listing_id);

-- RLS auf allen Tabellen aktivieren, bewusst OHNE Policies: dieser Plan hat
-- kein Dashboard/Anon-Zugriff, daher soll fuer anon/authenticated grundsaetzlich
-- nichts sichtbar/schreibbar sein. Nur der service_role-Key (ausschliesslich
-- im Scraper verwendet) umgeht RLS und behaelt vollen Zugriff. Macht das
-- Projekt-Erstellungs-Haekchen "Automatically expose new tables" wirkungslos,
-- unabhaengig davon wie es beim Anlegen gesetzt war.
alter table listings enable row level security;
alter table listing_versions enable row level security;
alter table rent_estimates enable row level security;
alter table notifications enable row level security;
alter table sweep_runs enable row level security;
alter table sweep_region_runs enable row level security;
