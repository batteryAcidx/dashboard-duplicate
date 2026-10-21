-- ============================================================================
-- Check for 011. Clear the editor, paste, run. Every result line should start with PASS. Nothing is saved.
-- ============================================================================
create or replace function pg_temp.engine_check_asks()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  l uuid;
  v text;
begin
  begin
    l := public.engine_get_or_create_lead(acct, '+12145550501', now());
    foreach v in array array['issue', 'active_now', 'confirm_address', 'address', 'name', 'slot', 'photo', 'payment',
                             'cancel_confirm', 'purpose', 'callback_details', 'opener'] loop
      update public.lead_state set last_ask = v where lead_id = l;
    end loop;
    r := array_append(r, 'PASS: every question the engine can ask can be saved');

    update public.lead_state set flags = '{"opener":"leak_or_quote","caller_kind":"homeowner"}'::jsonb, last_ask = 'opener' where lead_id = l;
    if (select flags ->> 'opener' from public.lead_state where lead_id = l) <> 'leak_or_quote' then raise exception 'flags were not saved'; end if;
    r := array_append(r, 'PASS: the opener and the sorted caller type are saved with the conversation');

    begin
      update public.lead_state set last_ask = 'bogus' where lead_id = l;
      r := array_append(r, 'FAIL: an invalid question was accepted');
    exception when check_violation then
      r := array_append(r, 'PASS: an invalid question is refused');
    end;

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_asks();
-- expected: 3 lines, all PASS
