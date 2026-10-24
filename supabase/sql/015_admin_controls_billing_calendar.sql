-- ============================================================================
-- Admin remote controls, calendar connections and billing (run in the DASHBOARD project, after 013)
--   - per-client controls: pause timer, test mode, daily caps, booking rules, timing, phone, weather location
--   - calendar: connect, disconnect and request a sync for each client
--   - billing: plan, invoices, and the 30-day booking guarantee tracker
-- Every function checks the caller is an admin signed in with their authenticator code.
-- DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

-- confirmed: the approved status is exactly 'approved'
create or replace function private.engine_registration_ok(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_status, '') = 'approved';
$$;

-- ---------------------------------------------------------------- 1. controls
alter table public.account_engine_settings
  add column if not exists paused_until timestamptz,
  add column if not exists test_mode boolean not null default false,
  add column if not exists daily_message_cap integer not null default 300 check (daily_message_cap between 1 and 5000),
  add column if not exists daily_conversation_cap integer not null default 60 check (daily_conversation_cap between 1 and 1000);

-- the gate every outgoing text goes through. It now also respects the pause timer and test mode
-- (in test mode, only the owner's own notification number can be texted).
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
              and private.engine_registration_ok(a.registration_status)
              and s.engine_enabled
              and (s.paused_until is null or s.paused_until <= now())
              and (not s.test_mode or (a.notification_phone is not null and a.notification_phone = p_phone))
         )
     and not exists (
           select 1
             from public.account_opt_outs o
            where o.account_id = p_account and o.phone_e164 = p_phone and o.released_at is null
         );
$$;
revoke all on function public.engine_can_text(uuid, text) from public, anon, authenticated;
grant execute on function public.engine_can_text(uuid, text) to service_role;

create or replace function private.engine_controls_json(p_account uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'engine_enabled', coalesce(s.engine_enabled, false),
           'paused_until', s.paused_until,
           'test_mode', coalesce(s.test_mode, false),
           'book_existing_customers', coalesce(s.book_existing_customers, false),
           'daily_message_cap', coalesce(s.daily_message_cap, 300),
           'daily_conversation_cap', coalesce(s.daily_conversation_cap, 60),
           'inspection_minutes', coalesce(s.inspection_minutes, 60),
           'slot_step_minutes', coalesce(s.slot_step_minutes, 60),
           'min_notice_hours', coalesce(s.min_notice_hours, 4),
           'max_days_ahead', coalesce(s.max_days_ahead, 14),
           'concurrent_inspections', coalesce(s.concurrent_inspections, 1),
           'follow_up_schedule_hours', to_jsonb(coalesce(s.follow_up_schedule_hours, '{4,24,72,120,168}'::integer[])),
           'reply_delay_min_seconds', coalesce(s.reply_delay_min_seconds, 20),
           'reply_delay_max_seconds', coalesce(s.reply_delay_max_seconds, 75),
           'ai_model', s.ai_model,
           'phone_number', pc.phone_number_e164,
           'forwarding_status', coalesce(pc.forwarding_status, 'not_set'),
           'twilio_ready', (pc.twilio_subaccount_sid is not null and pc.messaging_service_sid is not null
                            and pc.auth_token_secret_id is not null and pc.phone_number_e164 is not null),
           'registration_status', a.registration_status,
           'account_status', a.status,
           'notification_phone', a.notification_phone,
           'service_lat', a.service_lat,
           'service_lon', a.service_lon,
           'service_country', a.service_country,
           'storm_mode', w.storm_mode,
           'weather_error', w.last_error,
           'weather_fetched_at', w.fetched_at,
           'pending_events', (select count(*) from public.inbox i where i.account_id = a.id and i.status in ('pending', 'processing')),
           'failed_events', (select count(*) from public.inbox i where i.account_id = a.id and i.status = 'failed')
         )
    from public.accounts a
    left join public.account_engine_settings s on s.account_id = a.id
    left join public.account_phone_config pc on pc.account_id = a.id
    left join public.account_weather w on w.account_id = a.id
   where a.id = p_account;
$$;

