alter table public.warehouse_items enable row level security;
alter table public.warehouse_item_movements enable row level security;

revoke all on public.warehouse_items, public.warehouse_item_movements from anon, authenticated;
grant select, insert, update, delete on public.warehouse_items to authenticated;
grant select on public.warehouse_item_movements to authenticated;

drop policy if exists "Owners and admins can read warehouse items" on public.warehouse_items;
drop policy if exists "Users can add their own warehouse items" on public.warehouse_items;
drop policy if exists "Owners and admins can update warehouse items" on public.warehouse_items;
drop policy if exists "Owners and admins can delete warehouse items" on public.warehouse_items;
drop policy if exists "Owners and admins can read warehouse movements" on public.warehouse_item_movements;

create policy "Owners and admins can read warehouse items"
on public.warehouse_items for select to authenticated
using (owner_id = (select auth.uid()) or (select public.is_warehouse_admin()));

create policy "Owners and admins can add warehouse items"
on public.warehouse_items for insert to authenticated
with check (
  owner_id = (select auth.uid())
  or (select public.is_warehouse_admin())
);

create policy "Owners and admins can update warehouse items"
on public.warehouse_items for update to authenticated
using (owner_id = (select auth.uid()) or (select public.is_warehouse_admin()))
with check (owner_id = (select auth.uid()) or (select public.is_warehouse_admin()));

create policy "Owners and admins can delete warehouse items"
on public.warehouse_items for delete to authenticated
using (owner_id = (select auth.uid()) or (select public.is_warehouse_admin()));

create policy "Owners and admins can read warehouse movements"
on public.warehouse_item_movements for select to authenticated
using (
  exists (
    select 1 from public.warehouse_items
    where warehouse_items.id = warehouse_item_movements.item_id
      and (warehouse_items.owner_id = (select auth.uid()) or (select public.is_warehouse_admin()))
  )
);

create or replace function public.log_warehouse_item_movement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.warehouse_item_movements (
      item_id, actor_id, action, quantity_before, quantity_after
    ) values (
      new.id, (select auth.uid()), 'created', 0, new.quantity
    );
  elsif new.quantity is distinct from old.quantity then
    insert into public.warehouse_item_movements (
      item_id, actor_id, action, quantity_before, quantity_after, extracted_quantity
    ) values (
      new.id,
      (select auth.uid()),
      case when new.quantity < old.quantity then 'extracted' else 'quantity_changed' end,
      old.quantity,
      new.quantity,
      greatest(old.quantity - new.quantity, 0)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_warehouse_item_movement() from public;
