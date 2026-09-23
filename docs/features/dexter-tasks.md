# To Do handoff to Dexter

**Hand to Dexter** opens an owner-private, ordinary Dexter conversation for an open To Do task and sends its title and saved links as the first message. The app navigates to that conversation immediately. Repeating the action opens the same conversation and does not resend the first message. Follow-ups happen in the chat. A task remains open until its owner completes it; Dexter chat does not imply that a provider action was delivered or a proposed change was approved.

The task list has no named task agents, agent status view, or sidebar worker rows. Deleting a task retains its ordinary conversation in Dexter history. Existing background assignment conversations and results are retained for history, but the migration disables the worker settings, cancels outstanding runs and assignments, pauses linked watches, unschedules the worker wake-up, and removes authenticated handoff/control access. Historical worker code and schema remain so old records can be read safely; no new To Do handoff uses them.

The owner-scoped handoff RPC checks the current tenant, owner, undeleted/open status, and linked conversation. It serialises repeat clicks on the task row and returns the same chat. Normal Dexter read, action approval, and audit boundaries apply inside the conversation. A newly created conversation is not populated until the client sends the task prompt; if that send fails, the operator can retry it in the open chat.

## Watching for you

Watches are separate saved, owner-scoped event rules. Creation uses a model to translate a request, then validates the capability, field, operator, threshold, and exact record before saving. Ambiguous targets ask for clarification. Ordinary evaluation reacts to saved changes without recurring model calls. A `changed` rule can notify on each distinct transition of the watched field; a no-op does not notify. Threshold rules retain edge-triggered behaviour. Tenant and record permissions are checked by the watch read and evaluator paths.

## Verification

- `npm run test:dexter`: Dexter contracts, watch rule selection, malformed requests, and 1,000 reordered candidate sets with similar record names.
- `node --test supabase/tests/dexter-background-tasks-postgres.test.mjs`: owner isolation, repeat-click idempotency, historical chat reuse, retired queue controls, and no worker run for the new handoff.
- `node --test supabase/tests/dexter-address-watch-postgres.test.mjs`: watch creation/evaluation, consecutive field transitions, no-op changes, and access boundaries.
- `node supabase/tests/run-data-access-regression.mjs`: PostgreSQL access regression across the current schema and changed To Do JSON contract.
- Client build and Chrome review on localhost:3000. A visible page/build is local evidence; sending a real task to a connected Dexter backend requires deploying the client, Edge function, and migrations to the intended tenant and checking that journey there.
