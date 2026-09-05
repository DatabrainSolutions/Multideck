# Support ticket lifecycle verification

## Confirmed routing, 4 September 2026

The local App at port 3000 uses the `aqtwypsuijxlnvtxpuxe` operational project.
Its signed support intake resolves `dev.multideck.app` to the Development tenant
in Main Cloud (`wdcfuvefviecsxtiumph`). Local Cloud on port 5180 previously used
the separate `yvahqnqvzltvcuaeljit` Cloud Development project. Those databases
must not be mixed or copied to make the queue appear to work.

An authenticated sidebar submission created MD-10007, UUID
`97d636c4-3f2e-405e-9a5a-ca20b8bd732a`, in Main Cloud at
2026-09-04 21:14:51 UTC. Source was `customer_app`. Its initial `email_status=sent`
meant the support-inbox notification was sent, not a customer receipt. The
callback was also recorded as sent. Main Cloud initially rejected the supplied MFA code. The user subsequently
completed MFA; authenticated Cloud verification is recorded below.

## App boundary

`create-support-ticket` signs the body, timestamp, nonce, exact tenant hostname
and key identifier with the tenant's Ed25519 private key. The private key stays
in Edge Function secrets. Reporter identity is resolved from the authenticated
workspace on every request; a browser cannot choose a tenant or reporter.

The allowlist consists of draft creation, attachment preparation/completion,
finalisation, reporter-scoped ticket listing, individual-ticket reading and
customer comments. Cloud must enforce original-reporter ownership and exclude
restricted tickets and internal notes from customer conversation responses.
Comment retries retain their idempotency key when the submitted text is the same.

Settings > Support handles `ticket=UUID` links, ticket history, status and public
conversation. It uses the Multideck theme, existing shared primitives and UK/US
English date formatting. It must not claim a ticket or reply succeeded without
the real API confirming the record.

## Explicit Dexter exception

Dexter retains its existing reporter-safe ticket status evidence, approved
ordinary-ticket creation and event-driven watches. Conversation bodies and
customer reply writes are deliberately not exposed to Dexter in this change:
there is no approved conversation adapter or audited prepared reply action.
Dexter must explain this limitation and send the operator to Settings > Support.
It must never guess a conversation or claim to have sent a reply. The new reply
endpoint is not a generic write tool. Cloud status/public-reply callbacks should
continue to produce deterministic ordinary-ticket watch signals, never an idle
LLM loop. Restricted/security tickets remain excluded.

## Coordination

Cloud connection, transactional Multideck Resend templates, durable email jobs,
inbound replies, staff lifecycle and MFA diagnosis are owned by the Cloud task
`01a06e4f-39ef-7551-b72e-99f0e1b98b8e`, working in the shared local Cloud checkout.
Live function and schema inspection takes precedence over stale local source.

## Verified App and delivery results

- App `create-support-ticket` v64 is deployed to `aqtwypsuijxlnvtxpuxe` with JWT
  verification enabled. The reviewed delta adds the conversation action
  allowlist and authenticated reporter details to the existing live v63 signer.
- MD-10007 loaded through the authenticated App. Customer message
  `b2db5d65-95fa-4fea-90cd-b1e05c81cf98` was saved at 21:39:50 UTC and remained
  visible after a full browser reload. The exact message and reporter were
  confirmed in Main Cloud. Blank replies were rejected with inline feedback.
- That reply's support notification was delivered by Resend as
  `685c6bcd-29e0-4ecb-a2b4-b876d3703d4d`. The interrupted callback recovered
  through the durable job lease retry; App `Support_CloudTicketSignals` then
  contained the same message ID and change time. This verifies event receipt,
  not a complete user-created Dexter watch lifecycle.
- A second real sidebar submission created MD-10008
  (`c57e4257-2f42-48f3-b589-23801de61723`). Its customer receipt was naturally
  delivered as `42ca4bf7-960b-4dca-a880-bc61f475c0b7`, with a separate support
  notification `7ef90fd8-1711-4df6-b756-789c5cc1b269`. The Cloud task verified
  the existing Multideck template layout, ticket tracking link and unique
  inbound reply address. No old-ticket receipt was manually backfilled.
- List/detail navigation and browser Back were verified. Query-only navigation
  originally changed the URL without rerendering; Support now observes its
  ticket query and browser history. The conversation was visually checked in
  the narrower Settings layout. A phone viewport override produced a 433 CSS
  pixel layout at the browser's existing zoom, with no horizontal overflow.
  Tab moved from the labelled reply field to Send reply; Enter on an empty
  reply showed its inline validation. The viewport override was then reset.
  A nonexistent ticket UUID produced the explicit unavailable-details state,
  with no conversation or reply form; Your tickets recovered to the list.
- The 31 focused submission, conversation-validation and Dexter contract tests
  pass. The App build and subsequent TypeScript check pass. No shared checkout
  changes have been committed or pushed by this task.

## Remaining verification boundaries

The user completed Main Cloud MFA. The authenticated queue on localhost:5180
shows MD-10007 and MD-10008 with their exact titles, Development tenant, open
status and submission times. Opening MD-10007 shows the original reporter,
description, actual behaviour, App source and sent mailbox-notification state.
Its conversation contains the exact customer reply submitted from App, and
both details and the conversation survived a full Cloud browser reload. This
confirms the original real App-sidebar-to-local-Cloud submission goal.

Local Cloud remains read-only as requested. Staff replies, status changes and
resolution still require the reviewed writable Cloud frontend release and
actual UI verification. A real reply from the reporter's mailbox is also
needed to prove the inbound webhook end to end. Backend tests do not substitute
for those write/delivery journeys.

The permanent Development frontend was still serving the old Support screen
when inspected. An isolated local release snapshot was prepared from its
exact deployed commit `01c0ccbfc2f41b18e5e58d7871597f2afd11e8fb`, containing only
the five App support implementation files and three existing-gallery quick links.
This avoids publishing unrelated shared-checkout edits. The release build
passes with the exact Development host and verified public App project key.
Its first Vercel preview reached READY with no domain aliases; the served
Settings JavaScript returned HTTP 200 and contained the tracking and reply UI.
The final candidate also uses the existing DotGridLoader and includes its gallery link. Permanent domain
publication remains outstanding; a preview build is not an authenticated live
journey. Existing sign-in code preserves the full local path and query in
session storage, including the ticket link; this was inspected, not tested by
signing the user out.

Final App preview: `dpl_HbQLCmmyWLqzDksou4iu95QEvtdd`,
`https://multideck-app-580gfojde-databrain-solutions.vercel.app`, READY with an
empty alias list. Its served `settings-page-DLng73S6.js` returned HTTP 200 and
matched the local release artifact byte for byte. All tracked release files
were compared with the deployed baseline: only four intended tracked files
differ, plus the two new support files. No permanent host was repointed.

The new Dexter explanatory prompt remains a local source change; the large
shared `agent-dexter` function has not been redeployed by this task.

Reviewable App patch and manifest: `docs/releases/20260904-app-ticket-preview/`.
Cloud candidate `dpl_E5DbmVcT4tLXkSq1f1mrWFueALZj` also reached READY with no
aliases; its 41 release tests passed and its served asset matched the build.
The Cloud task confirmed the live Cloud domain still uses its prior release.
