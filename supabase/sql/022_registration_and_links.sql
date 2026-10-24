-- ============================================================================
-- Business registration form, and links on setup steps (run in the DASHBOARD project, after 020)
--   The carriers need the business's EIN and details before a texting number can be registered.
--   The client fills in ONE form. The EIN is stored encrypted (Vault), shown to admins only as the last 4 digits,
--   and revealing it is a deliberate, logged action.
--   A setup step can also carry a link ("Open the form").
-- DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

-- ---------------------------------------------------------------- 1. links, and the registration action, on setup steps
alter table public.setup_steps
  add column if not exists info_link text,
  add column if not exists info_link_label text;

alter table public.setup_steps drop constraint if exists setup_steps_info_link_check;
alter table public.setup_steps add constraint setup_steps_info_link_check
  check (info_link is null or (char_length(info_link) <= 500 and info_link ~* '^https://[^[:space:]]+$'));
alter table public.setup_steps drop constraint if exists setup_steps_info_link_label_check;
alter table public.setup_steps add constraint setup_steps_info_link_label_check
  check (info_link_label is null or char_length(info_link_label) <= 60);

-- the action list gains "registration_form"
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.setup_steps'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%connect_calendar%'
  loop
    execute format('alter table public.setup_steps drop constraint %I', c.conname);
  end loop;
end
$$;
alter table public.setup_steps add constraint setup_steps_action_check
  check (action is null or action in ('connect_calendar', 'registration_form'));

-- ---------------------------------------------------------------- 2. the registration details
create table if not exists public.account_registration (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  business_type text check (business_type in ('llc', 'corporation', 'partnership', 'sole_proprietor', 'nonprofit', 'other')),
  legal_name text check (char_length(legal_name) <= 150),
  dba text check (char_length(dba) <= 150),
  has_ein boolean not null default true,
  ein_secret_id uuid,
  ein_last4 text check (ein_last4 is null or ein_last4 ~ '^[0-9]{4}$'),
  address1 text check (char_length(address1) <= 150),
  address2 text check (char_length(address2) <= 150),
  city text check (char_length(city) <= 80),
  region text check (char_length(region) <= 40),
  postal_code text check (char_length(postal_code) <= 20),
  country text not null default 'US' check (country in ('US', 'CA')),
  website text check (char_length(website) <= 200),
  contact_name text check (char_length(contact_name) <= 100),
  contact_title text check (char_length(contact_title) <= 80),
  contact_email text check (char_length(contact_email) <= 200),
  contact_phone text check (char_length(contact_phone) <= 30),
  authorized boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'needs_changes', 'ready', 'sent_to_twilio')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  admin_notes text check (char_length(admin_notes) <= 1000),
  updated_at timestamptz not null default now()
);
drop trigger if exists account_registration_touch on public.account_registration;
create trigger account_registration_touch before update on public.account_registration
  for each row execute function private.engine_touch_updated_at();
alter table public.account_registration enable row level security;
revoke all on table public.account_registration from anon, authenticated;
grant all on table public.account_registration to service_role;

