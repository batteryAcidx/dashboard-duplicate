# The backend and the data

```
supabase/
  sql/         THE DATA: numbered scripts that create tables and the rules the database enforces
  functions/   THE BACKEND: small programs that need secrets or talk to other services
    _shared/   Pure logic used by several functions. No network, tested on its own.
```

## sql/

Run in order, each with a dry run first. See `docs/RUNNING-THE-SQL.md`. Every important rule is enforced here, not in
the browser: who may see what, what counts as a valid value, and what may be deleted.

## functions/

| Function | What it does | Deploy | Secrets |
|---|---|---|---|
| `stripe-webhook` | Receives Stripe's updates and mirrors them | `--no-verify-jwt` (it checks Stripe's signature instead) | `STRIPE_WEBHOOK_SECRET` |
| `stripe-sync` | "Sync now": pulls one client's Stripe data | default | `STRIPE_SECRET_KEY` |
| `calendar-oauth` | Starts or ends a Google Calendar connection | default | `GOOGLE_CLIENT_ID`, `OAUTH_STATE_SECRET` |
| `calendar-callback` | Google sends the person back here | `--no-verify-jwt` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OAUTH_STATE_SECRET`, `APP_URL` |
| `calendar-sync` | Keeps calendars in step, both ways | `--no-verify-jwt` (checks the caller itself) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET` |
| `send-client-email` | Emails a client's owner from the admin | default | `RESEND_API_KEY`, `EMAIL_FROM` |
| `integration-status` | Reports which services are plugged in (names only) | default | none |

The secret names live in one list, `functions/_shared/integrations.ts`. A test checks every guide mentions them all.

## Rules every function follows

- Check who is calling before doing anything. Admin-only functions require an admin who has entered their authenticator code.
- Never send a secret back to the browser, in a response or in an error.
- Keep logic that can be tested (signature checks, mapping, validation) in `_shared/`, and keep the function itself thin.
