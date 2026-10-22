-- ============================================================================
-- What the dashboard screens call (run in the DASHBOARD Supabase project, after 011)
--   Owner actions: who is this caller, import a customer list, "book existing customers"
--   Admin actions: engine status and the kill switch (admins signed in with their authenticator code only)
-- Each function checks who is calling, so the browser can use them safely.
-- DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

-- Is this registration status an approved one? One place to adjust if your statuses are named differently.
create or replace function private.engine_registration_ok(p_status text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(lower(p_status), '') in ('approved', 'registered', 'active', 'live', 'complete', 'completed', 'done');
$$;

-- the gate every outgoing text goes through (replaces the version from 001: same rules, tolerant status check)
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
         )
     and not exists (
           select 1
             from public.account_opt_outs o
            where o.account_id = p_account and o.phone_e164 = p_phone and o.released_at is null
         );
$$;
revoke all on function public.engine_can_text(uuid, text) from public, anon, authenticated;
grant execute on function public.engine_can_text(uuid, text) to service_role;

-- ---------------------------------------------------------------- owner actions
-- set who a phone number is (also creates or updates the contact). Leads from that number follow.
create or replace function public.owner_set_contact(
  p_phone text, p_type text, p_name text default null, p_company text default null,
  p_address text default null, p_last_job text default null, p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct uuid := private.current_account_id();
begin
  if v_acct is null then
    raise exception 'not_signed_in';
  end if;
  if p_type is null or p_type not in ('homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other') then
    raise exception 'bad_type';
  end if;
  if p_phone is null or p_phone !~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$' then
    raise exception 'bad_phone';
  end if;

  insert into public.contacts (account_id, phone_e164, contact_type, name, company, address, last_job, notes, auto_reply, source, needs_review)
  values (v_acct, p_phone, p_type,
          nullif(left(btrim(p_name), 100), ''), nullif(left(btrim(p_company), 100), ''),
          nullif(left(btrim(p_address), 200), ''), nullif(left(btrim(p_last_job), 200), ''),
          nullif(left(btrim(p_notes), 500), ''),
          private.engine_default_auto_reply(p_type), 'owner', false)
  on conflict (account_id, phone_e164) do update
    set contact_type = excluded.contact_type,
        name = coalesce(excluded.name, public.contacts.name),
        company = coalesce(excluded.company, public.contacts.company),
        address = coalesce(excluded.address, public.contacts.address),
        last_job = coalesce(excluded.last_job, public.contacts.last_job),
        notes = coalesce(excluded.notes, public.contacts.notes),
        auto_reply = excluded.auto_reply,
        source = 'owner',
        needs_review = false;

  -- only leads whose type really changes are touched, and each change is logged
  insert into public.lead_events (account_id, lead_id, event_type, detail, actor)
  select l.account_id, l.id, 'contact_classified', p_type || ' (owner)', 'owner'
    from public.leads l
   where l.account_id = v_acct and l.phone_e164 = p_phone and l.contact_type <> p_type;

  if p_type in ('supplier', 'crew', 'other') then
    update public.leads
       set status = 'not_a_lead', status_changed_by = 'owner', status_changed_at = now(), updated_at = now()
     where account_id = v_acct and phone_e164 = p_phone and contact_type <> p_type and status in ('following_up', 'needs_you');
  else
    update public.leads
       set status = 'following_up', status_changed_by = 'owner', status_changed_at = now(), updated_at = now()
     where account_id = v_acct and phone_e164 = p_phone and contact_type <> p_type and status = 'not_a_lead';
  end if;

  update public.leads set contact_type = p_type, updated_at = now()
   where account_id = v_acct and phone_e164 = p_phone and contact_type <> p_type;

  return jsonb_build_object('ok', true);
end;
$$;

-- the one-tap "Who is this?" on a lead
create or replace function public.owner_set_lead_type(p_lead_id uuid, p_type text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct uuid := private.current_account_id();
  v_phone text;
  v_old text;
begin
  if v_acct is null then
    raise exception 'not_signed_in';
  end if;

  select phone_e164, contact_type into v_phone, v_old
    from public.leads where id = p_lead_id and account_id = v_acct;
  if not found then
    raise exception 'lead_not_found';
  end if;

  if v_phone is not null then
    return public.owner_set_contact(v_phone, p_type);
  end if;

  -- an older lead with no normalised number: change just this lead
  if p_type is null or p_type not in ('homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other') then
    raise exception 'bad_type';
  end if;
  if v_old <> p_type then
    insert into public.lead_events (account_id, lead_id, event_type, detail, actor)
    values (v_acct, p_lead_id, 'contact_classified', p_type || ' (owner)', 'owner');
    update public.leads
       set contact_type = p_type, updated_at = now(),
           status = case
                      when p_type in ('supplier', 'crew', 'other') and status in ('following_up', 'needs_you') then 'not_a_lead'
                      when p_type not in ('supplier', 'crew', 'other') and status = 'not_a_lead' then 'following_up'
                      else status
                    end
     where id = p_lead_id and account_id = v_acct;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.owner_set_book_existing(p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct uuid := private.current_account_id();
begin
  if v_acct is null then
    raise exception 'not_signed_in';
  end if;
  insert into public.account_engine_settings (account_id, book_existing_customers)
  values (v_acct, coalesce(p_value, false))
  on conflict (account_id) do update set book_existing_customers = excluded.book_existing_customers;
end;
$$;

-- [{"phone":"+12145550101","name":"...","address":"...","last_job":"..."}], at most 2000 rows
create or replace function public.owner_import_contacts(p_rows jsonb, p_type text default 'past_client')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct uuid := private.current_account_id();
begin
  if v_acct is null then
    raise exception 'not_signed_in';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_must_be_array';
  end if;
  if jsonb_array_length(p_rows) > 2000 then
    raise exception 'too_many_rows';
  end if;
  return public.engine_import_contacts(v_acct, p_rows, p_type);
end;
$$;

-- ---------------------------------------------------------------- admin actions
create or replace function private.require_admin_mfa()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.admins where user_id = auth.uid()) then
    raise exception 'forbidden';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'mfa_required';
  end if;
end;
$$;

-- best effort: writes to the admin activity log using whichever columns it has. Never blocks the action.
create or replace function private.engine_log_admin_action(p_account uuid, p_action text, p_detail text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cols text[];
  v_names text[];
  v_vals text[];
  v_admin text;
begin
  select array_agg(column_name::text) into v_cols
    from information_schema.columns where table_schema = 'public' and table_name = 'admin_audit_log';
  if v_cols is null or not ('action' = any (v_cols)) then
    return;
  end if;

  v_names := array['action'];
  v_vals := array[quote_nullable(p_action)];
  if 'account_id' = any (v_cols) then
    v_names := array_append(v_names, 'account_id');
    v_vals := array_append(v_vals, quote_nullable(p_account::text));
  end if;
  if 'detail' = any (v_cols) then
    v_names := array_append(v_names, 'detail');
    v_vals := array_append(v_vals, quote_nullable(p_detail));
  end if;
  v_admin := case
               when 'admin_user_id' = any (v_cols) then 'admin_user_id'
               when 'admin_id' = any (v_cols) then 'admin_id'
               when 'actor_id' = any (v_cols) then 'actor_id'
               when 'user_id' = any (v_cols) then 'user_id'
             end;
  if v_admin is not null then
    v_names := array_append(v_names, v_admin);
    v_vals := array_append(v_vals, quote_nullable(auth.uid()::text));
  end if;

  begin
    execute format('insert into public.admin_audit_log (%s) values (%s)', array_to_string(v_names, ', '), array_to_string(v_vals, ', '));
  exception when others then
    null;
  end;
end;
$$;

create or replace function public.admin_engine_status(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  perform private.require_admin_mfa();

  select jsonb_build_object(
           'engine_enabled', coalesce(s.engine_enabled, false),
           'book_existing_customers', coalesce(s.book_existing_customers, false),
           'phone_number', pc.phone_number_e164,
           'forwarding_status', coalesce(pc.forwarding_status, 'not_set'),
           'twilio_ready', (pc.twilio_subaccount_sid is not null and pc.messaging_service_sid is not null
                            and pc.auth_token_secret_id is not null and pc.phone_number_e164 is not null),
           'registration_status', a.registration_status,
           'account_status', a.status,
           'storm_mode', w.storm_mode,
           'weather_fetched_at', w.fetched_at,
           'weather_error', w.last_error,
           'has_coordinates', (a.service_lat is not null and a.service_lon is not null),
           'pending_events', (select count(*) from public.inbox i where i.account_id = a.id and i.status in ('pending', 'processing')),
           'failed_events', (select count(*) from public.inbox i
                              where i.account_id = a.id and i.status = 'failed' and i.received_at > now() - interval '24 hours')
         )
    into r
    from public.accounts a
    left join public.account_engine_settings s on s.account_id = a.id
    left join public.account_phone_config pc on pc.account_id = a.id
    left join public.account_weather w on w.account_id = a.id
   where a.id = p_account_id;

  if r is null then
    raise exception 'not_found';
  end if;
  return r;
end;
$$;

-- the kill switch. Turning ON needs everything in place. Turning OFF always works.
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

  perform private.engine_log_admin_action(
    p_account_id, case when p_enabled then 'engine_on' else 'engine_off' end,
    case when p_enabled then 'Turned the texting engine on' else 'Turned the texting engine off' end);

  return public.admin_engine_status(p_account_id);
end;
$$;

-- the browser can call these. Each one checks who is calling.
revoke all on function public.owner_set_contact(text, text, text, text, text, text, text) from public, anon;
revoke all on function public.owner_set_lead_type(uuid, text) from public, anon;
revoke all on function public.owner_set_book_existing(boolean) from public, anon;
revoke all on function public.owner_import_contacts(jsonb, text) from public, anon;
revoke all on function public.admin_engine_status(uuid) from public, anon;
revoke all on function public.admin_set_engine_enabled(uuid, boolean) from public, anon;
grant execute on function public.owner_set_contact(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.owner_set_lead_type(uuid, text) to authenticated;
grant execute on function public.owner_set_book_existing(boolean) to authenticated;
grant execute on function public.owner_import_contacts(jsonb, text) to authenticated;
grant execute on function public.admin_engine_status(uuid) to authenticated;
grant execute on function public.admin_set_engine_enabled(uuid, boolean) to authenticated;

commit;
