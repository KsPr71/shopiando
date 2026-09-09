update public.user_profiles
set display_name = 'Jeidy Noda', updated_at = now()
where lower(trim(display_name)) = 'jeidyn';

update public.user_profiles
set display_name = 'Raquel Delgado', updated_at = now()
where lower(trim(display_name)) = 'mumy';
