create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform = 'android'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists device_push_tokens_by_user
  on public.device_push_tokens(user_id, last_seen_at desc);

alter table public.device_push_tokens enable row level security;
revoke all on public.device_push_tokens from anon;
grant select, insert, update, delete on public.device_push_tokens to authenticated;
grant all on public.device_push_tokens to service_role;

drop policy if exists "Users can manage their push tokens" on public.device_push_tokens;
create policy "Users can manage their push tokens"
on public.device_push_tokens for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.push_notification_deliveries (
  event_type text not null check (event_type in ('product_created', 'purchase_order_assigned')),
  source_id text not null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_type, source_id, recipient_id)
);

alter table public.push_notification_deliveries enable row level security;
revoke all on public.push_notification_deliveries from anon, authenticated;
grant all on public.push_notification_deliveries to service_role;
