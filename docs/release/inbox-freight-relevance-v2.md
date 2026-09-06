# Inbox freight relevance v2

Suggested updates now requires positive freight evidence for both invoices and
booking confirmations. Generic invoices, retail delivery fees, order/tracking
numbers and sender identity do not establish relevance. The model considers
the attachment, a bounded email body and sender metadata in the existing
governed extraction call; quoted freight evidence is checked against the source
before a suggestion can be created.

Clearly relevant freight documents can still appear without a booking match.
Uncertain documents need an explicitly labelled, source-backed reference that
matches an existing booking in the same company, subject to `Bookings.Read`.
Other uncertain documents stay in the original Inbox. This intentionally
favours a quieter review queue; an unusual or poorly scanned freight document
may therefore need to be handled from the ordinary Inbox.

## Activation

The local Vite frontend uses hosted Supabase. These changes are not activated by
refreshing localhost. The configured project at preparation time was
`aqtwypsuijxlnvtxpuxe` (display name `MultiDeck`); confirm the intended target
again before deploying.

1. Deploy `email-watch-worker`, including the new shared relevance policy, and
   `agent-dexter` to the approved tenant project. Preserve their configured JWT
   and existing worker authentication settings.
2. Apply only `20260902150000_inbox_freight_relevance_v2.sql` after the worker
   deployment is confirmed. It updates Dexter's read/watch descriptions and
   queues existing unresolved suggestions under enabled mailbox settings for a
   one-time recheck. It does not scan historical attachments. Each recheck uses
   the existing bounded OCR/extraction job and therefore incurs normal usage.
3. Confirm queued jobs finish. Applied, applying and dismissed suggestions must
   remain intact, including when an operator reviews one during a recheck.
4. Verify the real mailbox with an unrelated purchase and genuine freight
   paperwork. The unrelated item must remain accessible in the Inbox but must
   not create a suggestion, notification or watch signal. Relevant documents
   must retain source evidence and the existing review/apply lifecycle.

The approval-required write action and deterministic watch adapter are reused.
Rejected documents never reach the completion transaction that emits suggestion
notifications/watch signals. No new model polling or automatic booking writes
were added. An operator cannot request a broad rescan through Dexter; that
administrative recovery action remains outside its supported interface.

## Verified activation — 2 September 2026

Activated on the existing `MultiDeck` project `aqtwypsuijxlnvtxpuxe`:

- `email-watch-worker` version 69; `agent-dexter` version 147.
- Both targeted migrations applied. Unrelated deployed dependencies were
  preserved; the worker's custom-secret authentication and Dexter JWT
  verification remain enabled as before. An unauthenticated worker POST
  returned 401.
- Ten unresolved documents were rechecked. Six unrelated suggestions were
  filtered automatically. The remaining EC membership suggestion was removed
  through the new keyboard-accessible delete control and is retained as
  dismissed History. All twelve original emails and attachments remain.
- A separate live recheck of the duplicate EC invoice classified it as
  `business_overhead` / `content_irrelevant`; no suggestion, notification or
  watch signal remained for the six automatically filtered documents.
- Three existing freight test documents passed the live pipeline: one ready
  booking confirmation and two documents needing a match. The two previously
  applied history records were preserved. No booking changes were applied.
- Live testing caught Markdown table-reference grounding and OCR concurrency
  denials incorrectly labelled as allowance exhaustion. Both are corrected.
  Temporary OCR concurrency denials retry; real spending limits still fail
  closed. Relevance reasons and bounded source quotes are recorded in the
  server-only processing-job audit, not exposed as a new Dexter data domain.

The delete control uses the existing permission-checked, audited dismissal
endpoint. It removes only the suggestion from Needs review, never the source
email or attachment. Pending and failed requests retain the row; rapid clicks
are coalesced, and stale list responses cannot reintroduce a dismissed item.
Applied history has no delete control. The UI change is available on localhost;
no frontend hosting deployment was performed.

Browser verification used the existing authenticated localhost tab. Keyboard
deletion of the EC item, History, full refresh persistence and three remaining
review entries were verified. Desktop and mobile viewport checks found no
horizontal overflow and 40px delete targets. Existing shader `in.uv` warnings
were present; no dismissal error or framework overlay was observed.

## Automated verification

```sh
node --test supabase/tests/inbox-freight-relevance.test.mjs supabase/tests/inbox-freight-worker.test.mjs supabase/tests/inbox-booking-match-algorithms.test.mjs supabase/tests/inbox-suggested-updates-contract.test.mjs supabase/tests/model-gateway-denials.test.mjs multideck.client/tests/inbox-suggestion-dismiss.test.mjs
```

68 checks passed, including 600 deterministic admission combinations and 100
rapid delete attempts resulting in one server request. The worker tests execute
its real control flow with simulated
OCR/model responses, provider access and database records. They cover retail,
overhead and travel rejection; freight acceptance; unsupported evidence;
company/permission denial; disabled automation; and recheck preservation of
reviewed records. The pure relevance module passed strict TypeScript checking,
and the client passed TypeScript project checking and `npm run build`. Vite
reported existing chunk-size and mixed static/dynamic import warnings; the
build exited successfully. Changed-file secret scanning found no secrets.

These are regression/stress tests, not a statistical claim of classifier
accuracy across arbitrary customer mail. The live positive examples are
existing controlled freight fixtures. A broad labelled customer-mail evaluation
and the full chat/watch create-pause-resume lifecycle were not performed in
this change; the existing permission-safe adapters were reused.
