create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  address text not null default '' check (char_length(address) <= 240),
  phone text not null default '' check (char_length(phone) <= 40),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists suppliers_unique_name
  on public.suppliers(lower(trim(name)));

alter table public.products
  add column if not exists supplier_id uuid references public.suppliers(id) on delete restrict;

create index if not exists products_by_supplier
  on public.products(supplier_id);

alter table public.suppliers enable row level security;
revoke all on public.suppliers from anon, authenticated;
grant select, insert on public.suppliers to authenticated;

create policy "Authenticated users can read suppliers"
on public.suppliers for select to authenticated
using (true);

create policy "Authenticated users can add suppliers"
on public.suppliers for insert to authenticated
with check (created_by = (select auth.uid()));
