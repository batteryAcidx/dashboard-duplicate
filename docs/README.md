# WedgeScale dashboard: start here

| I want to... | Read |
|---|---|
| Understand how the code is organised, and change it safely | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Run the database scripts, in the right order | [RUNNING-THE-SQL.md](RUNNING-THE-SQL.md) |
| Take payments | [SETUP-STRIPE.md](SETUP-STRIPE.md) |
| Let owners connect their calendar | [SETUP-GOOGLE-CALENDAR.md](SETUP-GOOGLE-CALENDAR.md) |
| Email clients from the admin | [SETUP-EMAIL.md](SETUP-EMAIL.md) |
| Set up a client's texting number | [SETUP-TWILIO.md](SETUP-TWILIO.md) |
| Decide how missed calls reach us | [SETUP-CALL-FORWARDING.md](SETUP-CALL-FORWARDING.md) |
| See what is blocked on someone else, and how long it takes | [WAITING.md](WAITING.md) |

The same guides are inside the admin, on the **Integrations** page, with copy buttons, your real addresses filled in, and tick boxes that remember your place.

## The order to do things in

1. Run the database scripts ([RUNNING-THE-SQL.md](RUNNING-THE-SQL.md)). Nothing new works without them.
2. Plug in the services you want, one at a time, in any order. Each one is optional: a service you have not plugged in just says "not plugged in yet" where it would be used.
3. Start the outside approvals early, because they are the slow part ([WAITING.md](WAITING.md)).

## Before you push a change

```
cd engine-tests
npm test       # every test, including the architecture rules
npm run docs   # only if you changed a guide
```
