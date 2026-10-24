# WedgeScale dashboard: start here

| I want to... | Read |
|---|---|
| Know what to do first, in order | [START-HERE.md](START-HERE.md) |
| Understand how the code is organised, and change it safely | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Run the database scripts, in the right order | [RUNNING-THE-SQL.md](RUNNING-THE-SQL.md) |
| Take payments | [SETUP-STRIPE.md](SETUP-STRIPE.md) |
| Let owners connect their calendar | [SETUP-GOOGLE-CALENDAR.md](SETUP-GOOGLE-CALENDAR.md) |
| Email clients from the admin | [SETUP-EMAIL.md](SETUP-EMAIL.md) |
| Set up a client's texting number | [SETUP-TWILIO.md](SETUP-TWILIO.md) |
| Decide how missed calls reach us | [SETUP-CALL-FORWARDING.md](SETUP-CALL-FORWARDING.md) |

The same guides are inside the admin, in the **Wiki** (the link in the footer), with copy buttons, your real addresses filled in, and tick boxes that remember your place. The **Integrations** page shows which services are plugged in.

## The order to do things in

1. Run the database scripts ([RUNNING-THE-SQL.md](RUNNING-THE-SQL.md)). Nothing new works without them.
2. Plug in the services you want, one at a time, in any order. Each one is optional: a service you have not plugged in just says "not plugged in yet" where it would be used.
3. Start the outside approvals early (Google's app review, Stripe's business check, each client's carrier registration), because they are the slow part.

## Before you push a change

```
cd engine-tests
npm test       # every test, including the architecture rules
npm run docs   # only if you changed a guide
```
