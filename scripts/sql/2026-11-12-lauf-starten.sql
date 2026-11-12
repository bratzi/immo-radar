-- Lauf-Knopf und verlaesslicher Takt (2026-11-12).
-- GitHub startet `schedule` nur ~3x am Tag; Supabase stoesst deshalb den
-- Workflow selbst an (pg_cron -> starte_lauf -> pg_net -> workflow_dispatch).
-- Das Token legt der Nutzer im Vault unter dem Namen `github_actions_token` an.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Eine Zeile: laeuft gerade ein Lauf? Schreibt der Scraper (main.ts).
create table if not exists public.lauf_status (
  id int primary key default 1 check (id = 1),
  laeuft boolean not null default false,
  gestartet_am timestamptz,
  beendet_am timestamptz,
  run_url text
);
insert into public.lauf_status (id) values (1) on conflict do nothing;

-- Jede Anfrage, einen Lauf zu starten (Knopf oder Zeitplan).
create table if not exists public.lauf_anfragen (
  id bigserial primary key,
  angefragt_am timestamptz not null default now(),
  grund text not null,
  anfrage text unique,
  meldung text not null,
  request_id bigint
);

alter table public.lauf_status enable row level security;
alter table public.lauf_anfragen enable row level security;

create or replace function public.starte_lauf(grund text, anfrage text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  token text;
  rid bigint;
  st public.lauf_status;
begin
  if anfrage is not null and exists (select 1 from public.lauf_anfragen a where a.anfrage = starte_lauf.anfrage) then
    return 'schon angefragt';
  end if;
  if exists (select 1 from public.lauf_anfragen a where a.request_id is not null and a.angefragt_am > now() - interval '5 minutes') then
    insert into public.lauf_anfragen (grund, anfrage, meldung) values (grund, anfrage, 'zu frueh: letzter Start vor weniger als 5 Minuten');
    return 'zu frueh';
  end if;
  select * into st from public.lauf_status where id = 1;
  if st.laeuft and st.gestartet_am > now() - interval '25 minutes' then
    insert into public.lauf_anfragen (grund, anfrage, meldung) values (grund, anfrage, 'laeuft bereits');
    return 'laeuft bereits';
  end if;
  select decrypted_secret into token from vault.decrypted_secrets where name = 'github_actions_token' limit 1;
  if token is null or token = '' then
    insert into public.lauf_anfragen (grund, anfrage, meldung) values (grund, anfrage, 'kein Token im Vault (github_actions_token)');
    return 'kein Token';
  end if;
  select net.http_post(
    url := 'https://api.github.com/repos/bratzi/immo-radar/actions/workflows/scrape.yml/dispatches',
    body := '{"ref":"main"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'immo-radar',
      'Content-Type', 'application/json')
  ) into rid;
  insert into public.lauf_anfragen (grund, anfrage, meldung, request_id) values (grund, anfrage, 'angefragt', rid);
  return 'angefragt';
end;
$$;

-- Fuer den Radar: liefert immer den Stand; mit einer neuen Anfragenummer
-- (vom Knopf) startet es zusaetzlich einen Lauf.
create or replace function public.radar_betrieb(anfrage text default '')
returns table (
  laeuft boolean, gestartet_am timestamptz, beendet_am timestamptz, run_url text,
  angefragt_am timestamptz, grund text, meldung text, github_status int
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if anfrage ~ '^[0-9]{6,15}$' then
    perform public.starte_lauf('knopf', anfrage);
  end if;
  return query
    select s.laeuft, s.gestartet_am, s.beendet_am, s.run_url,
           a.angefragt_am, a.grund, a.meldung, r.status_code::int
    from public.lauf_status s
    left join lateral (select * from public.lauf_anfragen x order by x.angefragt_am desc limit 1) a on true
    left join net._http_response r on r.id = a.request_id
    where s.id = 1;
end;
$$;

-- Nur der Betrieb darf das aufrufen, nicht die oeffentliche REST-Schnittstelle.
revoke all on function public.starte_lauf(text, text) from public, anon, authenticated;
revoke all on function public.radar_betrieb(text) from public, anon, authenticated;

-- Takt wie bisher in scrape.yml (UTC). GitHubs eigener Zeitplan bleibt als Reserve.
select cron.schedule('radar-werktag-tag',  '4,19,34,49 7-12 * * 1-5', $$select public.starte_lauf('zeitplan')$$);
select cron.schedule('radar-abend',        '4,19,34,49 17-21 * * *',  $$select public.starte_lauf('zeitplan')$$);
select cron.schedule('radar-morgen',       '4,34 6 * * *',            $$select public.starte_lauf('zeitplan')$$);
select cron.schedule('radar-werktag-nachm','4,34 13-16 * * 1-5',      $$select public.starte_lauf('zeitplan')$$);
select cron.schedule('radar-wochenende',   '4,34 7-16 * * 0,6',       $$select public.starte_lauf('zeitplan')$$);
select cron.schedule('radar-nacht',        '4 22,0,2,4 * * *',        $$select public.starte_lauf('zeitplan')$$);
