create table if not exists public.product_categories (
  slug text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.product_categories (slug, name)
values
  ('carnicos', 'Cárnicos'),
  ('vegetales', 'Vegetales'),
  ('viandas', 'Viandas'),
  ('legumbres', 'Legumbres')
on conflict (slug) do update set name = excluded.name;

alter table public.product_categories enable row level security;
grant select on public.product_categories to authenticated;

drop policy if exists "Authenticated users can read product categories" on public.product_categories;
create policy "Authenticated users can read product categories"
on public.product_categories for select to authenticated
using (true);

alter table public.products drop constraint if exists products_category_fkey;
alter table public.products
  add constraint products_category_fkey
  foreign key (category) references public.product_categories(slug) not valid;
