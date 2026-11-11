create extension if not exists "pgcrypto";

-- Reset 2026-11-11: die Tabellen des frueheren Zwecks (Mehrfamilienhaeuser)
-- fallen. Entscheidung des Nutzers, siehe Spec 2026-11-11, Abschnitt 2.
drop table if exists notifications cascade;
drop table if exists listing_versions cascade;
drop table if exists listings cascade;
drop table if exists sweep_runs cascade;
drop table if exists sweep_region_runs cascade;
drop table if exists rent_estimates cascade;
drop table if exists angebote cascade;
drop table if exists laeufe cascade;

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
  passt text not null,
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

create index angebote_passt_idx on angebote (passt, punkte desc);
create index angebote_verschwunden_idx on angebote (verschwunden_am) where verschwunden_am is not null;

create table laeufe (
  id uuid primary key default gen_random_uuid(),
  gestartet_am timestamptz not null default now(),
  quelle text not null,
  gesehen integer not null,
  passend integer not null,
  unklar integer not null,
  gemeldet integer not null,
  vollstaendig boolean not null,
  status text not null,
  dauer_ms integer,
  hinweis text
);

create index laeufe_quelle_idx on laeufe (quelle, gestartet_am desc);

alter table angebote enable row level security;
alter table laeufe enable row level security;
