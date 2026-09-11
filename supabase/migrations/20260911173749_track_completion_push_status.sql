alter table public.push_notification_deliveries
  add column if not exists delivery_status text not null default 'sent',
  add column if not exists attempted_at timestamptz not null default now(),
  add column if not exists delivered_at timestamptz,
  add column if not exists error_message text;

alter table public.push_notification_deliveries
  drop constraint if exists push_notification_deliveries_event_type_check;

alter table public.push_notification_deliveries
  add constraint push_notification_deliveries_event_type_check
  check (event_type in ('product_created', 'purchase_order_assigned', 'purchase_order_completed'));

alter table public.push_notification_deliveries
  drop constraint if exists push_notification_deliveries_delivery_status_check;

alter table public.push_notification_deliveries
  add constraint push_notification_deliveries_delivery_status_check
  check (delivery_status in ('pending', 'sent', 'no_token', 'failed'));
