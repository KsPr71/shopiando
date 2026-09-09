create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 1 and 120),
  location text not null default '' check (char_length(location) <= 240),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_items (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 120),
  unit_type text not null check (unit_type in ('unit', 'pound')),
  quantity numeric(12, 2) not null check (quantity >= 0),
  image_path text,
  status text not null default 'active' check (status in ('active', 'extracted')),
  extracted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouse_item_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.warehouse_items(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created', 'quantity_changed', 'extracted')),
  quantity_before numeric(12, 2) not null check (quantity_before >= 0),
  quantity_after numeric(12, 2) not null check (quantity_after >= 0),
  extracted_quantity numeric(12, 2) not null default 0 check (extracted_quantity >= 0),
  created_at timestamptz not null default now()
);

create index if not exists warehouse_items_by_owner on public.warehouse_items(owner_id, status, updated_at desc);
create index if not exists warehouse_items_by_warehouse on public.warehouse_items(warehouse_id, status, updated_at desc);
create index if not exists warehouse_item_movements_by_item on public.warehouse_item_movements(item_id, created_at desc);

create or replace function public.is_warehouse_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

create or replace function public.set_warehouse_item_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();

  if tg_op = 'UPDATE' and new.quantity is distinct from old.quantity then
    if new.quantity = 0 then
      new.status := 'extracted';
      new.extracted_at := coalesce(new.extracted_at, now());
    elsif old.status = 'extracted' then
      new.status := 'active';
      new.extracted_at := null;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.log_warehouse_item_movement()
returns trigger
language plpgsql
security invoker
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

drop trigger if exists warehouse_items_set_state on public.warehouse_items;
create trigger warehouse_items_set_state
before update on public.warehouse_items
for each row execute function public.set_warehouse_item_state();

drop trigger if exists warehouse_items_log_movement on public.warehouse_items;
create trigger warehouse_items_log_movement
after insert or update on public.warehouse_items
for each row execute function public.log_warehouse_item_movement();

alter table public.warehouses enable row level security;
alter table public.warehouse_items enable row level security;
alter table public.warehouse_item_movements enable row level security;
revoke all on public.warehouses, public.warehouse_items, public.warehouse_item_movements from anon, authenticated;
grant select, insert, update, delete on public.warehouses, public.warehouse_items to authenticated;
grant select on public.warehouse_item_movements to authenticated;

create policy "Authenticated users can read warehouses"
on public.warehouses for select to authenticated using (true);

create policy "Warehouse admins can create warehouses"
on public.warehouses for insert to authenticated
with check ((select public.is_warehouse_admin()) and created_by = (select auth.uid()));

create policy "Warehouse admins can update warehouses"
on public.warehouses for update to authenticated
using ((select public.is_warehouse_admin()))
with check ((select public.is_warehouse_admin()));

create policy "Warehouse admins can delete warehouses"
on public.warehouses for delete to authenticated
using ((select public.is_warehouse_admin()));

create policy "Owners and admins can read warehouse items"
on public.warehouse_items for select to authenticated
using (owner_id = (select auth.uid()) or (select public.is_warehouse_admin()));

create policy "Users can add their own warehouse items"
on public.warehouse_items for insert to authenticated
with check (owner_id = (select auth.uid()) or (select public.is_warehouse_admin()));

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

insert into storage.buckets (id, name, public)
values ('warehouse-images', 'warehouse-images', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Owners and admins can read warehouse images" on storage.objects;
create policy "Owners and admins can read warehouse images"
on storage.objects for select to authenticated
using (
  bucket_id = 'warehouse-images'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (select public.is_warehouse_admin())
    or exists (
      select 1 from public.warehouse_items
      where warehouse_items.image_path = storage.objects.name
        and warehouse_items.owner_id = (select auth.uid())
    )
  )
);

drop policy if exists "Owners and admins can upload warehouse images" on storage.objects;
create policy "Owners and admins can upload warehouse images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'warehouse-images'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (select public.is_warehouse_admin())
  )
);

drop policy if exists "Owners and admins can update warehouse images" on storage.objects;
create policy "Owners and admins can update warehouse images"
on storage.objects for update to authenticated
using (
  bucket_id = 'warehouse-images'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (select public.is_warehouse_admin())
  )
)
with check (
  bucket_id = 'warehouse-images'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (select public.is_warehouse_admin())
  )
);
