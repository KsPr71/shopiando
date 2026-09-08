do $$
declare
  id_type text;
  created_at_type text;
  updated_at_type text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'products' and column_name = 'family_id'
  ) then
    execute 'alter table public.products alter column family_id drop not null';
  end if;

  select data_type into id_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'id';

  if id_type = 'uuid' then
    execute 'alter table public.products alter column id set default gen_random_uuid()';
  elsif id_type in ('text', 'character varying') then
    execute 'alter table public.products alter column id set default gen_random_uuid()::text';
  end if;

  select data_type into created_at_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'created_at';

  if created_at_type in ('timestamp with time zone', 'timestamp without time zone') then
    execute 'alter table public.products alter column created_at set default now()';
  elsif created_at_type in ('text', 'character varying') then
    execute 'alter table public.products alter column created_at set default (now() at time zone ''utc'')::text';
  end if;

  select data_type into updated_at_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'products' and column_name = 'updated_at';

  if updated_at_type in ('timestamp with time zone', 'timestamp without time zone') then
    execute 'alter table public.products alter column updated_at set default now()';
  elsif updated_at_type in ('text', 'character varying') then
    execute 'alter table public.products alter column updated_at set default (now() at time zone ''utc'')::text';
  end if;
end;
$$;
