# Running the database scripts

Scripts are in `supabase/sql/`, numbered. Run them in the **Supabase SQL Editor** of the dashboard project, in order.

## The routine for each script

1. Open the script. Near the bottom, change the last line `commit;` to `rollback;`.
2. Run it. If it ends without an error, nothing was saved but you know it works.
3. Change the last line back to `commit;` and run it again. Now it is saved.
4. If the script has a matching checks file, run each block of it **on its own** (clear the editor between blocks).
   Every line should start with `PASS`. A `SKIP` is fine: it means that check could not run on your data.

## Which scripts have I already run?

Paste this into the SQL Editor. Every row says `true` for a script that has been applied.

```sql
select * from (values
  ('015 billing, calendar and controls', to_regclass('public.account_billing') is not null),
  ('017 activity log, health, Stripe mirror', to_regprocedure('public.admin_activity_list(uuid,timestamptz,timestamptz,uuid,text,text,integer,integer)') is not null),
  ('019 activity log fix', coalesce(pg_get_function_result(to_regprocedure('private.engine_log_admin_action(uuid,text,text)')), '') = 'text'),
  ('020 control center', to_regclass('public.setup_emails') is not null),
  ('022 registration form and links', to_regclass('public.account_registration') is not null)
) as t(script, applied);
```

If a row is `false`, run that script and everything after it that is `false`, in order.

## The scripts

| Script | What it adds | Checks |
|---|---|---|
| 001 to 012 | The engine's tables and rules | built into each |
| 013, 014 | Dashboard actions (contacts, lead types, engine switch) | 014 |
| 015 | Engine controls, billing, calendar tables and screens | 016 |
| 017 | Activity log reader, client health, Stripe mirror, legacy GHL field | 018 |
| 019 | Fixes the activity log so every admin action is recorded | 021 block 1 |
| 020 | Setup requests and emails, business details, Twilio details, safe client deletion, calendar plumbing | 021 |
| 022 | Business registration form (encrypted EIN), links on setup steps | 023 |

## Things to switch on first

- **Vault**: stores the Twilio token, the calendar token and the EIN encrypted. It is normally already on. Check with
  `select to_regclass('vault.secrets') is not null as vault_works;`. If it says false, run
  `create extension if not exists supabase_vault with schema vault;`. Without it the checks say `SKIP` and those
  features cannot save a secret.
- **pg_cron and pg_net** (Database, Extensions): only for the automatic calendar sync. See `SETUP-GOOGLE-CALENDAR.md`.
