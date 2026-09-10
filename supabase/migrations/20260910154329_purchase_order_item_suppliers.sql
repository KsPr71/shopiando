alter table public.purchase_order_items
  add column if not exists supplier_name text not null default '';
