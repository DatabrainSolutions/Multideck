# Tasks and background agents

Tasks retains the daily list, quick add, priorities, record references and completion checkbox. **Hand to Dexter** queues a private cloud assignment. One saved conversation, name and icon belong to that assignment; a follow-up reuses them.

## Operator experience

- Up to three agents work per operator; further work queues. Waiting for a date, an event or review does not hold a working slot.
- The sidebar above Submit a ticket shows at most three working agents or unseen results. View all opens Tasks → With Dexter.
- A brief/check/comparison completes when its actual latest result enters the visible conversation. Loading or prefetching it is not acknowledgement.
- A reply task completes only after the connected provider confirms the matching draft was sent. Merely saving a provider draft does not complete a reply task.
- A record-change task completes when every proposal in its latest result has succeeded. Approval is still required for each operational change.
- Viewing a blocker or unsent reply hides its sidebar row after navigating away, while the task stays open. A later result resurfaces the same agent.
- Stop invalidates active work and pauses a linked event watch. A retry or follow-up explicitly reopens the task. Change time uses the operator's local timezone. Retrying due work keeps its execution phase. Deleting the task stops its work and closes its conversation; an assigned conversation cannot be removed separately while its task remains.

## Useful examples

| Task | Dexter's work | Completion |
| --- | --- | --- |
| Reply to Sam on Tuesday about the revised quote | Find the exact correspondent, thread and quote; save a one-off Tuesday run; re-read the current thread and prepare a reply then. | Matching provider-confirmed send after approval. |
| Meeting next Tuesday | Find the calendar meeting and linked customer context. Schedule a brief if the target is clear; preserve findings and identify ambiguity if several meetings fit. | Brief viewed. |
| Get the invoice and add it to the CMS | Search authorised correspondence and inspect the attachment. Match the invoice and supported destination before proposing a save. “CMS” alone never grants or invents an integration. | All supported proposed saves confirmed. |
| Compare rates for this shipment | Read the linked route, cargo and current rate evidence; return a comparison with assumptions and sources. | Comparison viewed. |
| Check this booking when its status changes | Compile a supported owner-scoped deterministic watch; the first matching saved event queues a fresh investigation. | Result viewed, or any required action confirmed. |
| Speak to mum | Explain that personal context is unavailable without guessing a relative from business data. | Remains open for the operator. |

## Runtime and permissions

`AI_DexterTaskAssignments` is owner-readable and browser read-only. `AI_DexterTaskRuns` and settings are service-only. No browser refresh/access token is stored or minted for background work. Every tool round and owner RPC checks a current, unexpired service lease, active user/company and open task. The RPC bridge allows only named existing permission-checked capabilities; it cannot run arbitrary SQL or arbitrary actions.

The worker uses Luna with high reasoning, a 130-second work budget, bounded tool rounds/calls and a 6,000-token response ceiling. Luna with low reasoning selects a name once; a small fallback name pool prevents a naming outage from blocking work. Attachments from authorised email are bounded to 12 MB per background run to contain memory use with parallel agents. Prepared work always uses Approve mode.

A three-minute lease handles process loss. Explicit connection failures release the slot and retry after a 30-second backoff. Three attempts is the limit. Saved results are recovered by run ID; a crash after creating proposals recovers those proposals for review without regenerating them. A single shared client store uses realtime, coalesced refreshes, focus/reconnect recovery and a 30-second visible-page fallback.

One tenant-local `pg_cron` job wakes `dexter-task-worker` each minute through `pg_net`. The endpoint checks a dedicated Vault secret. `multideck_task_configure` is service-only; UI hand-off is enabled only after deployment/configuration. Scheduled/event runs are one-off; there are no recurring model checks. Linked watch notifications are suppressed in favour of the resulting task notification.

## Dexter parity and intentional limits

Calendar and external-event reads accept `YYYY-MM-DD@Area/City` and exact event IDs; local-day boundaries handle daylight-saving changes and retain private-event visibility rules.

Chat reads agent evidence through the existing owner-scoped `todo` domain. Existing task create/edit/complete actions retain approval and audit. Watching for you additionally supports `agentStatus` and `agentName`, using real saved changes and the existing owner rules.

Creating or controlling background agents through model-generated actions is intentionally unsupported in this version: it would permit recursive delegation. Chat explains this and directs the operator to the task controls. Background follow-ups support text and selected record references; direct file uploads into a background follow-up are not exposed. Authorised email attachment discovery works in the cloud. This is an App feature, not a new dependency on the transitional .NET server or a shared tenant database.

## Verification

- `node --test supabase/tests/dexter-background-tasks-postgres.test.mjs`: owner isolation, denied worker grants, three slots, unique active icons, stale leases, revocation, idempotent hand-off, saved-result requirement, completion-on-view, draft/send distinction, future scheduling, cancellation, one-shot events, all-proposal completion, bounded retry and conversation deletion.
- `npx deno test --node-modules-dir=auto supabase/tests/dexter-background-outcome.test.ts`: invalid outcome, pending-change, timestamp and event evidence checks.
- `npx deno test --node-modules-dir=auto supabase/tests/dexter-conversation-artifacts.test.ts`: saved draft approval recovery, current action status and foreign owner/company denial.
- Client build and worker Deno check.
- Chrome on localhost:3000: real cloud hand-off, saved result, same-agent follow-up, completion persistence, personal blocker, invoice/email attachment discovery, calendar scheduling, local-time rescheduling, delivered calendar brief, complete unsent native email draft, preserved input on offline failure, and narrow-screen/reduced-motion layout.
- A rolled-back check against the connected tenant exercises the actual task domain, watch creation, match/non-match, duplicate suppression, pause/resume and foreign-owner denial. No business message is sent by these checks. Temporary QA tasks are removed after verification.

The broader existing Dexter/Home contract selection has six failures also reproduced against the unchanged branch HEAD (51/57 pass); these are separate from the task lifecycle tests. Service-only tables deliberately have no browser RLS policy. Public owner RPCs deliberately use permission-checked security-definer functions; Supabase reports these patterns as advisory notices.
