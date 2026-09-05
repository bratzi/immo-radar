create extension if not exists "pgcrypto";

create table listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  url text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  is_active boolean not null default true,
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
  metrics jsonb not null
);

create index listing_versions_listing_id_idx on listing_versions (listing_id, scanned_at desc);

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
