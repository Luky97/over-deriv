-- Adaptive Digit Research Lab - Initial Schema

create or replace function public.app_health()
returns jsonb language sql stable security invoker set search_path = public
as $$ select jsonb_build_object('ok', true, 'server_time', now(), 'schema_version', 1); $$;
grant execute on function public.app_health() to anon, authenticated;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy "user_settings_select" on public.user_settings for select using ((select auth.uid()) = user_id);
create policy "user_settings_insert" on public.user_settings for insert with check ((select auth.uid()) = user_id);
create policy "user_settings_update" on public.user_settings for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.market_checkpoints (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  state_version integer not null default 1,
  revision bigint not null default 1,
  last_processed_epoch bigint,
  last_processed_quote numeric,
  checkpoint jsonb not null,
  state_checksum text not null,
  payload_size_bytes integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);
alter table public.market_checkpoints enable row level security;
create policy "mc_select" on public.market_checkpoints for select using ((select auth.uid()) = user_id);
create policy "mc_insert" on public.market_checkpoints for insert with check ((select auth.uid()) = user_id);
create policy "mc_update" on public.market_checkpoints for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "mc_delete" on public.market_checkpoints for delete using ((select auth.uid()) = user_id);

create table if not exists public.virtual_rounds (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  round_number integer not null,
  market text not null,
  execution_kind text not null,
  status text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index idx_vr_user on public.virtual_rounds(user_id);
alter table public.virtual_rounds enable row level security;
create policy "vr_select" on public.virtual_rounds for select using ((select auth.uid()) = user_id);
create policy "vr_insert" on public.virtual_rounds for insert with check ((select auth.uid()) = user_id);
create policy "vr_delete" on public.virtual_rounds for delete using ((select auth.uid()) = user_id);

create table if not exists public.virtual_contracts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  market text not null,
  contract_type text not null,
  prediction text not null,
  outcome text not null,
  strategy_id text not null,
  round_id text,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index idx_vc_user on public.virtual_contracts(user_id);
alter table public.virtual_contracts enable row level security;
create policy "vc_select" on public.virtual_contracts for select using ((select auth.uid()) = user_id);
create policy "vc_insert" on public.virtual_contracts for insert with check ((select auth.uid()) = user_id);

create table if not exists public.research_events (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  market text not null,
  category text not null,
  epoch bigint not null,
  message text not null,
  created_at timestamptz not null default now()
);
create index idx_re_user on public.research_events(user_id);
alter table public.research_events enable row level security;
create policy "re_select" on public.research_events for select using ((select auth.uid()) = user_id);
create policy "re_insert" on public.research_events for insert with check ((select auth.uid()) = user_id);

create table if not exists public.market_leases (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  device_id text not null,
  lease_token text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, symbol)
);
alter table public.market_leases enable row level security;
create policy "ml_select" on public.market_leases for select using ((select auth.uid()) = user_id);
create policy "ml_insert" on public.market_leases for insert with check ((select auth.uid()) = user_id);
create policy "ml_update" on public.market_leases for update using ((select auth.uid()) = user_id);
create policy "ml_delete" on public.market_leases for delete using ((select auth.uid()) = user_id);

create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  local_revision bigint not null,
  cloud_revision bigint not null,
  local_checkpoint jsonb not null,
  cloud_checkpoint jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.sync_conflicts enable row level security;
create policy "sc_select" on public.sync_conflicts for select using ((select auth.uid()) = user_id);
create policy "sc_insert" on public.sync_conflicts for insert with check ((select auth.uid()) = user_id);

