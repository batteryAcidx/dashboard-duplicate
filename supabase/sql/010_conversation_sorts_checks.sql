-- ============================================================================
-- Checks for 009. Run each block on its own, in the DASHBOARD project, clearing the editor each time.
-- Every result line should start with PASS. Nothing is saved: each test undoes its own changes.
-- ============================================================================

-- ---------------------------------------------------------------- Block 1: new callers start unsorted, and sorting is recorded
create or replace function pg_temp.engine_check_sorting()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  l1 uuid;
  l2 uuid;
  changed boolean;
begin
  begin
    l1 := public.engine_get_or_create_lead(acct, '+12145550401', now());
    if (select contact_type from public.leads where id = l1) <> 'unknown' then raise exception 'a new caller should start as unknown'; end if;
    r := array_append(r, 'PASS: a new caller starts as unsorted');

    changed := public.engine_set_lead_type(acct, l1, 'homeowner');
    if not changed or (select contact_type from public.leads where id = l1) <> 'homeowner' then raise exception 'sorting as homeowner failed'; end if;
    if exists (select 1 from public.contacts where account_id = acct and phone_e164 = '+12145550401') then
      raise exception 'sorting a homeowner should not create a contact row';
    end if;
    r := array_append(r, 'PASS: the conversation can sort a caller as a homeowner, without cluttering the contact list');

    if public.engine_set_lead_type(acct, l1, 'homeowner') then raise exception 'repeating the same sort should change nothing'; end if;
    r := array_append(r, 'PASS: repeating a sort is harmless');

    changed := public.engine_set_lead_type(acct, l1, 'supplier');
    if not changed or (select contact_type from public.leads where id = l1) <> 'supplier' then raise exception 'sorting as supplier failed'; end if;
    if not exists (select 1 from public.lead_events where lead_id = l1 and event_type = 'contact_classified') then raise exception 'no event logged'; end if;
    r := array_append(r, 'PASS: a sort is logged');

    perform public.engine_import_contacts(acct, '[{"phone":"+12145550402","name":"Dana Ruiz"}]'::jsonb, 'past_client');
    l2 := public.engine_get_or_create_lead(acct, '+12145550402', now());
    if (select contact_type from public.leads where id = l2) <> 'past_client' then raise exception 'imported contact type not applied'; end if;
    if public.engine_set_lead_type(acct, l2, 'supplier', 'engine') then raise exception 'the engine overrode an imported classification'; end if;
    if not public.engine_set_lead_type(acct, l2, 'recurring_client', 'owner') then raise exception 'the owner should be able to change it'; end if;
    r := array_append(r, 'PASS: the engine never overrides the owner or an import, and the owner always can');

    if (select book_existing_customers from public.account_engine_settings where account_id = acct) then
      raise exception 'book_existing_customers should be off by default';
    end if;
    r := array_append(r, 'PASS: existing customers are not booked unless the owner opts in');

    if public.engine_returning_caller(acct, '+12145550402') ->> 'contact_type' <> 'recurring_client' then
      raise exception 'caller memory does not report the type';
    end if;
    r := array_append(r, 'PASS: caller memory reports the type');

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_sorting();
-- expected: 7 lines, all PASS


-- ---------------------------------------------------------------- Block 2: sorting buckets for the dashboard
select contact_type, urgency_rank, count(*) as leads
from public.leads
group by 1, 2
order by 2, 1;
-- expected: runs without error. This is the query behind the dashboard's filter tabs
-- (Unsorted, Homeowners, Past clients, Recurring, Suppliers), sorted emergencies first.


-- ---------------------------------------------------------------- Block 3: permissions
create or replace function pg_temp.engine_check_permissions_4()
returns setof text
language plpgsql
as $$
declare
  r text[] := '{}';
begin
  begin
    set local role authenticated;
    perform public.engine_set_lead_type('a1111111-1111-4111-8111-111111111111', gen_random_uuid(), 'supplier');
    r := array_append(r, 'FAIL: a logged-in client can call engine_set_lead_type');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: a logged-in client cannot call engine_set_lead_type');
  end;
  reset role;

  begin
    set local role anon;
    perform public.engine_set_lead_type('a1111111-1111-4111-8111-111111111111', gen_random_uuid(), 'supplier');
    r := array_append(r, 'FAIL: the public key can call engine_set_lead_type');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: the public key cannot call engine_set_lead_type');
  end;
  reset role;

  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_permissions_4();
-- expected: 2 lines, all PASS
