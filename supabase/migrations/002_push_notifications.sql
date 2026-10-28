-- Already applied to the live project. Kept here for reference / new environments.
create extension if not exists pg_net with schema extensions;

create table public.push_tokens (
  token       text primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  app         text not null check (app in ('customer', 'partner', 'rider')),
  updated_at  timestamptz not null default now()
);
create index on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy "push_tokens: own" on public.push_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;
insert into public.app_config (key, value) values
  ('push_url', 'https://<project-ref>.supabase.co/functions/v1/send-push'),
  ('webhook_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

create or replace function public.notify_order_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_url text; v_secret text;
begin
  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.agent_state is not distinct from old.agent_state
     and new.agent_id is not distinct from old.agent_id then
    return new;
  end if;
  select value into v_url    from public.app_config where key = 'push_url';
  select value into v_secret from public.app_config where key = 'webhook_secret';
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('type', tg_op, 'order_id', new.id,
      'old_status',      case when tg_op = 'UPDATE' then old.status::text end,
      'old_agent_state', case when tg_op = 'UPDATE' then old.agent_state::text end,
      'old_agent_id',    case when tg_op = 'UPDATE' then old.agent_id end),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret));
  return new;
end;
$$;
revoke execute on function public.notify_order_change() from public, anon, authenticated;
create trigger order_push_notify after insert or update on public.orders
  for each row execute function public.notify_order_change();
