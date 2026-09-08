alter table public.products enable row level security;

grant select, insert, update, delete on table public.products to authenticated;

alter table public.products
  alter column owner_id set default auth.uid();

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

create policy "Owners can update products"
on public.products for update to authenticated
using (owner_id = (select auth.uid()) or public.is_product_admin())
with check (owner_id = (select auth.uid()) or public.is_product_admin());

create policy "Product admins can delete products"
on public.products for delete to authenticated
using (public.is_product_admin());
