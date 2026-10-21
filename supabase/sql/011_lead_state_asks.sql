-- ============================================================================
-- Let lead_state remember every question the engine can ask (run in the DASHBOARD project, after 009)
-- Without this, saving a conversation that is waiting on the first reply would be refused.
-- DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

alter table public.lead_state drop constraint if exists lead_state_last_ask_check;
alter table public.lead_state add constraint lead_state_last_ask_check check (
  last_ask is null or last_ask in (
    'issue', 'active_now', 'confirm_address', 'address', 'name', 'slot', 'photo', 'payment',
    'cancel_confirm', 'purpose', 'callback_details', 'opener'
  )
);

commit;
