alter table public.products
  add column if not exists unit_type text not null default 'unit'
  check (unit_type in ('unit', 'pound'));

alter table public.products
  add column if not exists is_available boolean not null default true;

create index if not exists products_by_availability
on public.products(is_available, created_at desc);

create or replace function public.is_product_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

create or replace function public.prevent_non_admin_availability_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.is_available is distinct from new.is_available and not public.is_product_admin() then
    raise exception 'Only product administrators can change availability';
  end if;

  return new;
end;
$$;

drop trigger if exists products_availability_admin_only on public.products;
create trigger products_availability_admin_only
before update on public.products
for each row execute function public.prevent_non_admin_availability_change();

drop policy if exists "Users can read their products" on public.products;
create policy "Authenticated users can read products"
on public.products for select to authenticated
using (true);

drop policy if exists "Users can add their products" on public.products;
drop policy if exists "Product admins can add products" on public.products;
create policy "Users can add their products"
on public.products for insert to authenticated
with check (
  (select auth.uid()) = owner_id
);

drop policy if exists "Users can update their products" on public.products;
create policy "Owners and product admins can update products"
on public.products for update to authenticated
using ((select auth.uid()) = owner_id or public.is_product_admin())
with check ((select auth.uid()) = owner_id or public.is_product_admin());

drop policy if exists "Users can delete their products" on public.products;
create policy "Product admins can delete products"
on public.products for delete to authenticated
using (public.is_product_admin());

create or replace function public.quote_product_order(order_items jsonb)
returns table (
  product_id uuid,
  unit_type text,
  unit_price_cents integer,
  quantity numeric,
  line_total_cents integer
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(order_items) <> 'array' then
    raise exception 'order_items must be an array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(order_items) as item
    where coalesce((item ->> 'quantity')::numeric, 0) <= 0
  ) then
    raise exception 'Each product quantity must be greater than zero';
  end if;

  return query
  select
    product.id,
    product.unit_type,
    product.price_cents,
    (item ->> 'quantity')::numeric,
    round(product.price_cents * (item ->> 'quantity')::numeric)::integer
  from jsonb_array_elements(order_items) as item
  join public.products as product on product.id = (item ->> 'product_id')::uuid
  where product.is_available;
end;
$$;

grant execute on function public.quote_product_order(jsonb) to authenticated;
