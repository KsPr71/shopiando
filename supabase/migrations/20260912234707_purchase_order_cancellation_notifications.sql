alter table public.push_notification_deliveries
  drop constraint if exists push_notification_deliveries_event_type_check;

alter table public.push_notification_deliveries
  add constraint push_notification_deliveries_event_type_check
  check (event_type in (
    'product_created',
    'purchase_order_assigned',
    'purchase_order_completed',
    'purchase_order_cancelled'
  ));
