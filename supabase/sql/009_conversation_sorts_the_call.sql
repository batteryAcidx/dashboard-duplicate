-- ============================================================================
-- The conversation sorts the call (run in the DASHBOARD Supabase project, after 007)
--   - new callers start as 'unknown' until the conversation sorts them (the dashboard shows "Unsorted")
--   - a per-account setting: book existing customers (OFF by default, so existing customers are flagged, not booked)
--   - a function to record the sorting result on the lead
-- Additive. DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

alter table public.contacts drop constraint if exists contacts_contact_type_check;
alter table public.contacts add constraint contacts_contact_type_check check (
  contact_type in ('unknown', 'homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other')
);

alter table public.leads drop constraint if exists leads_contact_type_check;
alter table public.leads add constraint leads_contact_type_check check (
  contact_type in ('unknown', 'homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other')
);
alter table public.leads alter column contact_type set default 'unknown';

-- "Your calendar stays full of real jobs": existing customers are flagged for the owner unless the owner opts in
alter table public.account_engine_settings
  add column if not exists book_existing_customers boolean not null default false;

-- record what the conversation decided about this caller. Never overrides an owner or import classification.
create or replace function public.engine_set_lead_type(p_account uuid, p_lead uuid, p_type text, p_source text default 'engine')
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text;
  v_owner_set boolean;
  v_old text;
begin
  if p_type not in ('unknown', 'homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other') then
    raise exception 'bad_type';
  end if;

  select phone_e164, contact_type into v_phone, v_old from public.leads where id = p_lead and account_id = p_account;
  if not found then
    raise exception 'lead_not_found';
  end if;

  select exists (
           select 1 from public.contacts c
            where c.account_id = p_account and c.phone_e164 = v_phone and c.source in ('owner', 'import')
         ) into v_owner_set;
  if v_owner_set and p_source = 'engine' then
    return false;
  end if;
  if v_old = p_type then
    return false;
  end if;

  update public.leads set contact_type = p_type, updated_at = now() where id = p_lead and account_id = p_account;
  if p_source = 'owner' then
    update public.contacts
       set contact_type = p_type, auto_reply = private.engine_default_auto_reply(p_type), source = 'owner', needs_review = false
     where account_id = p_account and phone_e164 = v_phone;
  end if;
  insert into public.lead_events (account_id, lead_id, event_type, detail, actor)
  values (p_account, p_lead, 'contact_classified', p_type || ' (' || p_source || ')',
          case when p_source = 'engine' then 'system' else 'owner' end);
  return true;
end;
$$;

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
            case when v_has then c.contact_type else 'unknown' end,
            case when v_has then c.name end,
            case when v_has then c.address end)
    returning id into v_id;
  elsif p_missed_at is not null then
    update public.leads set missed_call_at = coalesce(missed_call_at, p_missed_at) where id = v_id;
  end if;

  return v_id;
end;
$$;

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

  select l2.name as name, l2.address as address, l2.status as status, l2.created_at as created_at, l2.contact_type as contact_type,
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
    'contact_type', case when v_has_c then c.contact_type else coalesce(l.contact_type, 'unknown') end,
    'days_ago', case when v_has_l then greatest(0, floor(extract(epoch from (now() - l.created_at)) / 86400))::integer end
  );
end;
$$;

revoke all on function public.engine_set_lead_type(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.engine_get_or_create_lead(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.engine_returning_caller(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.engine_set_lead_type(uuid, uuid, text, text) to service_role;
grant execute on function public.engine_get_or_create_lead(uuid, text, timestamptz) to service_role;
grant execute on function public.engine_returning_caller(uuid, text, uuid) to service_role;

commit;
