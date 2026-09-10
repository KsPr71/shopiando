insert into storage.buckets (id, name, public)
values ('warehouse-images', 'warehouse-images', true)
on conflict (id) do update set public = true;
