-- ============================================================================
-- The control center (run in the DASHBOARD project, after 019)
--   setup steps can ask the client for information, and the admin can email them about it
--   business details and Twilio details per client, kept in one place
--   a guarded way to delete a client
--   the plumbing for a real Google Calendar connection
-- Every admin function checks the caller is an admin signed in with their authenticator code.
-- DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

-- ---------------------------------------------------------------- 1. setup steps that ask for information
alter table public.setup_steps
  add column if not exists info_prompt text check (info_prompt is null or char_length(info_prompt) <= 600),
  add column if not exists info_fields jsonb not null default '[]'::jsonb,
  add column if not exists info_response jsonb,
  add column if not exists info_submitted_at timestamptz,
  add column if not exists action text check (action is null or action in ('connect_calendar'));

-- the shape of a request: up to 8 fields, each { key, label, type, options?, required? }
create or replace function private.engine_valid_info_fields(p_fields jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  f jsonb;
  keys text[] := '{}';
  k text;
  t text;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' or jsonb_array_length(p_fields) > 8 then
    return false;
  end if;
  for f in select value from jsonb_array_elements(p_fields) loop
    if jsonb_typeof(f) <> 'object' then return false; end if;
    k := f ->> 'key';
    t := f ->> 'type';
    if k is null or k !~ '^[a-z][a-z0-9_]{0,39}$' or k = any (keys) then return false; end if;
    keys := array_append(keys, k);
    if coalesce(f ->> 'label', '') = '' or char_length(f ->> 'label') > 120 then return false; end if;
    if t is null or t not in ('text', 'textarea', 'phone', 'email', 'url', 'select') then return false; end if;
    if t = 'select' then
      if coalesce(jsonb_typeof(f -> 'options'), '') <> 'array' then return false; end if;
      if jsonb_array_length(f -> 'options') < 1 or jsonb_array_length(f -> 'options') > 12 then return false; end if;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.admin_set_step_request(
  p_account_id uuid, p_step_key text, p_prompt text, p_fields jsonb, p_action text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
begin
  perform private.require_admin_mfa();
  if not private.engine_valid_info_fields(coalesce(p_fields, '[]'::jsonb)) then
    raise exception 'bad_fields';
  end if;
  if p_action is not null and p_action not in ('connect_calendar') then
    raise exception 'bad_action';
  end if;

  update public.setup_steps
     set info_prompt = nullif(btrim(p_prompt), ''),
         info_fields = coalesce(p_fields, '[]'::jsonb),
         action = p_action
   where account_id = p_account_id and step_key = p_step_key
  returning to_jsonb(setup_steps.*) into v_row;
  if v_row is null then
    raise exception 'not_found';
  end if;

  perform private.engine_log_admin_action(p_account_id, 'setup_request_changed', left('Changed what is asked for in: ' || (v_row ->> 'title'), 200));
  return v_row;
end;
$$;

-- the client sends the information a step asked for. Optional: they can also just reply to the email.
create or replace function public.owner_submit_step_info(p_step_key text, p_response jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct uuid := private.current_account_id();
  s public.setup_steps%rowtype;
  f jsonb;
  k text;
  t text;
  v text;
  v_clean jsonb := '{}'::jsonb;
  v_digits text;
begin
  if v_acct is null then
    raise exception 'not_signed_in';
  end if;
  if p_response is null or jsonb_typeof(p_response) <> 'object' then
    raise exception 'bad_response';
  end if;

  select * into s from public.setup_steps where account_id = v_acct and step_key = p_step_key;
  if not found then
    raise exception 'step_not_found';
  end if;
  if jsonb_array_length(s.info_fields) = 0 then
    raise exception 'nothing_requested';
  end if;

  for f in select value from jsonb_array_elements(s.info_fields) loop
    k := f ->> 'key';
    t := f ->> 'type';
    v := nullif(btrim(p_response ->> k), '');
    if v is null then
      if coalesce((f ->> 'required')::boolean, false) then raise exception 'missing_field'; end if;
      continue;
    end if;
    if char_length(v) > (case when t = 'textarea' then 2000 else 300 end) then raise exception 'too_long'; end if;
    if t = 'email' and v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
    if t = 'url' and v !~* '^https?://[^\s]+$' then raise exception 'bad_url'; end if;
    if t = 'phone' then
      v_digits := regexp_replace(v, '\D', '', 'g');
      if char_length(v_digits) not between 10 and 11 then raise exception 'bad_phone'; end if;
    end if;
    if t = 'select' and not (f -> 'options') @> to_jsonb(v) then raise exception 'bad_choice'; end if;
    v_clean := v_clean || jsonb_build_object(k, v);
  end loop;

  update public.setup_steps
     set info_response = v_clean, info_submitted_at = now(),
         status = case when status = 'waiting_on_you' then 'in_progress' else status end
   where id = s.id;

  perform private.engine_log_admin_action(v_acct, 'setup_info_received', left('The client sent: ' || s.title, 200));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------- 2. emails sent to a client about setup
create table if not exists public.setup_emails (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  step_key text,
  to_email text not null,
  subject text not null check (char_length(subject) <= 200),
  body text not null check (char_length(body) <= 6000),
  sent_by uuid,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  provider_id text,
  error text check (error is null or char_length(error) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists setup_emails_account_idx on public.setup_emails (account_id, created_at desc);
alter table public.setup_emails enable row level security;
revoke all on table public.setup_emails from anon, authenticated;
grant all on table public.setup_emails to service_role;

create or replace function public.engine_log_setup_email(
  p_account uuid, p_step_key text, p_to text, p_subject text, p_body text, p_sent_by uuid,
  p_status text, p_provider_id text, p_error text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.setup_emails (account_id, step_key, to_email, subject, body, sent_by, status, provider_id, error)
  values (p_account, p_step_key, p_to, left(p_subject, 200), left(p_body, 6000), p_sent_by,
          case when p_status = 'failed' then 'failed' else 'sent' end, p_provider_id, left(p_error, 300))
  returning id into v_id;
  return v_id;
end;
$$;

-- everything the admin's Setup tab needs in one call
create or replace function public.admin_setup_overview(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner jsonb;
begin
  perform private.require_admin_mfa();
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;

  select jsonb_build_object('email', u.email, 'name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'))
    into v_owner
    from public.profiles p join auth.users u on u.id = p.id
   where p.account_id = p_account_id
   order by u.created_at
   limit 1;

  return jsonb_build_object(
    'owner', coalesce(v_owner, jsonb_build_object('email', null, 'name', null)),
    'steps', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order)
        from (
          select s.id, s.step_key, s.title, s.description, s.status, s.note, s.sort_order, s.completed_at,
                 s.info_prompt, s.info_fields, s.info_response, s.info_submitted_at, s.action,
                 (select count(*) from public.setup_emails e where e.account_id = p_account_id and e.step_key = s.step_key and e.status = 'sent') as emails_sent,
                 (select max(e.created_at) from public.setup_emails e where e.account_id = p_account_id and e.step_key = s.step_key and e.status = 'sent') as last_email_at
            from public.setup_steps s where s.account_id = p_account_id
        ) x), '[]'::jsonb),
    'emails', coalesce((
      select jsonb_agg(to_jsonb(y) order by y.created_at desc)
        from (select e.id, e.step_key, e.to_email, e.subject, e.status, e.error, e.created_at
                from public.setup_emails e where e.account_id = p_account_id order by e.created_at desc limit 30) y), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------- 3. business details
create table if not exists public.account_business (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  legal_name text check (legal_name is null or char_length(legal_name) <= 150),
  website text check (website is null or char_length(website) <= 200),
  address1 text check (address1 is null or char_length(address1) <= 150),
  city text check (city is null or char_length(city) <= 80),
  region text check (region is null or char_length(region) <= 40),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  public_phone text check (public_phone is null or char_length(public_phone) <= 30),
  contact_name text check (contact_name is null or char_length(contact_name) <= 100),
  contact_email text check (contact_email is null or char_length(contact_email) <= 200),
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  license_number text check (license_number is null or char_length(license_number) <= 60),
  notes text check (notes is null or char_length(notes) <= 1000),
  updated_at timestamptz not null default now()
);
drop trigger if exists account_business_touch on public.account_business;
create trigger account_business_touch before update on public.account_business
  for each row execute function private.engine_touch_updated_at();
alter table public.account_business enable row level security;
revoke all on table public.account_business from anon, authenticated;
grant all on table public.account_business to service_role;

create or replace function public.admin_get_business(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform private.require_admin_mfa();
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;
  select to_jsonb(b) - 'account_id' - 'updated_at' into r from public.account_business b where b.account_id = p_account_id;
  return coalesce(r, '{}'::jsonb);
end;
$$;

create or replace function public.admin_save_business(p_account_id uuid, p_patch jsonb)
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
  insert into public.account_business (account_id) values (p_account_id) on conflict (account_id) do nothing;

  update public.account_business set
    legal_name = case when (p_patch -> 'legal_name') is not null then nullif(btrim(p_patch ->> 'legal_name'), '') else legal_name end,
    website = case when (p_patch -> 'website') is not null then nullif(btrim(p_patch ->> 'website'), '') else website end,
    address1 = case when (p_patch -> 'address1') is not null then nullif(btrim(p_patch ->> 'address1'), '') else address1 end,
    city = case when (p_patch -> 'city') is not null then nullif(btrim(p_patch ->> 'city'), '') else city end,
    region = case when (p_patch -> 'region') is not null then nullif(btrim(p_patch ->> 'region'), '') else region end,
    postal_code = case when (p_patch -> 'postal_code') is not null then nullif(btrim(p_patch ->> 'postal_code'), '') else postal_code end,
    public_phone = case when (p_patch -> 'public_phone') is not null then nullif(btrim(p_patch ->> 'public_phone'), '') else public_phone end,
    contact_name = case when (p_patch -> 'contact_name') is not null then nullif(btrim(p_patch ->> 'contact_name'), '') else contact_name end,
    contact_email = case when (p_patch -> 'contact_email') is not null then nullif(btrim(p_patch ->> 'contact_email'), '') else contact_email end,
    contact_phone = case when (p_patch -> 'contact_phone') is not null then nullif(btrim(p_patch ->> 'contact_phone'), '') else contact_phone end,
    license_number = case when (p_patch -> 'license_number') is not null then nullif(btrim(p_patch ->> 'license_number'), '') else license_number end,
    notes = case when (p_patch -> 'notes') is not null then nullif(btrim(p_patch ->> 'notes'), '') else notes end
  where account_id = p_account_id;

  select string_agg(k, ', ' order by k) into v_keys from jsonb_object_keys(p_patch) k;
  perform private.engine_log_admin_action(p_account_id, 'business_changed', left('Business info changed: ' || coalesce(v_keys, ''), 200));
  return public.admin_get_business(p_account_id);
end;
$$;

-- copy what the client sent in a setup step into the business details (only keys that match a business field)
create or replace function public.admin_apply_step_info_to_business(p_account_id uuid, p_step_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resp jsonb;
  v_patch jsonb := '{}'::jsonb;
  k text;
begin
  perform private.require_admin_mfa();
  select info_response into v_resp from public.setup_steps where account_id = p_account_id and step_key = p_step_key;
  if v_resp is null then
    raise exception 'nothing_to_apply';
  end if;
  foreach k in array array['legal_name', 'website', 'address1', 'city', 'region', 'postal_code', 'public_phone', 'contact_name', 'contact_email', 'contact_phone', 'license_number'] loop
    if (v_resp -> k) is not null then
      v_patch := v_patch || jsonb_build_object(k, v_resp ->> k);
    end if;
  end loop;
  if v_patch = '{}'::jsonb then
    raise exception 'nothing_to_apply';
  end if;
  return public.admin_save_business(p_account_id, v_patch);
end;
$$;

-- ---------------------------------------------------------------- 4. Twilio details per client
create or replace function private.engine_twilio_json(p_account uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'twilio_subaccount_sid', pc.twilio_subaccount_sid,
           'messaging_service_sid', pc.messaging_service_sid,
           'phone_number', pc.phone_number_e164,
           'phone_number_sid', pc.phone_number_sid,
           'brand_sid', pc.brand_sid,
           'campaign_sid', pc.campaign_sid,
           'forwarding_status', coalesce(pc.forwarding_status, 'not_set'),
           'has_token', (pc.auth_token_secret_id is not null),
           'registration_status', a.registration_status,
           'account_status', a.status,
           'notification_phone', a.notification_phone)
    from public.accounts a
    left join public.account_phone_config pc on pc.account_id = a.id
   where a.id = p_account;
$$;

create or replace function public.admin_get_twilio(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform private.require_admin_mfa();
  r := private.engine_twilio_json(p_account_id);
  if r is null then
    raise exception 'not_found';
  end if;
  return r;
end;
$$;

create or replace function public.admin_save_twilio(p_account_id uuid, p_patch jsonb)
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

  insert into public.account_phone_config (account_id) values (p_account_id) on conflict (account_id) do nothing;
  update public.account_phone_config set
    twilio_subaccount_sid = case when (p_patch -> 'twilio_subaccount_sid') is not null then nullif(btrim(p_patch ->> 'twilio_subaccount_sid'), '') else twilio_subaccount_sid end,
    messaging_service_sid = case when (p_patch -> 'messaging_service_sid') is not null then nullif(btrim(p_patch ->> 'messaging_service_sid'), '') else messaging_service_sid end,
    phone_number_e164 = case when (p_patch -> 'phone_number') is not null then nullif(btrim(p_patch ->> 'phone_number'), '') else phone_number_e164 end,
    phone_number_sid = case when (p_patch -> 'phone_number_sid') is not null then nullif(btrim(p_patch ->> 'phone_number_sid'), '') else phone_number_sid end,
    brand_sid = case when (p_patch -> 'brand_sid') is not null then nullif(btrim(p_patch ->> 'brand_sid'), '') else brand_sid end,
    campaign_sid = case when (p_patch -> 'campaign_sid') is not null then nullif(btrim(p_patch ->> 'campaign_sid'), '') else campaign_sid end,
    forwarding_status = case when (p_patch -> 'forwarding_status') is not null then p_patch ->> 'forwarding_status' else forwarding_status end,
    forwarding_verified_at = case
      when (p_patch -> 'forwarding_status') is not null and p_patch ->> 'forwarding_status' = 'verified' then now()
      when (p_patch -> 'forwarding_status') is not null then null
      else forwarding_verified_at end
  where account_id = p_account_id;

  if (p_patch -> 'registration_status') is not null then
    update public.accounts set registration_status = p_patch ->> 'registration_status' where id = p_account_id;
  end if;

  select string_agg(k, ', ' order by k) into v_keys from jsonb_object_keys(p_patch) k;
  perform private.engine_log_admin_action(p_account_id, 'twilio_changed', left('Twilio details changed: ' || coalesce(v_keys, ''), 200));
  return private.engine_twilio_json(p_account_id);
end;
$$;

-- stored encrypted in Vault. It is never shown again, only whether one is saved.
create or replace function public.admin_store_twilio_token(p_account_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_mfa();
  if p_token is null or p_token !~ '^[0-9a-fA-F]{32}$' then
    raise exception 'bad_token';
  end if;
  perform public.engine_store_twilio_token(p_account_id, p_token);
  perform private.engine_log_admin_action(p_account_id, 'twilio_token_stored', 'Saved the Twilio auth token (encrypted)');
  return private.engine_twilio_json(p_account_id);
end;
$$;

-- ---------------------------------------------------------------- 5. deleting a client, on purpose and with a lock
create or replace function public.admin_delete_client(p_account_id uuid, p_confirm text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_status text;
begin
  perform private.require_admin_mfa();
  select name, status into v_name, v_status from public.accounts where id = p_account_id;
  if not found then
    raise exception 'not_found';
  end if;
  if v_status <> 'cancelled' then
    raise exception 'must_cancel_first';
  end if;
  if lower(btrim(coalesce(p_confirm, ''))) <> lower(btrim(v_name)) then
    raise exception 'name_mismatch';
  end if;

  begin
    delete from public.accounts where id = p_account_id;
  exception when foreign_key_violation then
    raise exception 'has_related_data';
  end;
  return true;
end;
$$;

-- ---------------------------------------------------------------- 6. a real calendar connection
-- the refresh token lives encrypted in Vault, never in a normal column
create or replace function public.engine_store_calendar_token(p_account uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select token_secret_id into v_id from public.calendar_connections where account_id = p_account;
  if v_id is not null then
    perform vault.update_secret(v_id, p_token);
  else
    v_id := vault.create_secret(p_token, 'calendar_token_' || p_account::text, 'Calendar refresh token');
    insert into public.calendar_connections (account_id, token_secret_id) values (p_account, v_id)
    on conflict (account_id) do update set token_secret_id = excluded.token_secret_id;
  end if;
end;
$$;

create or replace function public.engine_get_calendar_token(p_account uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
    from public.calendar_connections c
    join vault.decrypted_secrets ds on ds.id = c.token_secret_id
   where c.account_id = p_account;
$$;

create or replace function public.engine_delete_calendar_token(p_account uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select token_secret_id into v_id from public.calendar_connections where account_id = p_account;
  update public.calendar_connections set token_secret_id = null where account_id = p_account;
  if v_id is not null then
    delete from vault.secrets where id = v_id;
  end if;
end;
$$;

create or replace function public.engine_calendar_connected(p_account uuid, p_provider text, p_calendar_id text, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_provider not in ('google', 'microsoft') then
    raise exception 'bad_provider';
  end if;
  insert into public.calendar_connections (account_id, provider, status, external_calendar_id, calendar_label, last_error, sync_requested_at)
  values (p_account, p_provider, 'active', nullif(btrim(p_calendar_id), ''), nullif(btrim(p_label), ''), null, now())
  on conflict (account_id) do update
    set provider = excluded.provider, status = 'active', external_calendar_id = excluded.external_calendar_id,
        calendar_label = excluded.calendar_label, last_error = null, sync_requested_at = now();
  perform private.engine_log_admin_action(p_account, 'calendar_connected', 'Connected ' || p_provider || ' calendar ' || coalesce(p_label, ''));
end;
$$;

create or replace function public.engine_calendar_failed(p_account uuid, p_status text, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.calendar_connections
     set status = case when p_status in ('needs_reauth', 'error') then p_status else 'error' end,
         last_error = left(p_error, 300)
   where account_id = p_account;
$$;

-- what the sync service needs to write one inspection to the owner's calendar
create or replace function public.engine_calendar_appointment(p_appointment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'id', a.id, 'account_id', a.account_id, 'status', a.status, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
           'address', a.address, 'external_id', a.external_id,
           'name', l.name, 'phone', coalesce(l.phone_e164, l.phone),
           'issue', ls.collected ->> 'issue',
           'timezone', acc.timezone, 'company', acc.name)
    from public.appointments a
    join public.accounts acc on acc.id = a.account_id
    left join public.leads l on l.id = a.lead_id
    left join public.lead_state ls on ls.lead_id = a.lead_id
   where a.id = p_appointment_id;
$$;

create or replace function public.engine_claim_calendar_outbox_for(p_account uuid, p_limit integer default 10)
returns setof public.calendar_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.calendar_outbox set status = 'pending', locked_at = null
   where account_id = p_account and status = 'sending' and locked_at < now() - interval '5 minutes';

  return query
  update public.calendar_outbox o
     set status = 'sending', locked_at = now(), attempts = o.attempts + 1
   where o.id in (
     select x.id from public.calendar_outbox x
      where x.account_id = p_account and x.status = 'pending' and x.run_after <= now()
      order by x.created_at
      limit greatest(1, least(p_limit, 50))
        for update skip locked
   )
  returning o.*;
end;
$$;

-- which clients are due for a sync: connected, and not synced in the last few minutes (or a sync was asked for)
create or replace function public.engine_calendar_accounts_due()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.account_id
    from public.calendar_connections c
   where c.status = 'active' and c.provider in ('google', 'microsoft') and c.token_secret_id is not null
     and (c.last_synced_at is null or c.last_synced_at < now() - interval '4 minutes'
          or (c.sync_requested_at is not null and c.sync_requested_at > coalesce(c.last_synced_at, 'epoch'::timestamptz)));
$$;

-- owners may see who their calendar is connected as
grant select (calendar_label) on public.calendar_connections to authenticated;

-- ---------------------------------------------------------------- 7. permissions
revoke all on function public.admin_set_step_request(uuid, text, text, jsonb, text) from public, anon;
revoke all on function public.owner_submit_step_info(text, jsonb) from public, anon;
revoke all on function public.admin_setup_overview(uuid) from public, anon;
revoke all on function public.admin_get_business(uuid) from public, anon;
revoke all on function public.admin_save_business(uuid, jsonb) from public, anon;
revoke all on function public.admin_apply_step_info_to_business(uuid, text) from public, anon;
revoke all on function public.admin_get_twilio(uuid) from public, anon;
revoke all on function public.admin_save_twilio(uuid, jsonb) from public, anon;
revoke all on function public.admin_store_twilio_token(uuid, text) from public, anon;
revoke all on function public.admin_delete_client(uuid, text) from public, anon;
grant execute on function public.admin_set_step_request(uuid, text, text, jsonb, text) to authenticated;
grant execute on function public.owner_submit_step_info(text, jsonb) to authenticated;
grant execute on function public.admin_setup_overview(uuid) to authenticated;
grant execute on function public.admin_get_business(uuid) to authenticated;
grant execute on function public.admin_save_business(uuid, jsonb) to authenticated;
grant execute on function public.admin_apply_step_info_to_business(uuid, text) to authenticated;
grant execute on function public.admin_get_twilio(uuid) to authenticated;
grant execute on function public.admin_save_twilio(uuid, jsonb) to authenticated;
grant execute on function public.admin_store_twilio_token(uuid, text) to authenticated;
grant execute on function public.admin_delete_client(uuid, text) to authenticated;

revoke all on function public.engine_log_setup_email(uuid, text, text, text, text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.engine_store_calendar_token(uuid, text) from public, anon, authenticated;
revoke all on function public.engine_get_calendar_token(uuid) from public, anon, authenticated;
revoke all on function public.engine_delete_calendar_token(uuid) from public, anon, authenticated;
revoke all on function public.engine_calendar_connected(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.engine_calendar_failed(uuid, text, text) from public, anon, authenticated;
revoke all on function public.engine_calendar_appointment(uuid) from public, anon, authenticated;
revoke all on function public.engine_claim_calendar_outbox_for(uuid, integer) from public, anon, authenticated;
revoke all on function public.engine_calendar_accounts_due() from public, anon, authenticated;
grant execute on function public.engine_log_setup_email(uuid, text, text, text, text, uuid, text, text, text) to service_role;
grant execute on function public.engine_store_calendar_token(uuid, text) to service_role;
grant execute on function public.engine_get_calendar_token(uuid) to service_role;
grant execute on function public.engine_delete_calendar_token(uuid) to service_role;
grant execute on function public.engine_calendar_connected(uuid, text, text, text) to service_role;
grant execute on function public.engine_calendar_failed(uuid, text, text) to service_role;
grant execute on function public.engine_calendar_appointment(uuid) to service_role;
grant execute on function public.engine_claim_calendar_outbox_for(uuid, integer) to service_role;
grant execute on function public.engine_calendar_accounts_due() to service_role;

commit;
