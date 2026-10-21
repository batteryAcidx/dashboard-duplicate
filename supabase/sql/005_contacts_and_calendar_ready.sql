-- ============================================================================
-- Step 3 additions, part 2 (run in the DASHBOARD Supabase project, after 003)
--   1. contacts: who is calling (homeowner, past client, recurring client, supplier, crew, other)
--   2. calendar-ready: tables and rules so a calendar sync can be plugged in later without redesign
-- Additive. DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

-- ---------------------------------------------------------------- 1. contacts
create table if not exists public.contacts (
  account_id uuid not null references public.accounts(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  contact_type text not null default 'homeowner'
    check (contact_type in ('homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other')),
  name text check (name is null or char_length(name) <= 100),
  company text check (company is null or char_length(company) <= 100),
  address text check (address is null or char_length(address) <= 200),
  last_job text check (last_job is null or char_length(last_job) <= 200),     -- e.g. "2024 full reroof"
  notes text check (notes is null or char_length(notes) <= 500),
  auto_reply text not null default 'engine' check (auto_reply in ('engine', 'owner_only', 'silent')),
  source text not null default 'owner' check (source in ('owner', 'engine', 'import')),
  needs_review boolean not null default false,       -- true when the engine suggested the type
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, phone_e164)
);
create index if not exists contacts_account_type_idx on public.contacts (account_id, contact_type);

drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts
  for each row execute function private.engine_touch_updated_at();

-- what to do with a number by default, unless the owner says otherwise
create or replace function private.engine_default_auto_reply(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_type when 'supplier' then 'owner_only' when 'crew' then 'silent' when 'other' then 'silent' else 'engine' end;
$$;

-- the type is on every lead too, so the dashboard can filter and sort without joins
alter table public.leads
  add column if not exists contact_type text not null default 'homeowner'
    check (contact_type in ('homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other'));
create index if not exists leads_account_contact_idx on public.leads (account_id, contact_type, urgency_rank, created_at desc);

alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (
  event_type = any (array[
    'status_changed', 'booked', 'rescheduled', 'took_over', 'handed_back', 'opted_out', 'lead_edited',
    'priority_flagged', 'photo_received', 'owner_alerted', 'follow_up_sent',
    'engine_paused', 'engine_resumed', 'engine_error', 'urgency_changed', 'contact_classified'
  ])
);

create or replace function public.engine_lookup_contact(p_account uuid, p_phone text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
             'type', c.contact_type, 'auto_reply', c.auto_reply, 'name', c.name, 'company', c.company,
             'address', c.address, 'last_job', c.last_job, 'needs_review', c.needs_review)
      from public.contacts c
     where c.account_id = p_account and c.phone_e164 = p_phone
  ), 'null'::jsonb);
$$;

