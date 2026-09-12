alter table public.suppliers
  add column if not exists image_path text;

grant update, delete on public.suppliers to authenticated;

drop policy if exists "Supplier owners and admins can update" on public.suppliers;
create policy "Supplier owners and admins can update"
on public.suppliers for update to authenticated
using ((select auth.uid()) = created_by or public.is_product_admin())
with check ((select auth.uid()) = created_by or public.is_product_admin());

drop policy if exists "Supplier owners and admins can delete" on public.suppliers;
create policy "Supplier owners and admins can delete"
on public.suppliers for delete to authenticated
using ((select auth.uid()) = created_by or public.is_product_admin());
