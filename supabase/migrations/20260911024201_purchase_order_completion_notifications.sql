drop policy if exists "Requesters can create purchase notifications" on public.purchase_order_notifications;
drop policy if exists "Related users can create purchase notifications" on public.purchase_order_notifications;

create policy "Related users can create purchase notifications"
on public.purchase_order_notifications for insert to authenticated
with check (
  exists (
    select 1
    from public.purchase_orders
    where purchase_orders.id = purchase_order_notifications.order_id
      and (
        purchase_orders.requester_id = (select auth.uid())
        or (
          purchase_orders.assignee_id = (select auth.uid())
          and purchase_order_notifications.recipient_id = purchase_orders.requester_id
        )
      )
  )
);
