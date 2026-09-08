create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.user_profiles (id, display_name, updated_at)
select
  id,
  coalesce(nullif(raw_user_meta_data ->> 'full_name', ''), nullif(raw_user_meta_data ->> 'name', ''), split_part(email, '@', 1), 'Usuario'),
  now()
from auth.users
on conflict (id) do nothing;

alter table public.user_profiles enable row level security;
revoke all on public.user_profiles from anon;
grant select, insert, update on public.user_profiles to authenticated;

drop policy if exists "Authenticated users can read user directory" on public.user_profiles;
drop policy if exists "Users can create their own directory profile" on public.user_profiles;
drop policy if exists "Users can update their own directory profile" on public.user_profiles;

create policy "Authenticated users can read user directory"
on public.user_profiles for select to authenticated
using (true);

create policy "Users can create their own directory profile"
on public.user_profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy "Users can update their own directory profile"
on public.user_profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);
