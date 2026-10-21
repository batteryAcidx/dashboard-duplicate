-- ============================================================================
-- Step 3 database additions (run in the DASHBOARD Supabase project, after 001)
--   1. urgency tiers on leads, so the owner's list can sort emergencies first
--   2. weather: a location per account and a cache of the latest alerts
--   3. memory: a rolling summary per conversation, and "returning caller" lookup
-- Additive. DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

-- ---------------------------------------------------------------- 1. urgency tiers
alter table public.leads
  add column if not exists urgency text not null default 'normal'
    check (urgency in ('emergency', 'urgent', 'normal')),
  add column if not exists urgency_reason text
    check (urgency_reason is null or char_length(urgency_reason) <= 200);

-- 0 = emergency, 1 = urgent, 2 = normal. Sort by this, then by newest.
alter table public.leads
  add column if not exists urgency_rank smallint
    generated always as (case urgency when 'emergency' then 0 when 'urgent' then 1 else 2 end) stored;

create index if not exists leads_account_sort_idx on public.leads (account_id, urgency_rank, created_at desc);

-- leads already flagged as priority keep that status
update public.leads set urgency = 'urgent', urgency_reason = 'Flagged as priority before the engine' where priority = true and urgency = 'normal';

-- keep the old priority flag in step with the new tier
create or replace function private.engine_sync_priority()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.urgency <> 'normal' then
    new.priority := true;
  elsif tg_op = 'UPDATE' and old.urgency <> 'normal' then
    new.priority := false;
  end if;
  return new;
end;
$$;
drop trigger if exists leads_sync_priority on public.leads;
create trigger leads_sync_priority before insert or update of urgency on public.leads
  for each row execute function private.engine_sync_priority();

alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (
  event_type = any (array[
    'status_changed', 'booked', 'rescheduled', 'took_over', 'handed_back', 'opted_out', 'lead_edited',
    'priority_flagged', 'photo_received', 'owner_alerted', 'follow_up_sent',
    'engine_paused', 'engine_resumed', 'engine_error', 'urgency_changed'
  ])
);