-- the engine suggests, the owner decides: an owner's or import's classification is never overridden by the engine
create or replace function public.engine_set_contact(
  p_account uuid, p_phone text, p_type text, p_name text default null, p_last_job text default null,
  p_source text default 'engine'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.contacts%rowtype;
  v_lead uuid;
begin
  if p_type not in ('homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other') then
    raise exception 'bad_type';
  end if;
  if p_source not in ('owner', 'engine', 'import') then
    raise exception 'bad_source';
  end if;

  select * into v_row from public.contacts where account_id = p_account and phone_e164 = p_phone;
  if found and p_source = 'engine' and v_row.source in ('owner', 'import') then
    return jsonb_build_object('kept', true, 'type', v_row.contact_type);
  end if;

  insert into public.contacts (account_id, phone_e164, contact_type, name, last_job, auto_reply, source, needs_review)
  values (p_account, p_phone, p_type, left(p_name, 100), left(p_last_job, 200),
          private.engine_default_auto_reply(p_type), p_source, p_source = 'engine')
  on conflict (account_id, phone_e164) do update
    set contact_type = excluded.contact_type,
        name = coalesce(excluded.name, public.contacts.name),
        last_job = coalesce(excluded.last_job, public.contacts.last_job),
        auto_reply = excluded.auto_reply,
        source = excluded.source,
        needs_review = excluded.needs_review;

  update public.leads set contact_type = p_type, updated_at = now()
   where account_id = p_account and phone_e164 = p_phone;

  select id into v_lead from public.leads
   where account_id = p_account and phone_e164 = p_phone order by created_at desc limit 1;
  if v_lead is not null then
    insert into public.lead_events (account_id, lead_id, event_type, detail, actor)
    values (p_account, v_lead, 'contact_classified', p_type || ' (' || p_source || ')',
            case when p_source = 'engine' then 'system' else 'owner' end);
  end if;

  return jsonb_build_object('kept', false, 'type', p_type);
end;
$$;

-- bulk import of an owner's customer or supplier list: [{"phone":"+12145550101","name":"...","address":"...","last_job":"..."}]
create or replace function public.engine_import_contacts(p_account uuid, p_rows jsonb, p_type text default 'past_client')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_phone text;
  v_existing boolean;
  v_new integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
begin
  if p_type not in ('homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other') then
    raise exception 'bad_type';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_must_be_array';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_phone := r ->> 'phone';
    if v_phone is null or v_phone !~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$' then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    select exists (select 1 from public.contacts where account_id = p_account and phone_e164 = v_phone) into v_existing;

    insert into public.contacts (account_id, phone_e164, contact_type, name, address, last_job, auto_reply, source, needs_review)
    values (p_account, v_phone, p_type, left(r ->> 'name', 100), left(r ->> 'address', 200), left(r ->> 'last_job', 200),
            private.engine_default_auto_reply(p_type), 'import', false)
    on conflict (account_id, phone_e164) do update
      set contact_type = excluded.contact_type,
          name = coalesce(excluded.name, public.contacts.name),
          address = coalesce(excluded.address, public.contacts.address),
          last_job = coalesce(excluded.last_job, public.contacts.last_job),
          auto_reply = excluded.auto_reply,
          source = 'import',
          needs_review = false;

    if v_existing then v_updated := v_updated + 1; else v_new := v_new + 1; end if;
  end loop;

  update public.leads l set contact_type = p_type, updated_at = now()
   where l.account_id = p_account
     and l.phone_e164 in (select x ->> 'phone' from jsonb_array_elements(p_rows) x);

  return jsonb_build_object('new', v_new, 'updated', v_updated, 'skipped', v_skipped);
end;
$$;

-- a lead now picks up what we know about the number (type, name, address). Suppliers, crew and others are
-- filed as not_a_lead so they never inflate the owner's lead counts.
create or replace function public.engine_get_or_create_lead(p_account uuid, p_phone text, p_missed_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  c public.contacts%rowtype;
  v_has boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text || p_phone, 11));

  select * into c from public.contacts where account_id = p_account and phone_e164 = p_phone;
  v_has := found;

  select l.id into v_id
    from public.leads l
   where l.account_id = p_account
     and l.phone_e164 = p_phone
     and (l.status in ('booked', 'following_up', 'needs_you') or l.contact_type in ('supplier', 'crew', 'other'))
     and l.created_at > now() - interval '30 days'
   order by l.created_at desc
   limit 1;

  if v_id is null then
    insert into public.leads (account_id, phone, phone_e164, status, missed_call_at, unread, contact_type, name, address)
    values (p_account, p_phone, p_phone,
            case when v_has and c.contact_type in ('supplier', 'crew', 'other') then 'not_a_lead' else 'following_up' end,
            p_missed_at, true,
            case when v_has then c.contact_type else 'homeowner' end,
            case when v_has then c.name end,
            case when v_has then c.address end)
    returning id into v_id;
  elsif p_missed_at is not null then
    update public.leads set missed_call_at = coalesce(missed_call_at, p_missed_at) where id = v_id;
  end if;

  return v_id;
end;
$$;

