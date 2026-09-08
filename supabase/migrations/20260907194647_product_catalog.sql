create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  category text not null check (category in ('carnicos', 'vegetales', 'viandas', 'legumbres')),
  price_cents integer not null check (price_cents >= 0),
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.products add column if not exists name text;
alter table public.products add column if not exists description text not null default '';
alter table public.products add column if not exists category text check (category in ('carnicos', 'vegetales', 'viandas', 'legumbres'));
alter table public.products add column if not exists price_cents integer check (price_cents >= 0);
alter table public.products add column if not exists image_path text;
alter table public.products add column if not exists created_at timestamptz not null default now();
alter table public.products add column if not exists updated_at timestamptz not null default now();

create index if not exists products_by_owner_category on public.products(owner_id, category, created_at desc);

alter table public.products enable row level security;

grant select, insert, update, delete on public.products to authenticated;

drop policy if exists "Users can read their products" on public.products;
create policy "Users can read their products"
on public.products for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "Users can add their products" on public.products;
create policy "Users can add their products"
on public.products for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can update their products" on public.products;
create policy "Users can update their products"
on public.products for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "Users can delete their products" on public.products;
create policy "Users can delete their products"
on public.products for delete to authenticated
using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Users can read product images" on storage.objects;
create policy "Users can read product images"
on storage.objects for select to authenticated
using (bucket_id = 'product-images');

drop policy if exists "Users can upload their product images" on storage.objects;
create policy "Users can upload their product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can update their product images" on storage.objects;
create policy "Users can update their product images"
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