-- the engine only ever RAISES urgency. Returns true when it changed.
create or replace function public.engine_set_urgency(p_account uuid, p_lead uuid, p_urgency text, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old text;
  v_rank_old integer;
  v_rank_new integer;
begin
  if p_urgency not in ('emergency', 'urgent', 'normal') then
    raise exception 'bad_urgency';
  end if;

  select urgency into v_old from public.leads where id = p_lead and account_id = p_account for update;
  if not found then
    raise exception 'lead_not_found';
  end if;

  v_rank_old := case v_old when 'emergency' then 0 when 'urgent' then 1 else 2 end;
  v_rank_new := case p_urgency when 'emergency' then 0 when 'urgent' then 1 else 2 end;
  if v_rank_new >= v_rank_old then
    return false;
  end if;

  update public.leads
     set urgency = p_urgency, urgency_reason = left(p_reason, 200), updated_at = now()
   where id = p_lead and account_id = p_account;

  insert into public.lead_events (account_id, lead_id, event_type, detail, actor)
  values (p_account, p_lead, 'urgency_changed', p_urgency || coalesce(': ' || left(p_reason, 150), ''), 'system');

  return true;
end;
$$;

-- ---------------------------------------------------------------- 2. weather
-- Weather uses the SERVICE AREA's coordinates. A homeowner's address is never sent to a weather service.
alter table public.accounts
  add column if not exists service_lat numeric(8, 5) check (service_lat is null or service_lat between -90 and 90),
  add column if not exists service_lon numeric(8, 5) check (service_lon is null or service_lon between -180 and 180),
  add column if not exists service_country text not null default 'US' check (service_country in ('US', 'CA'));

create table if not exists public.account_weather (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  active_alerts jsonb not null default '[]'::jsonb,
  alert_history jsonb not null default '[]'::jsonb,   -- alerts seen in the last 72 hours
  storm_mode boolean not null default false,
  facts jsonb not null default '[]'::jsonb,           -- the plain sentences the model is allowed to use
  last_error text check (last_error is null or char_length(last_error) <= 300),
  updated_at timestamptz not null default now()
);

drop trigger if exists account_weather_touch on public.account_weather;
create trigger account_weather_touch before update on public.account_weather
  for each row execute function private.engine_touch_updated_at();

create or replace function public.engine_save_weather(
  p_account uuid, p_active jsonb, p_history jsonb, p_storm boolean, p_facts jsonb, p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_weather (account_id, fetched_at, active_alerts, alert_history, storm_mode, facts, last_error)
  values (p_account, now(), coalesce(p_active, '[]'::jsonb), coalesce(p_history, '[]'::jsonb), coalesce(p_storm, false),
          coalesce(p_facts, '[]'::jsonb), left(p_error, 300))
  on conflict (account_id) do update
    set fetched_at = now(), active_alerts = excluded.active_alerts, alert_history = excluded.alert_history,
        storm_mode = excluded.storm_mode, facts = excluded.facts, last_error = excluded.last_error;
end;
$$;

-- which accounts the weather refresh should look at
create or replace function public.engine_weather_targets()
returns table (account_id uuid, lat numeric, lon numeric, country text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.service_lat, a.service_lon, a.service_country
    from public.accounts a
   where a.service_lat is not null and a.service_lon is not null and a.status in ('setup', 'live');
$$;

-- ---------------------------------------------------------------- 3. memory
alter table public.lead_state
  add column if not exists summary text check (summary is null or char_length(summary) <= 1000),
  add column if not exists summary_updated_at timestamptz,
  add column if not exists messages_at_summary integer not null default 0,
  add column if not exists unclear_streak integer not null default 0 check (unclear_streak >= 0),
  add column if not exists offered_slots jsonb not null default '[]'::jsonb,
  add column if not exists last_ask text
    check (last_ask is null or last_ask in ('issue', 'active_now', 'address', 'name', 'slot', 'photo', 'payment')),
  add column if not exists language text not null default 'en' check (language in ('en', 'es'));

-- "this number contacted us before": looks only inside ONE account, never across clients
create or replace function public.engine_returning_caller(p_account uuid, p_phone text, p_exclude_lead uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
             'name', l.name,
             'address', l.address,
             'last_issue', ls.collected ->> 'issue',
             'last_status', l.status,
             'days_ago', greatest(0, floor(extract(epoch from (now() - l.created_at)) / 86400))::integer
           )
      from public.leads l
      left join public.lead_state ls on ls.lead_id = l.id
     where l.account_id = p_account
       and l.phone_e164 = p_phone
       and (p_exclude_lead is null or l.id <> p_exclude_lead)
     order by l.created_at desc
     limit 1
  ), 'null'::jsonb);
$$;

-- ---------------------------------------------------------------- 4. permissions
alter table public.account_weather enable row level security;
revoke all on table public.account_weather from anon, authenticated;
grant all on table public.account_weather to service_role;

-- owners may see their own storm banner
drop policy if exists "read own weather" on public.account_weather;
create policy "read own weather" on public.account_weather
  for select to authenticated using (account_id = private.current_account_id());
grant select on public.account_weather to authenticated;

revoke all on function public.engine_set_urgency(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.engine_save_weather(uuid, jsonb, jsonb, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function public.engine_weather_targets() from public, anon, authenticated;
revoke all on function public.engine_returning_caller(uuid, text, uuid) from public, anon, authenticated;

grant execute on function public.engine_set_urgency(uuid, uuid, text, text) to service_role;
grant execute on function public.engine_save_weather(uuid, jsonb, jsonb, boolean, jsonb, text) to service_role;
grant execute on function public.engine_weather_targets() to service_role;
grant execute on function public.engine_returning_caller(uuid, text, uuid) to service_role;

commit;
