alter table public.product_categories
  add column if not exists icon text not null default 'category';

alter table public.products
  drop constraint if exists products_category_check;

insert into public.product_categories (slug, name, icon)
values
  ('carnicos', 'Cárnicos', 'restaurant'),
  ('vegetales', 'Vegetales', 'eco'),
  ('viandas', 'Viandas', 'nutrition'),
  ('legumbres', 'Legumbres', 'grain'),
  ('limpieza', 'Limpieza', 'cleaning_services'),
  ('ferreteria', 'Ferretería', 'handyman'),
  ('helados_y_dulces', 'Helados y dulces', 'icecream'),
  ('pizzas', 'Pizzas', 'local_pizza'),
  ('bebidas', 'Bebidas', 'local_drink'),
  ('lacteos_y_huevos', 'Lácteos y huevos', 'egg_alt'),
  ('panaderia', 'Panadería', 'bakery_dining'),
  ('condimentos', 'Condimentos', 'grocery'),
  ('mascotas', 'Mascotas', 'pets')
on conflict (slug) do update
set name = excluded.name,
    icon = excluded.icon;