create or replace function public.admin_get_controls(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform private.require_admin_mfa();
  r := private.engine_controls_json(p_account_id);
  if r is null then
    raise exception 'not_found';
  end if;
  return r;
end;
$$;

-- change any of the controls. Only the keys you send are changed. Values are range-checked by the database.
create or replace function public.admin_update_controls(p_account_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text;
begin
  perform private.require_admin_mfa();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch_must_be_object';
  end if;
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;

  insert into public.account_engine_settings (account_id) values (p_account_id) on conflict (account_id) do nothing;

  update public.account_engine_settings set
    paused_until = case when (p_patch -> 'paused_until') is not null then nullif(p_patch ->> 'paused_until', '')::timestamptz else paused_until end,
    test_mode = case when (p_patch -> 'test_mode') is not null then (p_patch ->> 'test_mode')::boolean else test_mode end,
    book_existing_customers = case when (p_patch -> 'book_existing_customers') is not null then (p_patch ->> 'book_existing_customers')::boolean else book_existing_customers end,
    daily_message_cap = case when (p_patch -> 'daily_message_cap') is not null then (p_patch ->> 'daily_message_cap')::integer else daily_message_cap end,
    daily_conversation_cap = case when (p_patch -> 'daily_conversation_cap') is not null then (p_patch ->> 'daily_conversation_cap')::integer else daily_conversation_cap end,
    inspection_minutes = case when (p_patch -> 'inspection_minutes') is not null then (p_patch ->> 'inspection_minutes')::integer else inspection_minutes end,
    slot_step_minutes = case when (p_patch -> 'slot_step_minutes') is not null then (p_patch ->> 'slot_step_minutes')::integer else slot_step_minutes end,
    min_notice_hours = case when (p_patch -> 'min_notice_hours') is not null then (p_patch ->> 'min_notice_hours')::integer else min_notice_hours end,
    max_days_ahead = case when (p_patch -> 'max_days_ahead') is not null then (p_patch ->> 'max_days_ahead')::integer else max_days_ahead end,
    concurrent_inspections = case when (p_patch -> 'concurrent_inspections') is not null then (p_patch ->> 'concurrent_inspections')::integer else concurrent_inspections end,
    reply_delay_min_seconds = case when (p_patch -> 'reply_delay_min_seconds') is not null then (p_patch ->> 'reply_delay_min_seconds')::integer else reply_delay_min_seconds end,
    reply_delay_max_seconds = case when (p_patch -> 'reply_delay_max_seconds') is not null then (p_patch ->> 'reply_delay_max_seconds')::integer else reply_delay_max_seconds end,
    ai_model = case when (p_patch -> 'ai_model') is not null then nullif(btrim(p_patch ->> 'ai_model'), '') else ai_model end,
    follow_up_schedule_hours = case
      when (p_patch -> 'follow_up_schedule_hours') is not null then
        array(select e::integer from jsonb_array_elements_text(p_patch -> 'follow_up_schedule_hours') with ordinality t(e, i) order by i)
      else follow_up_schedule_hours end
  where account_id = p_account_id;

  if (p_patch -> 'phone_number') is not null or (p_patch -> 'forwarding_status') is not null then
    insert into public.account_phone_config (account_id) values (p_account_id) on conflict (account_id) do nothing;
    update public.account_phone_config set
      phone_number_e164 = case when (p_patch -> 'phone_number') is not null then nullif(btrim(p_patch ->> 'phone_number'), '') else phone_number_e164 end,
      forwarding_status = case when (p_patch -> 'forwarding_status') is not null then p_patch ->> 'forwarding_status' else forwarding_status end,
      forwarding_verified_at = case
        when (p_patch -> 'forwarding_status') is not null and p_patch ->> 'forwarding_status' = 'verified' then now()
        when (p_patch -> 'forwarding_status') is not null then null
        else forwarding_verified_at end
    where account_id = p_account_id;
  end if;

  if (p_patch -> 'service_lat') is not null or (p_patch -> 'service_lon') is not null or (p_patch -> 'service_country') is not null then
    update public.accounts set
      service_lat = case when (p_patch -> 'service_lat') is not null then nullif(p_patch ->> 'service_lat', '')::numeric else service_lat end,
      service_lon = case when (p_patch -> 'service_lon') is not null then nullif(p_patch ->> 'service_lon', '')::numeric else service_lon end,
      service_country = case when (p_patch -> 'service_country') is not null then p_patch ->> 'service_country' else service_country end
    where id = p_account_id;
  end if;

  select string_agg(k, ', ' order by k) into v_keys from jsonb_object_keys(p_patch) k;
  perform private.engine_log_admin_action(p_account_id, 'engine_controls_changed', left('Changed: ' || coalesce(v_keys, ''), 200));

  return private.engine_controls_json(p_account_id);
end;
$$;

-- put every failed event for this client back in the queue
create or replace function public.admin_retry_failed_events(p_account_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform private.require_admin_mfa();
  update public.inbox
     set status = 'pending', attempts = 0, run_after = now(), locked_at = null, locked_by = null, last_error = null
   where account_id = p_account_id and status = 'failed';
  get diagnostics n = row_count;
  perform private.engine_log_admin_action(p_account_id, 'engine_retry_failed', 'Retried ' || n || ' failed events');
  return n;
end;
$$;

-- turning the engine ON also starts the 30-day guarantee clock, once
create or replace function public.admin_set_engine_enabled(p_account_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ready boolean;
begin
  perform private.require_admin_mfa();

  if p_enabled then
    select (a.status = 'live'
            and private.engine_registration_ok(a.registration_status)
            and pc.twilio_subaccount_sid is not null and pc.messaging_service_sid is not null
            and pc.auth_token_secret_id is not null and pc.phone_number_e164 is not null
            and pc.forwarding_status = 'verified')
      into v_ready
      from public.accounts a
      left join public.account_phone_config pc on pc.account_id = a.id
     where a.id = p_account_id;
    if not coalesce(v_ready, false) then
      raise exception 'not_ready';
    end if;
  end if;

  insert into public.account_engine_settings (account_id, engine_enabled)
  values (p_account_id, p_enabled)
  on conflict (account_id) do update set engine_enabled = excluded.engine_enabled;

  if p_enabled then
    insert into public.account_billing (account_id, go_live_at) values (p_account_id, now())
    on conflict (account_id) do update set go_live_at = coalesce(public.account_billing.go_live_at, excluded.go_live_at);
  end if;

  perform private.engine_log_admin_action(
    p_account_id, case when p_enabled then 'engine_on' else 'engine_off' end,
    case when p_enabled then 'Turned the texting engine on' else 'Turned the texting engine off' end);

  return public.admin_engine_status(p_account_id);
end;
$$;

-- ---------------------------------------------------------------- 2. calendar
alter table public.calendar_connections
  add column if not exists sync_requested_at timestamptz,
  add column if not exists calendar_label text check (calendar_label is null or char_length(calendar_label) <= 120);

create or replace function private.engine_calendar_json(p_account uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'provider', coalesce(c.provider, 'none'),
           'status', coalesce(c.status, 'not_connected'),
           'calendar_label', c.calendar_label,
           'external_calendar_id', c.external_calendar_id,
           'last_synced_at', c.last_synced_at,
           'last_error', c.last_error,
           'sync_requested_at', c.sync_requested_at,
           'has_token', (c.token_secret_id is not null),
           'busy_blocks', (select count(*) from public.calendar_busy b where b.account_id = p_account and b.ends_at >= now()),
           'pending_writes', (select count(*) from public.calendar_outbox o where o.account_id = p_account and o.status in ('pending', 'sending')),
           'failed_writes', (select count(*) from public.calendar_outbox o where o.account_id = p_account and o.status = 'failed'),
           'synced_appointments', (select count(*) from public.appointments a where a.account_id = p_account and a.sync_status = 'synced'),
           'upcoming_appointments', (select count(*) from public.appointments a where a.account_id = p_account and a.status in ('scheduled', 'rescheduled') and a.starts_at >= now())
         )
    from (select 1) one
    left join public.calendar_connections c on c.account_id = p_account;
$$;

create or replace function public.admin_calendar_status(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_mfa();
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;
  return private.engine_calendar_json(p_account_id);
end;
$$;

create or replace function public.admin_calendar_set(
  p_account_id uuid, p_provider text, p_calendar_id text default null, p_label text default null, p_status text default 'not_connected'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_mfa();
  if p_provider is null or p_provider not in ('none', 'google', 'microsoft', 'ics') then
    raise exception 'bad_provider';
  end if;
  if p_status is null or p_status not in ('not_connected', 'active', 'needs_reauth', 'error') then
    raise exception 'bad_status';
  end if;
  if p_status = 'active' and p_provider not in ('google', 'microsoft') then
    raise exception 'provider_cannot_be_active';
  end if;
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;

  insert into public.calendar_connections (account_id, provider, status, external_calendar_id, calendar_label)
  values (p_account_id, p_provider, p_status, nullif(btrim(p_calendar_id), ''), nullif(btrim(p_label), ''))
  on conflict (account_id) do update
    set provider = excluded.provider, status = excluded.status,
        external_calendar_id = excluded.external_calendar_id, calendar_label = excluded.calendar_label,
        last_error = null;

  perform private.engine_log_admin_action(p_account_id, 'calendar_set', 'Calendar: ' || p_provider || ', ' || p_status);
  return private.engine_calendar_json(p_account_id);
end;
$$;

create or replace function public.admin_calendar_request_sync(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_mfa();
  update public.calendar_connections set sync_requested_at = now()
   where account_id = p_account_id and status = 'active';
  if not found then
    raise exception 'not_connected';
  end if;
  perform private.engine_log_admin_action(p_account_id, 'calendar_sync_requested', 'Requested a calendar sync');
  return private.engine_calendar_json(p_account_id);
end;
$$;

create or replace function public.admin_calendar_disconnect(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_mfa();
  update public.calendar_connections
     set provider = 'none', status = 'not_connected', external_calendar_id = null, calendar_label = null,
         token_secret_id = null, sync_cursor = null, sync_requested_at = null, last_error = null
   where account_id = p_account_id;
  delete from public.calendar_busy where account_id = p_account_id;
  update public.calendar_outbox set status = 'failed', last_error = 'Calendar disconnected', locked_at = null
   where account_id = p_account_id and status in ('pending', 'sending');
  perform private.engine_log_admin_action(p_account_id, 'calendar_disconnected', 'Disconnected the calendar');
  return private.engine_calendar_json(p_account_id);
end;
$$;

-- ---------------------------------------------------------------- 3. billing
create table if not exists public.account_billing (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  plan text not null default 'Standard' check (char_length(plan) between 1 and 60),
  monthly_price_cents integer not null default 69700 check (monthly_price_cents between 0 and 10000000),
  setup_fee_cents integer not null default 0 check (setup_fee_cents between 0 and 10000000),
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'paused', 'canceled')),
  billing_email text check (billing_email is null or char_length(billing_email) <= 200),
  payment_method text not null default 'manual' check (payment_method in ('manual', 'card', 'ach', 'invoice')),
  go_live_at timestamptz,
  next_invoice_on date,
  guarantee_override text check (guarantee_override is null or guarantee_override in ('waived', 'credited')),
  notes text check (notes is null or char_length(notes) <= 1000),
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists account_billing_touch on public.account_billing;
create trigger account_billing_touch before update on public.account_billing
  for each row execute function private.engine_touch_updated_at();

create table if not exists public.account_invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  issued_on date not null default current_date,
  kind text not null check (kind in ('setup', 'monthly', 'credit', 'adjustment')),
  amount_cents integer not null check (amount_cents between -10000000 and 10000000),
  status text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  paid_on date,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists account_invoices_account_idx on public.account_invoices (account_id, issued_on desc);

alter table public.account_billing enable row level security;
alter table public.account_invoices enable row level security;
revoke all on table public.account_billing, public.account_invoices from anon, authenticated;
grant all on table public.account_billing, public.account_invoices to service_role;

-- the 30-day booking guarantee: 2 booked inspections in the 30 days after go-live, with 6+ missed calls a week.
-- A booked inspection counts even if it is later cancelled or moved.
create or replace function private.engine_guarantee(p_account uuid, p_go_live timestamptz, p_override text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_end timestamptz;
  v_booked integer;
  v_calls integer;
  v_days numeric;
  v_per_week numeric;
  v_status text;
begin
  if p_go_live is null then
    return jsonb_build_object('status', 'not_started', 'required', 2, 'booked', 0, 'missed_calls', 0, 'calls_per_week', 0);
  end if;

  v_end := p_go_live + interval '30 days';

  select count(distinct e.lead_id) into v_booked
    from public.lead_events e
   where e.account_id = p_account and e.event_type = 'booked' and e.created_at >= p_go_live and e.created_at < v_end;

  select count(*) into v_calls
    from public.leads l
   where l.account_id = p_account and l.created_at >= p_go_live and l.created_at < v_end
     and l.contact_type in ('homeowner', 'unknown') and l.status <> 'not_a_lead';

  v_days := greatest(1, extract(epoch from (least(now(), v_end) - p_go_live)) / 86400);
  v_per_week := round(v_calls / (v_days / 7.0), 1);

  v_status := case
    when p_override = 'waived' then 'waived'
    when p_override = 'credited' then 'credited'
    when v_booked >= 2 then 'met'
    when now() < v_end then 'in_progress'
    when v_per_week < 6 then 'not_eligible'
    else 'credit_due'
  end;

  return jsonb_build_object(
    'status', v_status, 'required', 2, 'booked', v_booked, 'missed_calls', v_calls, 'calls_per_week', v_per_week,
    'go_live_at', p_go_live, 'window_end', v_end, 'days_left', greatest(0, ceil(extract(epoch from (v_end - now())) / 86400))::integer
  );
end;
$$;

create or replace function private.engine_billing_json(p_account uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.account_billing%rowtype;
  v_exists boolean;
begin
  select * into b from public.account_billing where account_id = p_account;
  v_exists := found;
  if not v_exists then
    b.plan := 'Standard'; b.monthly_price_cents := 69700; b.setup_fee_cents := 0; b.status := 'trial';
    b.payment_method := 'manual';
  end if;

  return jsonb_build_object(
    'exists', v_exists,
    'plan', b.plan, 'monthly_price_cents', b.monthly_price_cents, 'setup_fee_cents', b.setup_fee_cents,
    'status', b.status, 'billing_email', b.billing_email, 'payment_method', b.payment_method,
    'go_live_at', b.go_live_at, 'next_invoice_on', b.next_invoice_on, 'guarantee_override', b.guarantee_override,
    'notes', b.notes, 'stripe_customer_id', b.stripe_customer_id,
    'paid_cents', coalesce((select sum(amount_cents) from public.account_invoices where account_id = p_account and status = 'paid'), 0),
    'pending_cents', coalesce((select sum(amount_cents) from public.account_invoices where account_id = p_account and status = 'pending'), 0),
    'invoices', coalesce((select jsonb_agg(to_jsonb(i) order by i.issued_on desc, i.created_at desc)
                            from (select id, issued_on, kind, amount_cents, status, paid_on, note, created_at
                                    from public.account_invoices where account_id = p_account
                                   order by issued_on desc, created_at desc limit 100) i), '[]'::jsonb),
    'guarantee', private.engine_guarantee(p_account, b.go_live_at, b.guarantee_override)
  );
end;
$$;

create or replace function public.admin_billing_get(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_mfa();
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;
  return private.engine_billing_json(p_account_id);
end;
$$;

create or replace function public.admin_billing_save(p_account_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text;
begin
  perform private.require_admin_mfa();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'patch_must_be_object';
  end if;
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;

  insert into public.account_billing (account_id) values (p_account_id) on conflict (account_id) do nothing;

  update public.account_billing set
    plan = case when (p_patch -> 'plan') is not null then btrim(p_patch ->> 'plan') else plan end,
    monthly_price_cents = case when (p_patch -> 'monthly_price_cents') is not null then (p_patch ->> 'monthly_price_cents')::integer else monthly_price_cents end,
    setup_fee_cents = case when (p_patch -> 'setup_fee_cents') is not null then (p_patch ->> 'setup_fee_cents')::integer else setup_fee_cents end,
    status = case when (p_patch -> 'status') is not null then p_patch ->> 'status' else status end,
    billing_email = case when (p_patch -> 'billing_email') is not null then nullif(btrim(p_patch ->> 'billing_email'), '') else billing_email end,
    payment_method = case when (p_patch -> 'payment_method') is not null then p_patch ->> 'payment_method' else payment_method end,
    go_live_at = case when (p_patch -> 'go_live_at') is not null then nullif(p_patch ->> 'go_live_at', '')::timestamptz else go_live_at end,
    next_invoice_on = case when (p_patch -> 'next_invoice_on') is not null then nullif(p_patch ->> 'next_invoice_on', '')::date else next_invoice_on end,
    guarantee_override = case when (p_patch -> 'guarantee_override') is not null then nullif(p_patch ->> 'guarantee_override', '') else guarantee_override end,
    notes = case when (p_patch -> 'notes') is not null then nullif(btrim(p_patch ->> 'notes'), '') else notes end
  where account_id = p_account_id;

  select string_agg(k, ', ' order by k) into v_keys from jsonb_object_keys(p_patch) k;
  perform private.engine_log_admin_action(p_account_id, 'billing_changed', left('Billing changed: ' || coalesce(v_keys, ''), 200));
  return private.engine_billing_json(p_account_id);
end;
$$;

create or replace function public.admin_invoice_add(
  p_account_id uuid, p_kind text, p_amount_cents integer, p_issued_on date default current_date,
  p_status text default 'pending', p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_mfa();
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;
  insert into public.account_invoices (account_id, issued_on, kind, amount_cents, status, paid_on, note)
  values (p_account_id, coalesce(p_issued_on, current_date), p_kind, p_amount_cents, p_status,
          case when p_status = 'paid' then coalesce(p_issued_on, current_date) end, nullif(btrim(p_note), ''));
  perform private.engine_log_admin_action(p_account_id, 'invoice_added', p_kind || ' ' || (p_amount_cents / 100.0)::text);
  return private.engine_billing_json(p_account_id);
end;
$$;

create or replace function public.admin_invoice_set_status(p_invoice_id uuid, p_status text, p_paid_on date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  perform private.require_admin_mfa();
  if p_status is null or p_status not in ('pending', 'paid', 'void') then
    raise exception 'bad_status';
  end if;
  update public.account_invoices
     set status = p_status, paid_on = case when p_status = 'paid' then coalesce(p_paid_on, current_date) end
   where id = p_invoice_id
  returning account_id into v_account;
  if v_account is null then
    raise exception 'not_found';
  end if;
  perform private.engine_log_admin_action(v_account, 'invoice_' || p_status, 'Invoice marked ' || p_status);
  return private.engine_billing_json(v_account);
end;
$$;

-- ---------------------------------------------------------------- 4. permissions
revoke all on function public.admin_get_controls(uuid) from public, anon;
revoke all on function public.admin_update_controls(uuid, jsonb) from public, anon;
revoke all on function public.admin_retry_failed_events(uuid) from public, anon;
revoke all on function public.admin_set_engine_enabled(uuid, boolean) from public, anon;
revoke all on function public.admin_calendar_status(uuid) from public, anon;
revoke all on function public.admin_calendar_set(uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_calendar_request_sync(uuid) from public, anon;
revoke all on function public.admin_calendar_disconnect(uuid) from public, anon;
revoke all on function public.admin_billing_get(uuid) from public, anon;
revoke all on function public.admin_billing_save(uuid, jsonb) from public, anon;
revoke all on function public.admin_invoice_add(uuid, text, integer, date, text, text) from public, anon;
revoke all on function public.admin_invoice_set_status(uuid, text, date) from public, anon;
grant execute on function public.admin_get_controls(uuid) to authenticated;
grant execute on function public.admin_update_controls(uuid, jsonb) to authenticated;
grant execute on function public.admin_retry_failed_events(uuid) to authenticated;
grant execute on function public.admin_set_engine_enabled(uuid, boolean) to authenticated;
grant execute on function public.admin_calendar_status(uuid) to authenticated;
grant execute on function public.admin_calendar_set(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_calendar_request_sync(uuid) to authenticated;
grant execute on function public.admin_calendar_disconnect(uuid) to authenticated;
grant execute on function public.admin_billing_get(uuid) to authenticated;
grant execute on function public.admin_billing_save(uuid, jsonb) to authenticated;
grant execute on function public.admin_invoice_add(uuid, text, integer, date, text, text) to authenticated;
grant execute on function public.admin_invoice_set_status(uuid, text, date) to authenticated;

commit;
