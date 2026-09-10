grant delete on public.purchase_order_notifications to authenticated;

drop policy if exists "Recipients can delete read purchase notifications" on public.purchase_order_notifications;
create policy "Recipients can delete read purchase notifications"
on public.purchase_order_notifications for delete to authenticated
using (
  (select auth.uid()) = recipient_id
  and read_at is not null
);
