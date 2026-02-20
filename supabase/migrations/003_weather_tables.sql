create extension if not exists pgcrypto;

create table if not exists public.forecast_sigma (
  location_key text primary key,
  sigma_f numeric not null check (sigma_f > 0),
  updated_at timestamptz not null default now()
);

insert into public.forecast_sigma (location_key, sigma_f)
values
  ('default', 4.5),
  ('nyc', 3.8),
  ('miami', 4.2),
  ('chicago', 5.2),
  ('la', 3.5)
on conflict (location_key) do nothing;

create table if not exists public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  summary text not null,
  source text not null check (source in ('model', 'rule_based')),
  model text,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table if exists public.ai_summaries
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists cache_key text,
  add column if not exists summary text,
  add column if not exists source text,
  add column if not exists model text,
  add column if not exists payload jsonb default '{}'::jsonb,
  add column if not exists updated_at timestamptz default now();

create unique index if not exists ai_summaries_cache_key_idx
  on public.ai_summaries (cache_key);

create index if not exists ai_summaries_updated_at_idx
  on public.ai_summaries (updated_at desc);

create table if not exists public.weather_markets (
  id uuid primary key default gen_random_uuid(),
  source_market_id text,
  source_event_id text,
  event_title text not null,
  event_url text,
  market_question text,
  schema_side text,
  threshold_f numeric,
  location_name text,
  location_key text,
  target_date date,
  close_time timestamptz,
  price numeric,
  liquidity numeric,
  forecast_temp_f numeric,
  forecast_source text,
  sigma_f numeric,
  risk_profile text not null,
  p_model numeric,
  edge numeric,
  ev_net numeric,
  gates jsonb not null default '{}'::jsonb,
  signal text not null,
  status text not null,
  unsupported_reason text,
  ai_summary_id uuid references public.ai_summaries(id),
  market_snapshot jsonb not null default '{}'::jsonb,
  forecast_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.weather_markets
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists weather_markets_created_at_idx
  on public.weather_markets (created_at desc);

create index if not exists weather_markets_status_idx
  on public.weather_markets (status);

create index if not exists weather_markets_location_key_idx
  on public.weather_markets (location_key);
