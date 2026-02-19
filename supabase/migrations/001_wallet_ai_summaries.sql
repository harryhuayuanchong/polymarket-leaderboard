create table if not exists public.wallet_ai_summaries (
  wallet_address text primary key,
  data_hash text not null,
  summary jsonb not null,
  source text not null check (source in ('model', 'rule_based')),
  updated_at timestamptz not null default now()
);

create index if not exists wallet_ai_summaries_updated_at_idx
  on public.wallet_ai_summaries (updated_at desc);
