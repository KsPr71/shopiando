alter table public.products enable row level security;
grant select, insert, update, delete on public.products to authenticated;

do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'products'
  loop
    execute format('drop policy if exists %I on public.products', policy_name);
  end loop;
end;
$$;

create policy "Authenticated users can read products"
on public.products for select to authenticated
using (true);

create policy "Authenticated users can create products"
on public.products for insert to authenticated
with check (owner_id = (select auth.uid()));

create policy "Owners and product admins can update products"
on public.products for update to authenticated
using (owner_id = (select auth.uid()) or public.is_product_admin())
with check (owner_id = (select auth.uid()) or public.is_product_admin());

create policy "Product admins can delete products"
on public.products for delete to authenticated
using (public.is_product_admin());

create or replace function public.prevent_non_admin_availability_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.is_available is distinct from new.is_available
    and old.owner_id <> (select auth.uid())
    and not public.is_product_admin() then
    raise exception 'Only product owners or administrators can change availability';
  end if;
  return new;
end;
$$;
