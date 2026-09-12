alter table public.purchase_orders
  add column if not exists cancel_reason text;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_cancel_reason_length;

alter table public.purchase_orders
  add constraint purchase_orders_cancel_reason_length
  check (cancel_reason is null or char_length(trim(cancel_reason)) between 3 and 500);