-- memory now includes what the owner told us about the number
create or replace function public.engine_returning_caller(p_account uuid, p_phone text, p_exclude_lead uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.contacts%rowtype;
  l record;
  v_has_c boolean;
  v_has_l boolean;
begin
  select * into c from public.contacts where account_id = p_account and phone_e164 = p_phone;
  v_has_c := found;

  select l2.name as name, l2.address as address, l2.status as status, l2.created_at as created_at,
         ls.collected ->> 'issue' as last_issue
    into l
    from public.leads l2
    left join public.lead_state ls on ls.lead_id = l2.id
   where l2.account_id = p_account and l2.phone_e164 = p_phone
     and (p_exclude_lead is null or l2.id <> p_exclude_lead)
   order by l2.created_at desc
   limit 1;
  v_has_l := found;

  if not v_has_c and not v_has_l then
    return 'null'::jsonb;
  end if;

  return jsonb_build_object(
    'name', coalesce(c.name, l.name),
    'address', coalesce(c.address, l.address),
    'last_issue', l.last_issue,
    'last_status', l.status,
    'last_job', c.last_job,
    'contact_type', case when v_has_c then c.contact_type else 'homeowner' end,
    'days_ago', case when v_has_l then greatest(0, floor(extract(epoch from (now() - l.created_at)) / 86400))::integer end
  );
end;
$$;

-- ---------------------------------------------------------------- 2. calendar-ready
-- Nothing here talks to a calendar yet. A later sync job fills calendar_busy and drains calendar_outbox.
create table if not exists public.calendar_connections (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  provider text not null default 'none' check (provider in ('none', 'google', 'microsoft', 'ics')),
  external_calendar_id text,
  status text not null default 'not_connected' check (status in ('not_connected', 'active', 'needs_reauth', 'error')),
  token_secret_id uuid,                              -- encrypted in Supabase Vault, like the Twilio token
  sync_cursor text,                                  -- the provider's incremental-sync token
  last_synced_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists calendar_connections_touch on public.calendar_connections;
create trigger calendar_connections_touch before update on public.calendar_connections
  for each row execute function private.engine_touch_updated_at();

-- busy times copied from the owner's real calendar. Only times, never titles or attendees.
create table if not exists public.calendar_busy (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  external_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint calendar_busy_order check (ends_at > starts_at),
  constraint calendar_busy_unique unique (account_id, external_id)
);
create index if not exists calendar_busy_idx on public.calendar_busy (account_id, starts_at, ends_at);

-- appointments waiting to be written to the owner's calendar
create table if not exists public.calendar_outbox (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  action text not null check (action in ('create', 'update', 'delete')),
  status text not null default 'pending' check (status in ('pending', 'sending', 'done', 'failed')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  done_at timestamptz
);
create unique index if not exists calendar_outbox_pending_idx on public.calendar_outbox (appointment_id, action) where status = 'pending';
create index if not exists calendar_outbox_ready_idx on public.calendar_outbox (run_after) where status = 'pending';

alter table public.appointments
  add column if not exists source text not null default 'engine' check (source in ('engine', 'owner', 'calendar')),
  add column if not exists external_provider text,
  add column if not exists external_id text,
  add column if not exists external_etag text,
  add column if not exists sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed')),
  add column if not exists synced_at timestamptz;
create unique index if not exists appointments_external_idx on public.appointments (account_id, external_provider, external_id)
  where external_id is not null;

-- availability now also respects the owner's real calendar
create or replace function public.engine_available_slots(
  p_account uuid,
  p_from timestamptz default now(),
  p_days integer default 7,
  p_limit integer default 12
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_open time;
  v_close time;
  v_weekends boolean;
  v_dur integer;
  v_step integer;
  v_notice integer;
  v_conc integer;
  v_max_days integer;
  v_first date;
  v_last date;
begin
  select a.timezone, a.office_open, a.office_close, a.works_weekends,
         coalesce(es.inspection_minutes, 60), coalesce(es.slot_step_minutes, 60),
         coalesce(es.min_notice_hours, 4), coalesce(es.concurrent_inspections, 1),
         coalesce(es.max_days_ahead, 14)
    into v_tz, v_open, v_close, v_weekends, v_dur, v_step, v_notice, v_conc, v_max_days
    from public.accounts a
    left join public.account_engine_settings es on es.account_id = a.id
   where a.id = p_account;

  if v_tz is null then
    return;
  end if;

  v_first := (p_from at time zone v_tz)::date;
  v_last := v_first + least(greatest(p_days, 1), v_max_days);

  return query
  with days as (
    select (g.d)::date as dd
      from generate_series(v_first::timestamp, v_last::timestamp, interval '1 day') as g(d)
  ),
  cand as (
    select days.dd as dd, t.ts as local_ts
      from days
     cross join lateral generate_series(
            days.dd + v_open,
            days.dd + v_close - make_interval(mins => v_dur),
            make_interval(mins => v_step)
          ) as t(ts)
  ),
  slots as (
    select (c.local_ts at time zone v_tz) as s_start
      from cand c
     where v_weekends or extract(isodow from c.dd) < 6
  )
  select s.s_start, s.s_start + make_interval(mins => v_dur)
    from slots s
   where s.s_start >= p_from
     and s.s_start >= now() + make_interval(hours => v_notice)
     and s.s_start < now() + make_interval(days => v_max_days)
     and not exists (
           select 1
             from public.availability_blocks b
            where b.account_id = p_account
              and tstzrange(b.starts_at, b.ends_at) && tstzrange(s.s_start, s.s_start + make_interval(mins => v_dur))
         )
     and (
           select count(*)
             from public.appointments ap
            where ap.account_id = p_account
              and ap.status in ('scheduled', 'rescheduled')
              and tstzrange(ap.starts_at, coalesce(ap.ends_at, ap.starts_at + make_interval(mins => v_dur)))
                  && tstzrange(s.s_start, s.s_start + make_interval(mins => v_dur))
         ) < v_conc
     and not exists (
           select 1
             from public.calendar_busy cb
            where cb.account_id = p_account
              and tstzrange(cb.starts_at, cb.ends_at) && tstzrange(s.s_start, s.s_start + make_interval(mins => v_dur))
         )
   order by s.s_start
   limit greatest(1, least(p_limit, 500));
end;
$$;

-- every booking, change or cancellation is queued for the calendar as soon as one is connected
create or replace function private.engine_enqueue_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean;
  v_action text;
begin
  select exists (
           select 1 from public.calendar_connections c
            where c.account_id = new.account_id and c.status = 'active' and c.provider in ('google', 'microsoft')
         ) into v_active;
  if not v_active then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_action := 'create';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    v_action := 'delete';
  elsif new.status in ('scheduled', 'rescheduled')
        and (new.starts_at <> old.starts_at or new.ends_at is distinct from old.ends_at or new.address is distinct from old.address) then
    v_action := 'update';
  else
    return new;
  end if;

  insert into public.calendar_outbox (account_id, appointment_id, action) values (new.account_id, new.id, v_action)
  on conflict do nothing;
  update public.appointments set sync_status = 'pending' where id = new.id;
  return new;
end;
$$;
drop trigger if exists appointments_enqueue_calendar on public.appointments;
create trigger appointments_enqueue_calendar after insert or update of starts_at, ends_at, address, status on public.appointments
  for each row execute function private.engine_enqueue_calendar();

-- replace the busy blocks inside a window with a fresh copy from the calendar
create or replace function public.engine_replace_busy(p_account uuid, p_from timestamptz, p_to timestamptz, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  n integer := 0;
  v_ids text[] := '{}';
  v_start timestamptz;
  v_end timestamptz;
begin
  if p_to <= p_from or p_to > p_from + interval '120 days' then
    raise exception 'bad_window';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_must_be_array';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    if (r ->> 'id') is null or (r ->> 'starts_at') is null or (r ->> 'ends_at') is null then
      continue;
    end if;
    v_start := (r ->> 'starts_at')::timestamptz;
    v_end := (r ->> 'ends_at')::timestamptz;
    if v_end <= v_start then
      continue;
    end if;

    insert into public.calendar_busy (account_id, external_id, starts_at, ends_at, updated_at)
    values (p_account, r ->> 'id', v_start, v_end, now())
    on conflict (account_id, external_id) do update
      set starts_at = excluded.starts_at, ends_at = excluded.ends_at, updated_at = now();
    v_ids := array_append(v_ids, r ->> 'id');
    n := n + 1;
  end loop;

  delete from public.calendar_busy
   where account_id = p_account and starts_at < p_to and ends_at > p_from and not (external_id = any (v_ids));

  update public.calendar_connections set last_synced_at = now(), last_error = null where account_id = p_account;
  return n;
end;
$$;

create or replace function public.engine_claim_calendar_outbox(p_limit integer default 10)
returns setof public.calendar_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.calendar_outbox set status = 'pending', locked_at = null
   where status = 'sending' and locked_at < now() - interval '5 minutes';

  return query
  update public.calendar_outbox o
     set status = 'sending', locked_at = now(), attempts = o.attempts + 1
   where o.id in (
     select x.id from public.calendar_outbox x
      where x.status = 'pending' and x.run_after <= now()
      order by x.created_at
      limit greatest(1, least(p_limit, 50))
        for update skip locked
   )
  returning o.*;
end;
$$;

create or replace function public.engine_finish_calendar_outbox(
  p_id uuid, p_ok boolean, p_error text default null, p_external_id text default null, p_etag text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt uuid;
  v_attempts integer;
begin
  select appointment_id, attempts into v_appt, v_attempts from public.calendar_outbox where id = p_id;
  if not found then
    return;
  end if;

  if p_ok then
    update public.calendar_outbox set status = 'done', done_at = now(), locked_at = null, last_error = null where id = p_id;
    update public.appointments a
       set sync_status = 'synced', synced_at = now(),
           external_id = coalesce(p_external_id, a.external_id),
           external_etag = coalesce(p_etag, a.external_etag),
           external_provider = coalesce(a.external_provider,
                                        (select c.provider from public.calendar_connections c where c.account_id = a.account_id))
     where a.id = v_appt;
  elsif v_attempts >= 5 then
    update public.calendar_outbox set status = 'failed', locked_at = null, last_error = left(p_error, 300) where id = p_id;
    update public.appointments set sync_status = 'failed' where id = v_appt;
  else
    update public.calendar_outbox
       set status = 'pending', locked_at = null, last_error = left(p_error, 300),
           run_after = now() + make_interval(secs => 60 * v_attempts * v_attempts)
     where id = p_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------- 3. permissions
alter table public.contacts enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.calendar_busy enable row level security;
alter table public.calendar_outbox enable row level security;

revoke all on table public.contacts, public.calendar_connections, public.calendar_busy, public.calendar_outbox from anon, authenticated;
grant all on table public.contacts, public.calendar_connections, public.calendar_busy, public.calendar_outbox to service_role;

-- owners manage their own contact list (mark a number as a supplier, confirm a past client, edit notes)
drop policy if exists "read own contacts" on public.contacts;
create policy "read own contacts" on public.contacts for select to authenticated using (account_id = private.current_account_id());
drop policy if exists "add own contacts" on public.contacts;
create policy "add own contacts" on public.contacts for insert to authenticated with check (account_id = private.current_account_id());
drop policy if exists "change own contacts" on public.contacts;
create policy "change own contacts" on public.contacts for update to authenticated
  using (account_id = private.current_account_id()) with check (account_id = private.current_account_id());
drop policy if exists "remove own contacts" on public.contacts;
create policy "remove own contacts" on public.contacts for delete to authenticated using (account_id = private.current_account_id());
grant select, insert, update, delete on public.contacts to authenticated;

-- owners can see whether their calendar is connected (never the secret)
drop policy if exists "read own calendar connection" on public.calendar_connections;
create policy "read own calendar connection" on public.calendar_connections
  for select to authenticated using (account_id = private.current_account_id());
grant select (account_id, provider, status, last_synced_at, last_error) on public.calendar_connections to authenticated;

revoke all on function public.engine_lookup_contact(uuid, text) from public, anon, authenticated;
revoke all on function public.engine_set_contact(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.engine_import_contacts(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.engine_get_or_create_lead(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.engine_returning_caller(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.engine_available_slots(uuid, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.engine_replace_busy(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.engine_claim_calendar_outbox(integer) from public, anon, authenticated;
revoke all on function public.engine_finish_calendar_outbox(uuid, boolean, text, text, text) from public, anon, authenticated;

grant execute on function public.engine_lookup_contact(uuid, text) to service_role;
grant execute on function public.engine_set_contact(uuid, text, text, text, text, text) to service_role;
grant execute on function public.engine_import_contacts(uuid, jsonb, text) to service_role;
grant execute on function public.engine_get_or_create_lead(uuid, text, timestamptz) to service_role;
grant execute on function public.engine_returning_caller(uuid, text, uuid) to service_role;
grant execute on function public.engine_available_slots(uuid, timestamptz, integer, integer) to service_role;
grant execute on function public.engine_replace_busy(uuid, timestamptz, timestamptz, jsonb) to service_role;
grant execute on function public.engine_claim_calendar_outbox(integer) to service_role;
grant execute on function public.engine_finish_calendar_outbox(uuid, boolean, text, text, text) to service_role;

commit;
