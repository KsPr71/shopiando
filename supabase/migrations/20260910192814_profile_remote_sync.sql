alter table public.user_profiles
  add column if not exists avatar_path text;

create index if not exists user_profiles_updated_at_idx
  on public.user_profiles (updated_at desc);
