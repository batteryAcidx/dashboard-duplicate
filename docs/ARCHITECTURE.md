# How the code is organised

The goal: **change one thing without breaking another.** Each kind of work lives in one place, and an automated test
(`engine-tests/architecture.test.ts`) fails if a file reaches into a place it should not.

## The three parts

| Part | Where | What it does | What it must never do |
|---|---|---|---|
| **Frontend** | `src/` | What people see and click | Talk to the database directly, or hold business or security rules |
| **Backend** | `supabase/functions/` | Things that need secrets or other services: Stripe, Google, email | Be trusted with a browser's word. Every function checks who is calling |
| **Data** | `supabase/sql/` | Tables, and the rules the database enforces itself | Depend on a screen |

The frontend is allowed to be wrong or out of date. The data layer is not: every important rule (who may see what,
what a valid EIN is, whether a client may be deleted) is checked again inside the database, so a screen can never
save something it should not.

## Inside the frontend (`src/`)

```
domain/        Pure rules and types. No React, no network, no browser. Easy to test, safe to change.
api/           The ONLY place that talks to Supabase. Screens call api.adminApi.billing.get(...) and nothing else.
lib/           Small helpers: the one sync, settings kept in the browser, the two doors to the environment.
components/    Shared pieces of screen (buttons, cards, headers). They get their data through props.
integrations/  The pluggable services: catalog, guides, the "is it plugged in?" check, the Integrations and Wiki pages.
features/      Screens, grouped by area (features/admin/clients, /tabs, /shell, /settings, ...).
pages/         One address = one screen. Thin: they decide what to show, features do the showing.
```

Who may import whom (enforced by the test):

```
domain        ->  (nothing)
api           ->  domain, lib
lib           ->  domain, api
components    ->  domain, lib
integrations  ->  api, domain, components, lib
features      ->  api, domain, components, lib, integrations
pages         ->  everything above
```

Two more rules the test enforces: only `api/` may import the database client, and only `lib/config.ts` and
`lib/supabase.ts` may read environment settings.

## Plugging in a new service (for example Outlook)

1. **Backend:** add a folder under `supabase/functions/` for what needs a secret, and add its secret names to
   `supabase/functions/_shared/integrations.ts`. That one list drives the "is it plugged in?" check.
2. **Data:** add a numbered script in `supabase/sql/` only if it needs new tables.
3. **Frontend api:** add `src/api/integrations/yourService.ts`, and list it in `src/api/index.ts`.
4. **Frontend integration:** add a guide in `src/integrations/guides/`, an entry in `src/integrations/catalog.ts`,
   and wrap the screens that need it with `useIntegration('yourService')` and `<NotPluggedIn />`.
5. Run `npm run docs`, then `npm test`. A test checks the guide names every secret the backend needs.

## Changing something safely: examples

- **A wording change** (what an error says, how a status reads): edit `domain/`. Nothing else moves.
- **A new field on a form:** the form file in `features/`, the type in `domain/models.ts`, the call in `api/`,
  and the rule in `supabase/sql/` if the database should enforce it.
- **Swapping a service** (say a different email provider): only that service's backend function and its `api/`
  file change. No screen knows which provider is behind it.
- **A new admin tab:** a file in `features/admin/tabs/`, one line in `ClientDetailView`, and its calls in `api/admin/`.

## Where things are

- The admin's address map: `src/pages/AdminPage.tsx` (about 60 lines).
- Every database call: `src/api/`.
- Every guide and the waiting list: `src/integrations/`.
- Every secret name: `supabase/functions/_shared/integrations.ts`.
