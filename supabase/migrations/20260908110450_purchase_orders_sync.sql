create table if not exists public.purchase_orders (
  id text primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  assignee_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('pending', 'in_progress', 'partially_delivered', 'delivered', 'cancelled')),
  budget_total_cents integer not null default 0 check (budget_total_cents >= 0),
  invoiced_total_cents integer not null default 0 check (invoiced_total_cents >= 0),
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.purchase_order_items (
  id text primary key,
  order_id text not null references public.purchase_orders(id) on delete cascade,
  product_name text not null,
  unit text not null,
  quantity numeric not null check (quantity > 0),
  estimated_unit_price_cents integer not null check (estimated_unit_price_cents >= 0),
  actual_unit_price_cents integer check (actual_unit_price_cents >= 0),
  status text not null check (status in ('pending', 'purchased', 'delivered', 'cancelled')),
  purchased_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists purchase_orders_by_assignee_status
  on public.purchase_orders(assignee_id, status, created_at desc);
create index if not exists purchase_order_items_by_order
  on public.purchase_order_items(order_id, status);

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

revoke all on public.purchase_orders, public.purchase_order_items from anon;
grant select, insert, update on public.purchase_orders, public.purchase_order_items to authenticated;

drop policy if exists "Users can read related purchase orders" on public.purchase_orders;
drop policy if exists "Requesters can create purchase orders" on public.purchase_orders;
drop policy if exists "Related users can update purchase orders" on public.purchase_orders;
drop policy if exists "Users can read related purchase order items" on public.purchase_order_items;
drop policy if exists "Requesters can create purchase order items" on public.purchase_order_items;
drop policy if exists "Related users can update purchase order items" on public.purchase_order_items;

create policy "Users can read related purchase orders"
on public.purchase_orders for select to authenticated
using ((select auth.uid()) = requester_id or (select auth.uid()) = assignee_id);

create policy "Requesters can create purchase orders"
on public.purchase_orders for insert to authenticated
with check ((select auth.uid()) = requester_id);

create policy "Related users can update purchase orders"
on public.purchase_orders for update to authenticated
using ((select auth.uid()) = requester_id or (select auth.uid()) = assignee_id)
with check ((select auth.uid()) = requester_id or (select auth.uid()) = assignee_id);

create policy "Users can read related purchase order items"
on public.purchase_order_items for select to authenticated
using (exists (
  select 1 from public.purchase_orders
  where purchase_orders.id = purchase_order_items.order_id
    and ((select auth.uid()) = purchase_orders.requester_id or (select auth.uid()) = purchase_orders.assignee_id)
));

create policy "Requesters can create purchase order items"
on public.purchase_order_items for insert to authenticated
with check (exists (
  select 1 from public.purchase_orders
  where purchase_orders.id = purchase_order_items.order_id
    and (select auth.uid()) = purchase_orders.requester_id
));

create policy "Related users can update purchase order items"
on public.purchase_order_items for update to authenticated
using (exists (
  select 1 from public.purchase_orders
  where purchase_orders.id = purchase_order_items.order_id
    and ((select auth.uid()) = purchase_orders.requester_id or (select auth.uid()) = purchase_orders.assignee_id)
))
with check (exists (
  select 1 from public.purchase_orders
  where purchase_orders.id = purchase_order_items.order_id
    and ((select auth.uid()) = purchase_orders.requester_id or (select auth.uid()) = purchase_orders.assignee_id)
));
