-- ============================================================================
-- Checks for 003. Run each block on its own, in the DASHBOARD project, clearing the editor each time.
-- Every result line should start with PASS. Nothing is saved: each test undoes its own changes.
-- ============================================================================

-- ---------------------------------------------------------------- Block 1: urgency columns and sorting
select column_name, data_type, is_generated
from information_schema.columns
where table_schema = 'public' and table_name = 'leads' and column_name in ('urgency', 'urgency_reason', 'urgency_rank')
order by column_name;
-- expected: 3 rows. urgency_rank shows is_generated = ALWAYS

select urgency, urgency_rank, count(*) as leads
from public.leads group by 1, 2 order by 2;
-- expected: your seeded priority lead(s) show as urgent (rank 1), the rest normal (rank 2)


-- ---------------------------------------------------------------- Block 2: urgency only ever goes up, and is logged
create or replace function pg_temp.engine_check_urgency()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  l uuid;
  changed boolean;
begin
  begin
    l := public.engine_get_or_create_lead(acct, '+12145550177', now());
    if (select urgency from public.leads where id = l) <> 'normal' then raise exception 'a new lead should start normal'; end if;
    r := array_append(r, 'PASS: new leads start as normal');

    changed := public.engine_set_urgency(acct, l, 'urgent', 'Storm damage');
    if not changed then raise exception 'normal to urgent did not change'; end if;
    if (select urgency_rank from public.leads where id = l) <> 1 then raise exception 'rank is wrong for urgent'; end if;
    if not (select priority from public.leads where id = l) then raise exception 'priority flag was not set for an urgent lead'; end if;
    r := array_append(r, 'PASS: urgent sets rank 1 and the priority flag');

    changed := public.engine_set_urgency(acct, l, 'emergency', 'Active leak right now');
    if not changed or (select urgency_rank from public.leads where id = l) <> 0 then raise exception 'urgent to emergency failed'; end if;
    r := array_append(r, 'PASS: emergency sets rank 0');

    changed := public.engine_set_urgency(acct, l, 'normal', 'should be ignored');
    if changed or (select urgency from public.leads where id = l) <> 'emergency' then raise exception 'urgency was lowered'; end if;
    r := array_append(r, 'PASS: the engine can never lower urgency');

    if (select count(*) from public.lead_events where lead_id = l and event_type = 'urgency_changed') <> 2 then
      raise exception 'expected exactly 2 urgency_changed events';
    end if;
    r := array_append(r, 'PASS: each change is logged once');

    if (select id from public.leads where account_id = acct order by urgency_rank asc, created_at desc limit 1) <> l then
      raise exception 'the emergency lead is not first when sorted';
    end if;
    r := array_append(r, 'PASS: sorting by urgency_rank puts the emergency first');

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_urgency();
-- expected: 6 lines, all PASS


-- ---------------------------------------------------------------- Block 3: weather storage and targets
create or replace function pg_temp.engine_check_weather()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  n integer;
begin
  begin
    update public.accounts set service_lat = 32.77670, service_lon = -96.79700 where id = acct;
    select count(*) into n from public.engine_weather_targets() where account_id = acct;
    if n <> 1 then raise exception 'the account with coordinates is not a weather target'; end if;
    r := array_append(r, 'PASS: accounts with coordinates are weather targets');

    perform public.engine_save_weather(acct, '[{"id":"a1","event":"Severe Thunderstorm Warning"}]'::jsonb, '[]'::jsonb, true,
                                       '["A Severe Thunderstorm Warning is in effect for the area."]'::jsonb);
    if not (select storm_mode from public.account_weather where account_id = acct) then raise exception 'storm_mode was not saved'; end if;
    perform public.engine_save_weather(acct, '[]'::jsonb, '[]'::jsonb, false, '[]'::jsonb, 'NWS 503');
    if (select storm_mode from public.account_weather where account_id = acct) then raise exception 'storm_mode did not clear'; end if;
    if (select last_error from public.account_weather where account_id = acct) <> 'NWS 503' then raise exception 'error was not saved'; end if;
    if (select count(*) from public.account_weather where account_id = acct) <> 1 then raise exception 'weather row was duplicated'; end if;
    r := array_append(r, 'PASS: weather saves, updates in place and records errors');

    update public.accounts set service_lat = 95 where id = acct;
    r := array_append(r, 'FAIL: an impossible latitude was accepted');
    raise exception 'ROLLBACK_TESTS';
  exception
    when check_violation then
      r := array_append(r, 'PASS: impossible coordinates are rejected');
    when others then
      if sqlerrm <> 'ROLLBACK_TESTS' then
        r := array_append(r, 'FAIL: ' || sqlerrm);
      end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_weather();
-- expected: 3 lines, all PASS (the last PASS appears when the bad latitude is refused)


-- ---------------------------------------------------------------- Block 4: memory
create or replace function pg_temp.engine_check_memory()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  other uuid := 'b2222222-2222-4222-8222-222222222222';
  r text[] := '{}';
  l1 uuid;
  l2 uuid;
  m jsonb;
begin
  begin
    m := public.engine_returning_caller(acct, '+12145550188');
    if m <> 'null'::jsonb then raise exception 'an unknown number should return null'; end if;
    r := array_append(r, 'PASS: an unknown number returns nothing');

    l1 := public.engine_get_or_create_lead(acct, '+12145550188', now());
    update public.leads set name = 'Dana Ruiz', address = '9 Elm Dr Plano', status = 'lost', created_at = now() - interval '12 days' where id = l1;
    update public.lead_state set collected = '{"issue":"ceiling stain"}'::jsonb where lead_id = l1;
    l2 := public.engine_get_or_create_lead(acct, '+12145550188', now());
    if l2 = l1 then raise exception 'a lost lead should not be reused'; end if;

    m := public.engine_returning_caller(acct, '+12145550188', l2);
    if m ->> 'name' <> 'Dana Ruiz' or m ->> 'last_issue' <> 'ceiling stain' or (m ->> 'days_ago')::int <> 12 then
      raise exception 'returning caller details are wrong: %', m;
    end if;
    r := array_append(r, 'PASS: a returning caller is recognized with name, address and last issue');

    if public.engine_returning_caller(other, '+12145550188') <> 'null'::jsonb then
      raise exception 'memory leaked into another client''s account';
    end if;
    r := array_append(r, 'PASS: memory never crosses between clients');

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_memory();
-- expected: 3 lines, all PASS


-- ---------------------------------------------------------------- Block 5: permissions
create or replace function pg_temp.engine_check_permissions_2()
returns setof text
language plpgsql
as $$
declare
  r text[] := '{}';
begin
  begin
    set local role anon;
    perform count(*) from public.account_weather;
    r := array_append(r, 'FAIL: the public key can read weather');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: the public key cannot read weather');
  end;
  reset role;

  begin
    set local role authenticated;
    perform public.engine_set_urgency('a1111111-1111-4111-8111-111111111111', gen_random_uuid(), 'urgent', 'x');
    r := array_append(r, 'FAIL: a logged-in client can call engine_set_urgency');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: a logged-in client cannot call engine_set_urgency');
  end;
  reset role;

  begin
    set local role authenticated;
    perform public.engine_returning_caller('a1111111-1111-4111-8111-111111111111', '+12145550188');
    r := array_append(r, 'FAIL: a logged-in client can read caller memory');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: a logged-in client cannot read caller memory');
  end;
  reset role;

  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_permissions_2();
-- expected: 3 lines, all PASS
