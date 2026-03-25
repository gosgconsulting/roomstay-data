-- Persisted price widget configs (Price Widget tool). RLS: account owner only.

create table if not exists public.price_widgets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id) on delete cascade,
  search_query text not null default '',
  check_in_date date not null,
  check_out_date date not null,
  number_of_adults integer not null default 2,
  number_of_children integer not null default 0,
  currency_code text not null default 'USD',
  max_crawled_hotels integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists price_widgets_account_id_idx on public.price_widgets (account_id);

alter table public.price_widgets enable row level security;

drop policy if exists "Users select own account price_widgets" on public.price_widgets;
create policy "Users select own account price_widgets"
  on public.price_widgets for select
  using (
    exists (
      select 1 from public.accounts a
      where a.id = price_widgets.account_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "Users insert own account price_widgets" on public.price_widgets;
create policy "Users insert own account price_widgets"
  on public.price_widgets for insert
  with check (
    exists (
      select 1 from public.accounts a
      where a.id = price_widgets.account_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "Users update own account price_widgets" on public.price_widgets;
create policy "Users update own account price_widgets"
  on public.price_widgets for update
  using (
    exists (
      select 1 from public.accounts a
      where a.id = price_widgets.account_id and a.user_id = auth.uid()
    )
  );

drop policy if exists "Users delete own account price_widgets" on public.price_widgets;
create policy "Users delete own account price_widgets"
  on public.price_widgets for delete
  using (
    exists (
      select 1 from public.accounts a
      where a.id = price_widgets.account_id and a.user_id = auth.uid()
    )
  );