create or replace function public.save_market_checkpoints_batch(checkpoints jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare cp jsonb; v_uid uuid; v_sym text; v_er bigint; v_cr bigint; v_res jsonb := '[]'::jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then return jsonb_build_array(jsonb_build_object('symbol', null, 'ok', false, 'new_revision', null, 'error_code', 'UNAUTHENTICATED', 'error_message', 'Not authenticated')); end if;
  for cp in select * from jsonb_array_elements(checkpoints) loop
    v_sym := cp->>'symbol'; v_er := (cp->>'expected_revision')::bigint;
    select revision into v_cr from public.market_checkpoints where user_id = v_uid and symbol = v_sym;
    if v_cr is null then
      insert into public.market_checkpoints (user_id, symbol, state_version, revision, last_processed_epoch, last_processed_quote, checkpoint, state_checksum, payload_size_bytes)
      values (v_uid, v_sym, coalesce((cp->>'state_version')::int, 1), 1, (cp->>'last_processed_epoch')::bigint, (cp->>'last_processed_quote')::numeric, cp->'checkpoint', cp->>'state_checksum', (cp->>'payload_size_bytes')::int)
      on conflict (user_id, symbol) do update set revision = public.market_checkpoints.revision + 1, checkpoint = cp->'checkpoint', state_checksum = cp->>'state_checksum', payload_size_bytes = (cp->>'payload_size_bytes')::int, last_processed_epoch = (cp->>'last_processed_epoch')::bigint, last_processed_quote = (cp->>'last_processed_quote')::numeric, updated_at = now()
      returning revision into v_cr;
      v_res := v_res || jsonb_build_object('symbol', v_sym, 'ok', true, 'new_revision', v_cr, 'error_code', null, 'error_message', null);
    elsif v_er = v_cr then
      update public.market_checkpoints set revision = revision + 1, checkpoint = cp->'checkpoint', state_checksum = cp->>'state_checksum', payload_size_bytes = (cp->>'payload_size_bytes')::int, last_processed_epoch = (cp->>'last_processed_epoch')::bigint, last_processed_quote = (cp->>'last_processed_quote')::numeric, updated_at = now()
      where user_id = v_uid and symbol = v_sym returning revision into v_cr;
      v_res := v_res || jsonb_build_object('symbol', v_sym, 'ok', true, 'new_revision', v_cr, 'error_code', null, 'error_message', null);
    else
      v_res := v_res || jsonb_build_object('symbol', v_sym, 'ok', false, 'new_revision', v_cr, 'error_code', 'CONFLICT', 'error_message', format('Revision mismatch: expected %s, current %s', v_er, v_cr));
    end if;
  end loop;
  return v_res;
end; $$;
grant execute on function public.save_market_checkpoints_batch(jsonb) to authenticated;

create or replace function public.acquire_market_lease(p_symbol text, p_device_id text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_uid uuid; v_exp timestamptz; v_ex_exp timestamptz; v_ex_dev text;
begin
  v_uid := auth.uid(); if v_uid is null then return jsonb_build_object('ok', false, 'message', 'Not authenticated', 'expires_at', null); end if;
  select expires_at, device_id into v_ex_exp, v_ex_dev from public.market_leases where user_id = v_uid and symbol = p_symbol;
  if v_ex_dev is not null and v_ex_exp > now() and v_ex_dev != p_device_id then
    return jsonb_build_object('ok', false, 'message', 'Leased by another device', 'expires_at', v_ex_exp);
  end if;
  v_exp := now() + interval '45 seconds';
  insert into public.market_leases (user_id, symbol, device_id, lease_token, expires_at) values (v_uid, p_symbol, p_device_id, gen_random_uuid()::text, v_exp)
  on conflict (user_id, symbol) do update set device_id = p_device_id, expires_at = v_exp, lease_token = gen_random_uuid()::text
  returning expires_at into v_exp;
  return jsonb_build_object('ok', true, 'message', 'Lease acquired', 'expires_at', v_exp);
end; $$;
grant execute on function public.acquire_market_lease(text, text) to authenticated;

create or replace function public.renew_market_lease(p_symbol text, p_device_id text)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_uid uuid; v_exp timestamptz;
begin
  v_uid := auth.uid(); if v_uid is null then return jsonb_build_object('ok', false, 'message', 'Not authenticated', 'expires_at', null); end if;
  v_exp := now() + interval '45 seconds';
  update public.market_leases set expires_at = v_exp, device_id = p_device_id where user_id = v_uid and symbol = p_symbol returning expires_at into v_exp;
  if v_exp is null then return jsonb_build_object('ok', false, 'message', 'No lease', 'expires_at', null); end if;
  return jsonb_build_object('ok', true, 'message', 'Lease renewed', 'expires_at', v_exp);
end; $$;
grant execute on function public.renew_market_lease(text, text) to authenticated;

create or replace function public.release_market_lease(p_symbol text, p_device_id text)
returns void language plpgsql security invoker set search_path = public as $$
begin delete from public.market_leases where symbol = p_symbol and user_id = auth.uid() and device_id = p_device_id; end; $$;
grant execute on function public.release_market_lease(text, text) to authenticated;
