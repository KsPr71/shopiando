create table if not exists public.purchase_order_notifications (
  id text primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null references public.purchase_orders(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null,
  read_at timestamptz
);

create index if not exists purchase_order_notifications_by_recipient
  on public.purchase_order_notifications(recipient_id, read_at, created_at desc);

alter table public.purchase_order_notifications enable row level security;
revoke all on public.purchase_order_notifications from anon;
grant select, insert, update on public.purchase_order_notifications to authenticated;

drop policy if exists "Recipients can read purchase notifications" on public.purchase_order_notifications;
drop policy if exists "Requesters can create purchase notifications" on public.purchase_order_notifications;
drop policy if exists "Recipients can update purchase notifications" on public.purchase_order_notifications;

create policy "Recipients can read purchase notifications"
on public.purchase_order_notifications for select to authenticated
using ((select auth.uid()) = recipient_id);

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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'purchase_order_notifications'
  ) then
    alter publication supabase_realtime add table public.purchase_order_notifications;
  end if;
end $$;
