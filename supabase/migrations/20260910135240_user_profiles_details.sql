alter table public.user_profiles
  add column if not exists full_name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists birth_date text not null default '',
  add column if not exists address text not null default '',
  add column if not exists gender text not null default '' check (gender in ('', 'male', 'female'));

update public.user_profiles
set full_name = display_name
where full_name = '' and display_name <> '';
