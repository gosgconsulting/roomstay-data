-- Server-side cache table for report/year query payloads.
-- Used by the get-cached-report-data edge function.
create table if not exists public.query_cache (
  cache_key text primary key,
  report_id text not null,
  payload jsonb not null,
  cache_version integer not null default 1,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists query_cache_report_id_idx
  on public.query_cache (report_id);

create index if not exists query_cache_expires_at_idx
  on public.query_cache (expires_at);

-- Keep this table server-managed. Frontend should never write directly.
alter table public.query_cache enable row level security;

drop policy if exists "Service role manages query_cache" on public.query_cache;
create policy "Service role manages query_cache"
on public.query_cache
as permissive
for all
to service_role
using (true)
with check (true);
