alter table public.products
  add column if not exists package_quantity numeric not null default 1
  check (package_quantity > 0);
