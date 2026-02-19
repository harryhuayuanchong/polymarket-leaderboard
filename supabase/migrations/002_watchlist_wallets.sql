create table if not exists public.watchlist_wallets (
  client_id text not null,
  wallet_address text not null,
  created_at timestamptz not null default now(),
  primary key (client_id, wallet_address)
);

create index if not exists watchlist_wallets_client_idx
  on public.watchlist_wallets (client_id, created_at desc);
