-- Lets a bad receipt be taken down without deleting evidence of it.
alter table public.receipts add column hidden boolean not null default false;

-- Count-then-insert as one transaction, serialized per sharer, so a burst of parallel requests
-- can't all see "under the limit" and slip through. Returns false when the sharer is over the limit.
create function public.insert_receipt_rate_limited(
  p_id text,
  p_data jsonb,
  p_total_usd numeric,
  p_value_multiple numeric,
  p_avoidable_usd numeric,
  p_ip_hash text,
  p_max_per_window int,
  p_window interval
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));

  if (
    select count(*) from public.receipts
    where ip_hash = p_ip_hash and created_at >= now() - p_window
  ) >= p_max_per_window then
    return false;
  end if;

  insert into public.receipts (id, data, total_usd, value_multiple, avoidable_usd, ip_hash)
  values (p_id, p_data, p_total_usd, p_value_multiple, p_avoidable_usd, p_ip_hash);
  return true;
end;
$$;

-- Only the server (service role) may call it; RLS already blocks anon/authenticated on the table.
revoke all on function public.insert_receipt_rate_limited from public, anon, authenticated;
grant execute on function public.insert_receipt_rate_limited to service_role;
