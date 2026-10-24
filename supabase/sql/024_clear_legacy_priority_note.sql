-- ============================================================================
-- Clears an old note from the database (run in the DASHBOARD project)
-- Script 003 wrote "Flagged as priority before the engine" onto every old lead that had the plain priority flag.
-- It tells the owner nothing, so it is removed. The priority itself (the badge) is kept.
-- The screens already hide this sentence, so this only tidies the data.
-- DRY RUN FIRST: change the last line to "rollback;", run, then restore "commit;".
-- ============================================================================
begin;

update public.leads
   set urgency_reason = null
 where urgency_reason = 'Flagged as priority before the engine';

commit;

-- check: this should return 0
-- select count(*) from public.leads where urgency_reason = 'Flagged as priority before the engine';