-- the EIN itself: encrypted in Vault, never in a normal column
create or replace function private.engine_store_ein(p_account uuid, p_ein text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select ein_secret_id into v_id from public.account_registration where account_id = p_account;
  if v_id is not null then
    perform vault.update_secret(v_id, p_ein);
    return v_id;
  end if;
  return vault.create_secret(p_ein, 'ein_' || p_account::text, 'Business EIN');
end;
$$;

create or replace function private.engine_read_ein(p_account uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
    from public.account_registration r
    join vault.decrypted_secrets ds on ds.id = r.ein_secret_id
   where r.account_id = p_account;
$$;

-- shared fields flow into the business details so nothing is typed twice
create or replace function private.engine_merge_business(p_account uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.account_business (account_id) values (p_account) on conflict (account_id) do nothing;
  update public.account_business set
    legal_name = coalesce(nullif(btrim(p_patch ->> 'legal_name'), ''), legal_name),
    website = coalesce(nullif(btrim(p_patch ->> 'website'), ''), website),
    address1 = coalesce(nullif(btrim(p_patch ->> 'address1'), ''), address1),
    city = coalesce(nullif(btrim(p_patch ->> 'city'), ''), city),
    region = coalesce(nullif(btrim(p_patch ->> 'region'), ''), region),
    postal_code = coalesce(nullif(btrim(p_patch ->> 'postal_code'), ''), postal_code),
    contact_name = coalesce(nullif(btrim(p_patch ->> 'contact_name'), ''), contact_name),
    contact_email = coalesce(nullif(btrim(p_patch ->> 'contact_email'), ''), contact_email),
    contact_phone = coalesce(nullif(btrim(p_patch ->> 'contact_phone'), ''), contact_phone)
  where account_id = p_account;
end;
$$;

-- what an owner may see of their own submission: never the EIN, only the last 4
create or replace function public.owner_get_registration()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct uuid := private.current_account_id();
  r public.account_registration%rowtype;
begin
  if v_acct is null then
    raise exception 'not_signed_in';
  end if;
  select * into r from public.account_registration where account_id = v_acct;
  if not found then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'business_type', r.business_type, 'legal_name', r.legal_name, 'dba', r.dba, 'has_ein', r.has_ein, 'ein_last4', r.ein_last4,
    'address1', r.address1, 'address2', r.address2, 'city', r.city, 'region', r.region, 'postal_code', r.postal_code, 'country', r.country,
    'website', r.website, 'contact_name', r.contact_name, 'contact_title', r.contact_title, 'contact_email', r.contact_email,
    'contact_phone', r.contact_phone, 'authorized', r.authorized, 'status', r.status, 'submitted_at', r.submitted_at,
    'note', case when r.status = 'needs_changes' then r.admin_notes end);
end;
$$;

create or replace function public.owner_submit_registration(p_data jsonb, p_ein text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_acct uuid := private.current_account_id();
  r public.account_registration%rowtype;
  v_type text;
  v_has_ein boolean;
  v_digits text := regexp_replace(coalesce(p_ein, ''), '\D', '', 'g');
  v_phone text;
  v_web text;
  v_country text;
  v_secret uuid;
  v_existing boolean;
begin
  if v_acct is null then
    raise exception 'not_signed_in';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'bad_data';
  end if;

  select * into r from public.account_registration where account_id = v_acct;
  v_existing := found;
  if v_existing and r.status in ('ready', 'sent_to_twilio') then
    raise exception 'locked';
  end if;

  v_type := nullif(btrim(p_data ->> 'business_type'), '');
  if v_type is null or v_type not in ('llc', 'corporation', 'partnership', 'sole_proprietor', 'nonprofit', 'other') then
    raise exception 'bad_business_type';
  end if;
  if nullif(btrim(p_data ->> 'legal_name'), '') is null then raise exception 'missing_legal_name'; end if;
  if nullif(btrim(p_data ->> 'address1'), '') is null or nullif(btrim(p_data ->> 'city'), '') is null
     or nullif(btrim(p_data ->> 'region'), '') is null or nullif(btrim(p_data ->> 'postal_code'), '') is null then
    raise exception 'missing_address';
  end if;
  if nullif(btrim(p_data ->> 'contact_name'), '') is null then raise exception 'missing_contact'; end if;
  if coalesce(p_data ->> 'contact_email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  v_phone := regexp_replace(coalesce(p_data ->> 'contact_phone', ''), '\D', '', 'g');
  if char_length(v_phone) not between 10 and 11 then raise exception 'bad_phone'; end if;
  v_web := nullif(btrim(p_data ->> 'website'), '');
  if v_web is not null and v_web !~* '^https?://[^[:space:]]+$' then raise exception 'bad_url'; end if;
  v_country := coalesce(nullif(btrim(p_data ->> 'country'), ''), 'US');
  if v_country not in ('US', 'CA') then raise exception 'bad_country'; end if;
  if not coalesce((p_data ->> 'authorized')::boolean, false) then raise exception 'not_authorized'; end if;

  -- a business with an EIN is registered as a standard business. One without is registered as a sole proprietor.
  v_has_ein := coalesce((p_data ->> 'has_ein')::boolean, true);
  if v_has_ein then
    if v_digits = '' and v_existing and r.ein_secret_id is not null then
      null; -- they are updating other details and keeping the EIN already saved
    elsif char_length(v_digits) <> 9 then
      raise exception 'bad_ein';
    end if;
  elsif v_type <> 'sole_proprietor' then
    raise exception 'ein_required';
  end if;

  insert into public.account_registration (account_id) values (v_acct) on conflict (account_id) do nothing;

  if v_has_ein and char_length(v_digits) = 9 then
    v_secret := private.engine_store_ein(v_acct, v_digits);
  end if;

  update public.account_registration set
    business_type = v_type,
    legal_name = btrim(p_data ->> 'legal_name'),
    dba = nullif(btrim(p_data ->> 'dba'), ''),
    has_ein = v_has_ein,
    ein_secret_id = case when v_has_ein then coalesce(v_secret, ein_secret_id) else null end,
    ein_last4 = case when v_has_ein and char_length(v_digits) = 9 then right(v_digits, 4) when v_has_ein then ein_last4 else null end,
    address1 = btrim(p_data ->> 'address1'),
    address2 = nullif(btrim(p_data ->> 'address2'), ''),
    city = btrim(p_data ->> 'city'),
    region = btrim(p_data ->> 'region'),
    postal_code = btrim(p_data ->> 'postal_code'),
    country = v_country,
    website = v_web,
    contact_name = btrim(p_data ->> 'contact_name'),
    contact_title = nullif(btrim(p_data ->> 'contact_title'), ''),
    contact_email = btrim(p_data ->> 'contact_email'),
    contact_phone = btrim(p_data ->> 'contact_phone'),
    authorized = true,
    status = 'submitted',
    submitted_at = now(),
    admin_notes = null
  where account_id = v_acct;

  -- an EIN that is no longer needed is deleted from the vault
  if not v_has_ein and r.ein_secret_id is not null then
    delete from vault.secrets where id = r.ein_secret_id;
  end if;

  perform private.engine_merge_business(v_acct, p_data);

  update public.setup_steps
     set info_submitted_at = now(), status = case when status = 'waiting_on_you' then 'in_progress' else status end
   where account_id = v_acct and action = 'registration_form';

  perform private.engine_log_admin_action(v_acct, 'registration_submitted', 'The client sent their business registration details');
  return jsonb_build_object('ok', true, 'path', case when v_has_ein then 'standard' else 'sole_proprietor' end);
end;
$$;

-- the admin's view: everything except the EIN, which is masked
create or replace function public.admin_get_registration(p_account_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.account_registration%rowtype;
begin
  perform private.require_admin_mfa();
  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found';
  end if;
  select * into r from public.account_registration where account_id = p_account_id;
  if not found then
    return jsonb_build_object('status', 'not_started');
  end if;
  return jsonb_build_object(
    'status', r.status, 'path', case when r.has_ein then 'standard' else 'sole_proprietor' end,
    'business_type', r.business_type, 'legal_name', r.legal_name, 'dba', r.dba, 'has_ein', r.has_ein, 'ein_last4', r.ein_last4,
    'address1', r.address1, 'address2', r.address2, 'city', r.city, 'region', r.region, 'postal_code', r.postal_code, 'country', r.country,
    'website', r.website, 'contact_name', r.contact_name, 'contact_title', r.contact_title, 'contact_email', r.contact_email,
    'contact_phone', r.contact_phone, 'submitted_at', r.submitted_at, 'reviewed_at', r.reviewed_at, 'admin_notes', r.admin_notes);
end;
$$;

-- showing the full EIN is its own action, and it is written to the activity log every time
create or replace function public.admin_reveal_ein(p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ein text;
begin
  perform private.require_admin_mfa();
  v_ein := private.engine_read_ein(p_account_id);
  if v_ein is null then
    raise exception 'no_ein';
  end if;
  perform private.engine_log_admin_action(p_account_id, 'ein_revealed', 'Showed the EIN on screen');
  return substr(v_ein, 1, 2) || '-' || substr(v_ein, 3);
end;
$$;

create or replace function public.admin_set_registration_status(p_account_id uuid, p_status text, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin_mfa();
  if p_status not in ('submitted', 'needs_changes', 'ready', 'sent_to_twilio') then
    raise exception 'bad_status';
  end if;
  if p_status = 'needs_changes' and nullif(btrim(coalesce(p_notes, '')), '') is null then
    raise exception 'notes_required';
  end if;

  update public.account_registration
     set status = p_status, reviewed_at = now(), admin_notes = nullif(btrim(coalesce(p_notes, '')), '')
   where account_id = p_account_id and submitted_at is not null;
  if not found then
    raise exception 'not_submitted';
  end if;

  if p_status = 'needs_changes' then
    update public.setup_steps set status = 'waiting_on_you', note = left(btrim(p_notes), 300)
     where account_id = p_account_id and action = 'registration_form' and status <> 'done';
  end if;

  perform private.engine_log_admin_action(p_account_id, 'registration_reviewed', 'Registration marked: ' || p_status);
  return public.admin_get_registration(p_account_id);
end;
$$;

-- ---------------------------------------------------------------- 3. steps: a link and the new action
drop function if exists public.admin_set_step_request(uuid, text, text, jsonb, text);

create or replace function public.admin_set_step_request(
  p_account_id uuid, p_step_key text, p_prompt text, p_fields jsonb, p_action text default null,
  p_link text default null, p_link_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_link text := nullif(btrim(coalesce(p_link, '')), '');
begin
  perform private.require_admin_mfa();
  if not private.engine_valid_info_fields(coalesce(p_fields, '[]'::jsonb)) then
    raise exception 'bad_fields';
  end if;
  if p_action is not null and p_action not in ('connect_calendar', 'registration_form') then
    raise exception 'bad_action';
  end if;
  if v_link is not null and (char_length(v_link) > 500 or v_link !~* '^https://[^[:space:]]+$') then
    raise exception 'bad_link';
  end if;

  update public.setup_steps
     set info_prompt = nullif(btrim(p_prompt), ''),
         info_fields = coalesce(p_fields, '[]'::jsonb),
         action = p_action,
         info_link = v_link,
         info_link_label = case when v_link is null then null else nullif(left(btrim(coalesce(p_link_label, '')), 60), '') end
   where account_id = p_account_id and step_key = p_step_key
  returning to_jsonb(setup_steps.*) into v_row;
  if v_row is null then
    raise exception 'not_found';
  end if;

  perform private.engine_log_admin_action(p_account_id, 'setup_request_changed', left('Changed what is asked for in: ' || (v_row ->> 'title'), 200));
  return v_row;
end;
$$;

-- the Setup tab also shows each step's link, and where the registration stands
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
    'registration', (select jsonb_build_object('status', r.status, 'submitted_at', r.submitted_at) from public.account_registration r where r.account_id = p_account_id),
    'steps', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.sort_order)
        from (
          select s.id, s.step_key, s.title, s.description, s.status, s.note, s.sort_order, s.completed_at,
                 s.info_prompt, s.info_fields, s.info_response, s.info_submitted_at, s.action, s.info_link, s.info_link_label,
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

-- ---------------------------------------------------------------- 4. permissions
revoke all on function public.owner_get_registration() from public, anon;
revoke all on function public.owner_submit_registration(jsonb, text) from public, anon;
revoke all on function public.admin_get_registration(uuid) from public, anon;
revoke all on function public.admin_reveal_ein(uuid) from public, anon;
revoke all on function public.admin_set_registration_status(uuid, text, text) from public, anon;
revoke all on function public.admin_set_step_request(uuid, text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.owner_get_registration() to authenticated;
grant execute on function public.owner_submit_registration(jsonb, text) to authenticated;
grant execute on function public.admin_get_registration(uuid) to authenticated;
grant execute on function public.admin_reveal_ein(uuid) to authenticated;
grant execute on function public.admin_set_registration_status(uuid, text, text) to authenticated;
grant execute on function public.admin_set_step_request(uuid, text, text, jsonb, text, text, text) to authenticated;

commit;
