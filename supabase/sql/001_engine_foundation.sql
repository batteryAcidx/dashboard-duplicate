-- ============================================================================
-- WedgeScale engine foundation  (run in the DASHBOARD Supabase project only)
-- Additive: existing tables, policies and the dashboard keep working.
-- Only change to existing rules: lead_events.event_type gets a longer allowed list.
--
-- DRY RUN FIRST: change the last line from "commit;" to "rollback;", run it,
-- and confirm there are no errors. Then restore "commit;" and run it for real.
-- ============================================================================
begin;

create schema if not exists private;

-- ---------------------------------------------------------------- helpers
create or replace function private.engine_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- 1. per-account engine settings
create table if not exists public.account_engine_settings (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  engine_enabled boolean not null default false,            -- the kill switch
  inspection_minutes integer not null default 60 check (inspection_minutes between 15 and 240),
  slot_step_minutes integer not null default 60 check (slot_step_minutes in (15, 30, 60, 120)),
  min_notice_hours integer not null default 4 check (min_notice_hours between 0 and 168),
  max_days_ahead integer not null default 14 check (max_days_ahead between 1 and 60),
  concurrent_inspections integer not null default 1 check (concurrent_inspections between 1 and 10),
  follow_up_schedule_hours integer[] not null default '{4,24,72,120,168}'
    check (cardinality(follow_up_schedule_hours) <= 10),
  reply_delay_min_seconds integer not null default 20 check (reply_delay_min_seconds between 0 and 600),
  reply_delay_max_seconds integer not null default 75 check (reply_delay_max_seconds between 0 and 600),
  ai_model text check (ai_model is null or char_length(ai_model) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engine_settings_delay_order check (reply_delay_max_seconds >= reply_delay_min_seconds)
);

-- ---------------------------------------------------------------- 2. phone provider config (one Twilio subaccount per client)
create table if not exists public.account_phone_config (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  provider text not null default 'twilio' check (provider in ('twilio')),
  twilio_subaccount_sid text unique
    check (twilio_subaccount_sid is null or twilio_subaccount_sid ~ '^AC[0-9a-fA-F]{32}$'),
  auth_token_secret_id uuid,                                 -- points at an encrypted secret in Supabase Vault
  messaging_service_sid text unique
    check (messaging_service_sid is null or messaging_service_sid ~ '^MG[0-9a-fA-F]{32}$'),
  phone_number_e164 text unique
    check (phone_number_e164 is null or phone_number_e164 ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  phone_number_sid text unique
    check (phone_number_sid is null or phone_number_sid ~ '^PN[0-9a-fA-F]{32}$'),
  brand_sid text,
  campaign_sid text,
  forwarding_status text not null default 'not_set' check (forwarding_status in ('not_set', 'pending', 'verified')),
  forwarding_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- 3. conversation state per lead
create table if not exists public.lead_state (
  lead_id uuid primary key,
  account_id uuid not null,
  stage text not null default 'new'
    check (stage in ('new', 'qualifying', 'awaiting_photo', 'awaiting_time', 'booked', 'handed_off', 'closed', 'opted_out')),
  collected jsonb not null default '{}'::jsonb,              -- details extracted so far (name, address, damage, insurance...)
  flags jsonb not null default '{}'::jsonb,                  -- e.g. safety warning already given, price asked
  inbound_count integer not null default 0 check (inbound_count >= 0),
  ai_reply_count integer not null default 0 check (ai_reply_count >= 0),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  next_action text check (next_action is null or next_action in ('follow_up', 'expire')),
  next_action_at timestamptz,
  follow_ups_sent integer not null default 0 check (follow_ups_sent >= 0),
  handoff_reason text check (handoff_reason is null or char_length(handoff_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_state_lead_fk foreign key (lead_id, account_id)
    references public.leads (id, account_id) on delete cascade
);
create index if not exists lead_state_account_idx on public.lead_state (account_id);
create index if not exists lead_state_next_action_idx on public.lead_state (next_action_at) where next_action_at is not null;

-- ---------------------------------------------------------------- 4. inbox: every provider event lands here first
create table if not exists public.inbox (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  provider text not null default 'twilio',
  event_type text not null check (event_type in ('sms_inbound', 'call_missed', 'sms_status', 'call_status')),
  provider_id text not null,                                 -- MessageSid / CallSid: the idempotency key
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed', 'ignored')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint inbox_idempotency unique (provider, event_type, provider_id)
);
create index if not exists inbox_ready_idx on public.inbox (run_after) where status = 'pending';
create index if not exists inbox_account_idx on public.inbox (account_id, received_at desc);

-- ---------------------------------------------------------------- 5. opt-outs keyed by account + phone
create table if not exists public.account_opt_outs (
  account_id uuid not null references public.accounts(id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  reason text not null default 'stop' check (reason in ('stop', 'manual', 'complaint', 'invalid')),
  source text,
  opted_out_at timestamptz not null default now(),
  released_at timestamptz,
  primary key (account_id, phone_e164)
);

-- ---------------------------------------------------------------- 6. owner-blocked times (until calendar sync exists)
create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  constraint availability_blocks_order check (ends_at > starts_at),
  constraint availability_blocks_len check (ends_at <= starts_at + interval '60 days')
);
create index if not exists availability_blocks_idx on public.availability_blocks (account_id, starts_at, ends_at);

-- ---------------------------------------------------------------- 7. AI call log (no message content stored here)
create table if not exists public.ai_calls (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  lead_id uuid,
  purpose text not null check (purpose in ('reply', 'extract', 'photo', 'follow_up')),
  model text not null,
  prompt_version text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  verdict text not null check (verdict in ('sent', 'blocked', 'fallback', 'error')),
  block_reason text check (block_reason is null or char_length(block_reason) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists ai_calls_account_idx on public.ai_calls (account_id, created_at desc);

-- ---------------------------------------------------------------- 8. owner alerts (outbox with retries)
create table if not exists public.owner_alerts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  lead_id uuid,
  kind text not null check (kind in ('booked', 'priority', 'needs_you', 'handoff', 'system')),
  channel text not null default 'sms' check (channel in ('sms', 'email')),
  body text not null check (char_length(body) between 1 and 1000),
  dedupe_key text,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  run_after timestamptz not null default now(),
  last_error text,
  provider_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index if not exists owner_alerts_dedupe_idx on public.owner_alerts (account_id, dedupe_key) where dedupe_key is not null;
create index if not exists owner_alerts_ready_idx on public.owner_alerts (run_after) where status = 'pending';

-- ---------------------------------------------------------------- 9. additions to existing tables
alter table public.leads
  add column if not exists phone_e164 text
    check (phone_e164 is null or phone_e164 ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$');
create index if not exists leads_account_phone_idx on public.leads (account_id, phone_e164) where phone_e164 is not null;

update public.leads
   set phone_e164 = '+1' || regexp_replace(phone, '\D', '', 'g')
 where phone_e164 is null
   and phone is not null
   and regexp_replace(phone, '\D', '', 'g') ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$';

alter table public.messages
  add column if not exists provider_message_id text,
  add column if not exists send_after timestamptz not null default now(),
  add column if not exists attempts integer not null default 0,
  add column if not exists media_count integer not null default 0,
  add column if not exists ai_call_id uuid references public.ai_calls (id) on delete set null;
create unique index if not exists messages_provider_id_idx on public.messages (account_id, provider_message_id) where provider_message_id is not null;
create index if not exists messages_outbox_idx on public.messages (send_after) where direction = 'outbound' and delivery_status = 'queued';

alter table public.attachments
  add column if not exists provider_media_sid text,
  add column if not exists ai_status text not null default 'pending'
    check (ai_status in ('pending', 'done', 'skipped', 'failed')),
  add column if not exists ai_summary text check (ai_summary is null or char_length(ai_summary) <= 500),
  add column if not exists ai_flags text[] not null default '{}',
  add column if not exists analyzed_at timestamptz;
update public.attachments set ai_status = 'skipped' where ai_status = 'pending';   -- legacy rows are not re-analysed

alter table public.lead_events drop constraint if exists lead_events_event_type_check;
alter table public.lead_events add constraint lead_events_event_type_check check (
  event_type = any (array[
    'status_changed', 'booked', 'rescheduled', 'took_over', 'handed_back', 'opted_out', 'lead_edited',
    'priority_flagged', 'photo_received', 'owner_alerted', 'follow_up_sent',
    'engine_paused', 'engine_resumed', 'engine_error'
  ])
);

-- ---------------------------------------------------------------- 10. triggers
drop trigger if exists account_engine_settings_touch on public.account_engine_settings;
create trigger account_engine_settings_touch before update on public.account_engine_settings
  for each row execute function private.engine_touch_updated_at();

drop trigger if exists account_phone_config_touch on public.account_phone_config;
create trigger account_phone_config_touch before update on public.account_phone_config
  for each row execute function private.engine_touch_updated_at();

drop trigger if exists lead_state_touch on public.lead_state;
create trigger lead_state_touch before update on public.lead_state
  for each row execute function private.engine_touch_updated_at();

create or replace function private.engine_on_account_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_engine_settings (account_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists accounts_engine_defaults on public.accounts;
create trigger accounts_engine_defaults after insert on public.accounts
  for each row execute function private.engine_on_account_insert();

create or replace function private.engine_on_lead_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.lead_state (lead_id, account_id, stage)
  values (new.id, new.account_id, case when new.status = 'booked' then 'booked' else 'new' end)
  on conflict do nothing;
  return new;
end;
$$;
drop trigger if exists leads_engine_state on public.leads;
create trigger leads_engine_state after insert on public.leads
  for each row execute function private.engine_on_lead_insert();

-- backfill for rows that already exist (engine stays OFF for every account)
insert into public.account_engine_settings (account_id)
select id from public.accounts
on conflict do nothing;

insert into public.lead_state (lead_id, account_id, stage)
select id, account_id,
       case when status = 'booked' then 'booked'
            when status in ('won', 'lost', 'not_a_lead') then 'closed'
            else 'qualifying' end
  from public.leads
on conflict do nothing;

-- ---------------------------------------------------------------- 11. functions the engine calls (service role only)

-- take a batch of pending events; a crashed worker's rows are recovered after 5 minutes
create or replace function public.engine_claim_inbox(p_limit integer default 10, p_worker text default 'worker')
returns setof public.inbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inbox
     set status = 'pending', locked_at = null, locked_by = null
   where status = 'processing' and locked_at < now() - interval '5 minutes';

  return query
  update public.inbox i
     set status = 'processing', locked_at = now(), locked_by = p_worker, attempts = i.attempts + 1
   where i.id in (
     select x.id
       from public.inbox x
      where x.status = 'pending' and x.run_after <= now()
      order by x.received_at
      limit greatest(1, least(p_limit, 50))
        for update skip locked
   )
  returning i.*;
end;
$$;

-- p_status: done | failed | ignored | retry   (retry backs off, then fails after max_attempts)
create or replace function public.engine_finish_inbox(
  p_id uuid, p_status text, p_error text default null, p_retry_in_seconds integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_max integer;
begin
  if p_status not in ('done', 'failed', 'ignored', 'retry') then
    raise exception 'bad_status';
  end if;

  select attempts, max_attempts into v_attempts, v_max from public.inbox where id = p_id;
  if not found then
    return;
  end if;

  if p_status = 'retry' and v_attempts < v_max then
    update public.inbox
       set status = 'pending', locked_at = null, locked_by = null, last_error = left(p_error, 500),
           run_after = now() + make_interval(secs => coalesce(p_retry_in_seconds, 30 * v_attempts * v_attempts))
     where id = p_id;
  else
    update public.inbox
       set status = case when p_status = 'retry' then 'failed' else p_status end,
           locked_at = null, locked_by = null, last_error = left(p_error, 500), processed_at = now()
     where id = p_id;
  end if;
end;
$$;

-- opt a number out for ONE account and pause every lead with that number
create or replace function public.engine_record_opt_out(p_account uuid, p_phone text, p_source text default 'sms_stop')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_opt_outs (account_id, phone_e164, source)
  values (p_account, p_phone, p_source)
  on conflict (account_id, phone_e164)
  do update set opted_out_at = now(), released_at = null, source = excluded.source, reason = 'stop';

  insert into public.lead_events (account_id, lead_id, event_type, detail, actor)
  select l.account_id, l.id, 'opted_out', 'Replied STOP', 'system'
    from public.leads l
   where l.account_id = p_account and l.phone_e164 = p_phone and l.opted_out = false;

  update public.leads
     set opted_out = true, automation_paused = true, updated_at = now()
   where account_id = p_account and phone_e164 = p_phone;

  update public.lead_state
     set stage = 'opted_out', next_action = null, next_action_at = null
   where account_id = p_account
     and lead_id in (select id from public.leads where account_id = p_account and phone_e164 = p_phone);
end;
$$;

create or replace function public.engine_release_opt_out(p_account uuid, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.account_opt_outs
     set released_at = now()
   where account_id = p_account and phone_e164 = p_phone and released_at is null;

  update public.leads
     set opted_out = false, updated_at = now()
   where account_id = p_account and phone_e164 = p_phone and opted_out = true;
end;
$$;

-- the one gate every outgoing text goes through
create or replace function public.engine_can_text(p_account uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1
             from public.accounts a
             join public.account_engine_settings s on s.account_id = a.id
            where a.id = p_account
              and a.status = 'live'
              and a.registration_status = 'approved'
              and s.engine_enabled
         )
     and not exists (
           select 1
             from public.account_opt_outs o
            where o.account_id = p_account and o.phone_e164 = p_phone and o.released_at is null
         );
$$;

-- find this caller's open lead (last 30 days) or create one
create or replace function public.engine_get_or_create_lead(p_account uuid, p_phone text, p_missed_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text || p_phone, 11));

  select l.id into v_id
    from public.leads l
   where l.account_id = p_account
     and l.phone_e164 = p_phone
     and l.status in ('booked', 'following_up', 'needs_you')
     and l.created_at > now() - interval '30 days'
   order by l.created_at desc
   limit 1;

  if v_id is null then
    insert into public.leads (account_id, phone, phone_e164, status, missed_call_at, unread)
    values (p_account, p_phone, p_phone, 'following_up', p_missed_at, true)
    returning id into v_id;
  elsif p_missed_at is not null then
    update public.leads set missed_call_at = coalesce(missed_call_at, p_missed_at) where id = v_id;
  end if;

  return v_id;
end;
$$;

-- bookable slots from the account's office hours, notice rule, blocks and existing appointments
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
   order by s.s_start
   limit greatest(1, least(p_limit, 500));
end;
$$;

-- book one inspection, safely. Booking the same slot twice for the same lead returns the same appointment.
create or replace function public.engine_book_inspection(
  p_account uuid, p_lead uuid, p_starts timestamptz, p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dur integer;
  v_tz text;
  v_existing uuid;
  v_ok boolean;
  v_id uuid;
  v_addr text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text, 7));

  if not exists (select 1 from public.leads where id = p_lead and account_id = p_account) then
    raise exception 'lead_not_found';
  end if;

  if exists (
       select 1
         from public.leads l
         join public.account_opt_outs o
           on o.account_id = l.account_id and o.phone_e164 = l.phone_e164 and o.released_at is null
        where l.id = p_lead
     ) then
    raise exception 'opted_out';
  end if;

  select ap.id into v_existing
    from public.appointments ap
   where ap.account_id = p_account and ap.lead_id = p_lead and ap.starts_at = p_starts
     and ap.status in ('scheduled', 'rescheduled')
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  select exists (
           select 1
             from public.engine_available_slots(p_account, p_starts, 1, 500) s
            where s.slot_start = p_starts
         ) into v_ok;
  if not v_ok then
    raise exception 'slot_unavailable';
  end if;

  select coalesce(es.inspection_minutes, 60), a.timezone
    into v_dur, v_tz
    from public.accounts a
    left join public.account_engine_settings es on es.account_id = a.id
   where a.id = p_account;

  select coalesce(p_address, l.address) into v_addr from public.leads l where l.id = p_lead;

  insert into public.appointments (account_id, lead_id, starts_at, ends_at, address, status)
  values (p_account, p_lead, p_starts, p_starts + make_interval(mins => v_dur), v_addr, 'scheduled')
  returning id into v_id;

  update public.leads
     set status = 'booked', status_changed_by = 'system', status_changed_at = now(), updated_at = now()
   where id = p_lead and account_id = p_account;

  insert into public.lead_events (account_id, lead_id, event_type, detail, actor)
  values (p_account, p_lead, 'booked', to_char(p_starts at time zone v_tz, 'Dy Mon DD, HH12:MI AM'), 'system');

  update public.lead_state
     set stage = 'booked', next_action = null, next_action_at = null
   where lead_id = p_lead and account_id = p_account;

  return v_id;
end;
$$;

-- encrypted storage for each client's Twilio subaccount token (needs Vault enabled in Database > Extensions)
create or replace function public.engine_store_twilio_token(p_account uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select auth_token_secret_id into v_id from public.account_phone_config where account_id = p_account;
  if v_id is not null then
    perform vault.update_secret(v_id, p_token);
  else
    v_id := vault.create_secret(p_token, 'twilio_auth_' || p_account::text, 'Twilio subaccount auth token');
    insert into public.account_phone_config (account_id, auth_token_secret_id)
    values (p_account, v_id)
    on conflict (account_id) do update set auth_token_secret_id = excluded.auth_token_secret_id;
  end if;
end;
$$;

create or replace function public.engine_get_twilio_token(p_account uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
    from public.account_phone_config c
    join vault.decrypted_secrets ds on ds.id = c.auth_token_secret_id
   where c.account_id = p_account;
$$;

-- ---------------------------------------------------------------- 12. permissions
alter table public.account_engine_settings enable row level security;
alter table public.account_phone_config enable row level security;
alter table public.lead_state enable row level security;
alter table public.inbox enable row level security;
alter table public.account_opt_outs enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.ai_calls enable row level security;
alter table public.owner_alerts enable row level security;

revoke all on table
  public.account_engine_settings, public.account_phone_config, public.lead_state, public.inbox,
  public.account_opt_outs, public.availability_blocks, public.ai_calls, public.owner_alerts
from anon, authenticated;

grant all on table
  public.account_engine_settings, public.account_phone_config, public.lead_state, public.inbox,
  public.account_opt_outs, public.availability_blocks, public.ai_calls, public.owner_alerts
to service_role;

-- what the dashboard may do: read its own settings and conversation state, manage its own blocked times
drop policy if exists "read own engine settings" on public.account_engine_settings;
create policy "read own engine settings" on public.account_engine_settings
  for select to authenticated using (account_id = private.current_account_id());
grant select on public.account_engine_settings to authenticated;

drop policy if exists "read own lead state" on public.lead_state;
create policy "read own lead state" on public.lead_state
  for select to authenticated using (account_id = private.current_account_id());
grant select on public.lead_state to authenticated;

drop policy if exists "read own availability blocks" on public.availability_blocks;
create policy "read own availability blocks" on public.availability_blocks
  for select to authenticated using (account_id = private.current_account_id());
drop policy if exists "add own availability blocks" on public.availability_blocks;
create policy "add own availability blocks" on public.availability_blocks
  for insert to authenticated with check (account_id = private.current_account_id());
drop policy if exists "remove own availability blocks" on public.availability_blocks;
create policy "remove own availability blocks" on public.availability_blocks
  for delete to authenticated using (account_id = private.current_account_id());
grant select, insert, delete on public.availability_blocks to authenticated;

-- engine functions: service role only
revoke all on function public.engine_claim_inbox(integer, text) from public, anon, authenticated;
revoke all on function public.engine_finish_inbox(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.engine_record_opt_out(uuid, text, text) from public, anon, authenticated;
revoke all on function public.engine_release_opt_out(uuid, text) from public, anon, authenticated;
revoke all on function public.engine_can_text(uuid, text) from public, anon, authenticated;
revoke all on function public.engine_get_or_create_lead(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.engine_available_slots(uuid, timestamptz, integer, integer) from public, anon, authenticated;
revoke all on function public.engine_book_inspection(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.engine_store_twilio_token(uuid, text) from public, anon, authenticated;
revoke all on function public.engine_get_twilio_token(uuid) from public, anon, authenticated;

grant execute on function public.engine_claim_inbox(integer, text) to service_role;
grant execute on function public.engine_finish_inbox(uuid, text, text, integer) to service_role;
grant execute on function public.engine_record_opt_out(uuid, text, text) to service_role;
grant execute on function public.engine_release_opt_out(uuid, text) to service_role;
grant execute on function public.engine_can_text(uuid, text) to service_role;
grant execute on function public.engine_get_or_create_lead(uuid, text, timestamptz) to service_role;
grant execute on function public.engine_available_slots(uuid, timestamptz, integer, integer) to service_role;
grant execute on function public.engine_book_inspection(uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.engine_store_twilio_token(uuid, text) to service_role;
grant execute on function public.engine_get_twilio_token(uuid) to service_role;

commit;
