-- ============================================================================
-- Fix: admin actions were not always written to the activity log (run in the DASHBOARD project, after 017)
-- The log writer swallowed its own errors, so a rejected row vanished without a trace.
-- It now reports why a row was rejected (the admin functions still never fail because of it).
-- DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

drop function if exists private.engine_log_admin_action(uuid, text, text);

-- returns '' when the row was written, otherwise the reason it was not
create or replace function private.engine_log_admin_action(p_account uuid, p_action text, p_detail text)
returns text
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
  if v_cols is null then
    return 'the admin log table was not found';
  end if;
  if not ('action' = any (v_cols)) then
    return 'the admin log has no action column';
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
    return left(sqlerrm, 300);
  end;
  return '';
end;
$$;

commit;
