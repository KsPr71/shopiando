alter table public.purchase_order_notifications enable row level security;
grant select, insert, update on public.purchase_order_notifications to authenticated;

drop policy if exists "Recipients can read purchase notifications" on public.purchase_order_notifications;
drop policy if exists "Requesters can create purchase notifications" on public.purchase_order_notifications;
drop policy if exists "Recipients can update purchase notifications" on public.purchase_order_notifications;
drop policy if exists "Requesters can update related purchase notifications" on public.purchase_order_notifications;

create policy "Recipients and requesters can read purchase notifications"
on public.purchase_order_notifications for select to authenticated
using (
  (select auth.uid()) = recipient_id
  or exists (
    select 1 from public.purchase_orders
    where purchase_orders.id = purchase_order_notifications.order_id
      and purchase_orders.requester_id = (select auth.uid())
  )
);

create policy "Requesters can create purchase notifications"
on public.purchase_order_notifications for insert to authenticated
with check (exists (
  select 1 from public.purchase_orders
  where purchase_orders.id = purchase_order_notifications.order_id
    and purchase_orders.requester_id = (select auth.uid())
));

create policy "Recipients can update purchase notifications"
on public.purchase_order_notifications for update to authenticated
using ((select auth.uid()) = recipient_id)
with check ((select auth.uid()) = recipient_id);

create policy "Requesters can update related purchase notifications"
on public.purchase_order_notifications for update to authenticated
using (exists (
  select 1 from public.purchase_orders
  where purchase_orders.id = purchase_order_notifications.order_id
    and purchase_orders.requester_id = (select auth.uid())
))
with check (exists (
  select 1 from public.purchase_orders
  where purchase_orders.id = purchase_order_notifications.order_id
    and purchase_orders.requester_id = (select auth.uid())
));
