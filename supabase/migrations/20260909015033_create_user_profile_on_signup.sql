create or replace function public.create_user_directory_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_profiles (id, display_name, updated_at)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Usuario'),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_user_directory_profile() from public;

drop trigger if exists create_user_directory_profile_after_signup on auth.users;
create trigger create_user_directory_profile_after_signup
after insert on auth.users
for each row execute function public.create_user_directory_profile();
