-- ============================================================================
-- Checks for 001_engine_foundation.sql. Run each block on its own, in the DASHBOARD project.
-- Blocks A to C change data inside a transaction and ROLL BACK at the end, so nothing is kept.
-- Block D: the red error IS the pass.
-- ============================================================================

-- ---------------------------------------------------------------- A. tables exist and row level security is on
select tablename, rowsecurity
  from pg_tables
 where schemaname = 'public'
   and tablename in ('account_engine_settings', 'account_phone_config', 'lead_state', 'inbox',
                     'account_opt_outs', 'availability_blocks', 'ai_calls', 'owner_alerts')
 order by tablename;
-- expected: 8 rows, rowsecurity = true on every one

select 'accounts' as t, count(*) as rows from public.accounts
union all select 'account_engine_settings', count(*) from public.account_engine_settings
union all select 'leads', count(*) from public.leads
union all select 'lead_state', count(*) from public.lead_state;
-- expected: account_engine_settings = accounts, and lead_state = leads (the backfill worked)


-- ---------------------------------------------------------------- B. booking, double-booking, opt-out and the gate
begin;
do $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';   -- Summit Roofing (demo account)
  s1 timestamptz;
  lead1 uuid;
  lead2 uuid;
  appt1 uuid;
  appt1b uuid;
  blocked boolean := false;
  can1 boolean;
  can2 boolean;
begin
  select slot_start into s1 from public.engine_available_slots(acct, now(), 10, 1);
  if s1 is null then
    raise exception 'FAIL: no slots returned (check the account office hours and time zone)';
  end if;
  raise notice 'PASS: first free slot is %', s1;

  lead1 := public.engine_get_or_create_lead(acct, '+12145550101', now());
  lead2 := public.engine_get_or_create_lead(acct, '+12145550102', now());
  if lead1 = lead2 then raise exception 'FAIL: two phones got the same lead'; end if;
  if public.engine_get_or_create_lead(acct, '+12145550101', now()) <> lead1 then
    raise exception 'FAIL: same phone created a second lead';
  end if;
  raise notice 'PASS: leads are found or created once per phone';

  if (select stage from public.lead_state where lead_id = lead1) <> 'new' then
    raise exception 'FAIL: lead_state was not created for the new lead';
  end if;
  raise notice 'PASS: lead_state created automatically';

  appt1 := public.engine_book_inspection(acct, lead1, s1, '1 Test St');
  appt1b := public.engine_book_inspection(acct, lead1, s1, '1 Test St');
  if appt1 <> appt1b then raise exception 'FAIL: booking the same slot twice made two appointments'; end if;
  raise notice 'PASS: booking is idempotent';

  begin
    perform public.engine_book_inspection(acct, lead2, s1, '2 Test St');
  exception when others then
    if sqlerrm = 'slot_unavailable' then blocked := true; end if;
  end;
  if not blocked then raise exception 'FAIL: a second lead could take the same slot'; end if;
  raise notice 'PASS: double booking is blocked';

  if (select status from public.leads where id = lead1) <> 'booked' then raise exception 'FAIL: lead status not booked'; end if;
  if (select stage from public.lead_state where lead_id = lead1) <> 'booked' then raise exception 'FAIL: lead stage not booked'; end if;
  if not exists (select 1 from public.lead_events where lead_id = lead1 and event_type = 'booked') then
    raise exception 'FAIL: no booked event logged';
  end if;
  raise notice 'PASS: lead, stage and event updated';

  -- the gate: off until the account is live, approved and enabled
  can1 := public.engine_can_text(acct, '+12145550102');
  update public.accounts set status = 'live', registration_status = 'approved' where id = acct;
  update public.account_engine_settings set engine_enabled = true where account_id = acct;
  can2 := public.engine_can_text(acct, '+12145550102');
  if can1 then raise exception 'FAIL: gate was open while the engine was off'; end if;
  if not can2 then raise exception 'FAIL: gate stayed closed for a live, enabled account'; end if;
  raise notice 'PASS: engine_can_text follows the kill switch';

  perform public.engine_record_opt_out(acct, '+12145550102', 'test');
  if public.engine_can_text(acct, '+12145550102') then raise exception 'FAIL: opted-out number can still be texted'; end if;
  if not (select opted_out from public.leads where id = lead2) then raise exception 'FAIL: lead not marked opted out'; end if;
  if (select stage from public.lead_state where lead_id = lead2) <> 'opted_out' then raise exception 'FAIL: stage not opted_out'; end if;
  raise notice 'PASS: opt-out blocks texting and pauses the lead';

  perform public.engine_release_opt_out(acct, '+12145550102');
  if not public.engine_can_text(acct, '+12145550102') then raise exception 'FAIL: START did not release the opt-out'; end if;
  raise notice 'PASS: START releases the opt-out';

  begin
    perform public.engine_book_inspection(acct, lead1, s1 + interval '3 hours 7 minutes', null);
    raise exception 'FAIL: booked an off-grid time';
  exception when others then
    if sqlerrm <> 'slot_unavailable' then raise; end if;
  end;
  raise notice 'PASS: only real slots can be booked';
end $$;
rollback;


-- ---------------------------------------------------------------- C. the inbox: duplicates, claiming and retries
-- (skip this block if you already have real events waiting in the inbox)
begin;
do $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  v_id uuid;
  n integer;
  dupe boolean := false;
begin
  insert into public.inbox (account_id, event_type, provider_id, payload)
  values (acct, 'sms_inbound', 'SMTEST1', '{}'::jsonb);

  begin
    insert into public.inbox (account_id, event_type, provider_id, payload)
    values (acct, 'sms_inbound', 'SMTEST1', '{}'::jsonb);
  exception when unique_violation then
    dupe := true;
  end;
  if not dupe then raise exception 'FAIL: the same event was accepted twice'; end if;
  raise notice 'PASS: duplicate delivery is rejected';

  select count(*) into n from public.engine_claim_inbox(5, 'test-a');
  if n <> 1 then raise exception 'FAIL: claimed % rows, expected 1', n; end if;
  select count(*) into n from public.engine_claim_inbox(5, 'test-b');
  if n <> 0 then raise exception 'FAIL: the same event was claimed twice'; end if;
  raise notice 'PASS: an event is claimed once';

  select id into v_id from public.inbox where provider_id = 'SMTEST1';
  perform public.engine_finish_inbox(v_id, 'retry', 'boom', 0);
  select count(*) into n from public.engine_claim_inbox(5, 'test-c');
  if n <> 1 then raise exception 'FAIL: retry did not put the event back'; end if;
  perform public.engine_finish_inbox(v_id, 'done');
  if (select status from public.inbox where id = v_id) <> 'done' then raise exception 'FAIL: event not marked done'; end if;
  raise notice 'PASS: retry and finish work';
end $$;
rollback;


-- ---------------------------------------------------------------- D. the browser key can not touch any of it
-- Run each statement alone. A "permission denied" error is the PASS.
begin;
set local role anon;
select count(*) from public.inbox;
rollback;

begin;
set local role anon;
select * from public.engine_available_slots('a1111111-1111-4111-8111-111111111111', now(), 3, 3);
rollback;

begin;
set local role authenticated;
select count(*) from public.account_phone_config;
rollback;
