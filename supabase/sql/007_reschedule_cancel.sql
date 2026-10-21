-- ============================================================================
-- Rescheduling and cancelling by text (run in the DASHBOARD Supabase project, after 005)
-- A reschedule UPDATES the same appointment row, so it can never count as a second booked inspection.
-- Additive. DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

-- owner alerts for the new situations
alter table public.owner_alerts drop constraint if exists owner_alerts_kind_check;
alter table public.owner_alerts add constraint owner_alerts_kind_check check (
  kind in ('booked', 'rescheduled', 'cancelled', 'priority', 'needs_you', 'handoff', 'heads_up', 'system')
);

-- the engine looks up the lead's current inspection before deciding what to say
create or replace function public.engine_current_appointment(p_account uuid, p_lead uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object('id', a.id, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
                              'address', a.address, 'status', a.status)
      from public.appointments a
     where a.account_id = p_account and a.lead_id = p_lead and a.status in ('scheduled', 'rescheduled')
     order by a.starts_at desc
     limit 1
  ), 'null'::jsonb);
$$;

-- move the lead's inspection to another open time. Same row, status 'rescheduled'. Repeating it is harmless.
create or replace function public.engine_reschedule_appointment(
  p_account uuid, p_lead uuid, p_new_start timestamptz, p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_appt public.appointments%rowtype;
  v_dur integer;
  v_tz text;
  v_ok boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text, 7));

  select * into v_appt
    from public.appointments
   where account_id = p_account and lead_id = p_lead and status in ('scheduled', 'rescheduled')
   order by starts_at desc
   limit 1;
  if not found then
    raise exception 'no_appointment';
  end if;

  if v_appt.starts_at = p_new_start then
    return v_appt.id;
  end if;

  if exists (
       select 1
         from public.leads l
         join public.account_opt_outs o
           on o.account_id = l.account_id and o.phone_e164 = l.phone_e164 and o.released_at is null
        where l.id = p_lead
     ) then
    raise exception 'opted_out';
  end if;

  select exists (
           select 1 from public.engine_available_slots(p_account, p_new_start, 1, 500) s where s.slot_start = p_new_start
         ) into v_ok;
  if not v_ok then
    raise exception 'slot_unavailable';
  end if;

  select coalesce(es.inspection_minutes, 60), a.timezone
    into v_dur, v_tz
    from public.accounts a
    left join public.account_engine_settings es on es.account_id = a.id
   where a.id = p_account;

  update public.appointments
     set starts_at = p_new_start,
         ends_at = p_new_start + make_interval(mins => v_dur),
         address = coalesce(p_address, address),
         status = 'rescheduled'
   where id = v_appt.id;

  insert into public.lead_events (account_id, lead_id, event_type, detail, actor)
  values (p_account, p_lead, 'rescheduled',
          to_char(v_appt.starts_at at time zone v_tz, 'Dy Mon DD, HH12:MI AM') || ' to ' ||
          to_char(p_new_start at time zone v_tz, 'Dy Mon DD, HH12:MI AM'), 'system');

  update public.lead_state set stage = 'booked', next_action = null, next_action_at = null
   where lead_id = p_lead and account_id = p_account;

  update public.leads
     set status = 'booked', status_changed_by = 'system', status_changed_at = now(), updated_at = now()
   where id = p_lead and account_id = p_account and status <> 'booked';

  return v_appt.id;
end;
$$;

-- cancel the lead's inspection. Returns false when there was nothing to cancel, so repeating it is harmless.
create or replace function public.engine_cancel_appointment(p_account uuid, p_lead uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_account::text, 7));

  update public.appointments set status = 'cancelled'
   where account_id = p_account and lead_id = p_lead and status in ('scheduled', 'rescheduled');
  get diagnostics v_n = row_count;
  if v_n = 0 then
    return false;
  end if;

  update public.leads
     set status = 'lost', status_changed_by = 'system', status_changed_at = now(), updated_at = now()
   where id = p_lead and account_id = p_account;

  insert into public.lead_events (account_id, lead_id, event_type, detail, actor)
  values (p_account, p_lead, 'status_changed', 'Cancelled by homeowner' || coalesce(': ' || left(p_reason, 150), ''), 'system');

  update public.lead_state set stage = 'closed', next_action = null, next_action_at = null
   where lead_id = p_lead and account_id = p_account;

  return true;
end;
$$;

revoke all on function public.engine_current_appointment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.engine_reschedule_appointment(uuid, uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.engine_cancel_appointment(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.engine_current_appointment(uuid, uuid) to service_role;
grant execute on function public.engine_reschedule_appointment(uuid, uuid, timestamptz, text) to service_role;
grant execute on function public.engine_cancel_appointment(uuid, uuid, text) to service_role;

commit;
