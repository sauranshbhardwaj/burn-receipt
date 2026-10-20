-- Shared receipts. Only the server (service role) reads or writes this table; the browser never
-- talks to Supabase directly, so RLS is enabled with no policies = deny-all for anon/authenticated.
create table public.receipts (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{10}$'),
  -- Validated ReceiptData (numbers and enums only; see packages/core/src/receipt-data.ts).
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 8192),
  total_usd numeric(12, 2) not null check (total_usd >= 0),
  value_multiple numeric(12, 2) check (value_multiple >= 0),
  avoidable_usd numeric(12, 2) not null check (avoidable_usd >= 0),
  -- HMAC of the sharer's IP with a server secret, only used for rate limiting. Never the raw IP.
  ip_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.receipts enable row level security;

create index receipts_created_at_idx on public.receipts (created_at desc);
create index receipts_ip_hash_created_at_idx on public.receipts (ip_hash, created_at desc);
create index receipts_value_multiple_idx on public.receipts (value_multiple desc nulls last);
