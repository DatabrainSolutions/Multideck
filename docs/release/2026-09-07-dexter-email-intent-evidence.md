# Dexter email-intent correction

This continues the full freight goal, not a narrower replacement objective.
The model-change acknowledgement was a status-only turn; this checkpoint adds
implemented, tested and hosted evidence. All eight clashes and all-mode depth
remain in scope. Existing Quote revision, preview-environment and other approval
requirements remain unchanged.

## Cause and correction

The previous milestone read-only request contained “do not ... send an email”.
Unscoped keyword routing treated that prohibition as a positive email request.
The failed conversation and unsent prepared action are retained in the preceding
[milestone evidence](2026-09-07-milestone-development-release.md).

Source `b78a71b9ee020cbe504de7abe2900295a981ea84` adds a shared email instruction
filter for read-only requests, negated clauses and quoted/code content. Email
send selection and server intent authorisation now share the same classifier.
Genuine draft requests with a no-send instruction remain drafts. Both response
paths use the shared preparation guard, rejecting unrequested or mismatched
email actions before preparation/execution. The model's draft tool also rejects
unrequested drafting before recording a writing-profile preparation event.

Sending still requires final operator approval in Approve and Full access.
Explicitly requested provider drafts retain their existing Full-access behaviour.
Mailbox, action allowlist, recipient, actor and provider permission checks are
not relaxed. No new backend domain or write capability is introduced. Chat
intent routing does not create a meaningful record-change watch event; existing
deterministic Watching for you adapters and lifecycle remain unchanged, with
their regression coverage run alongside this correction. No recurring LLM watch
evaluation is introduced.

## Local checks

- 45 focused tests pass, zero failures/skips: executable email-intent and real
  shared-guard regressions, security hardening, Booking approval review, and the
  actual PostgreSQL stable-item/milestone/approved-action/watch/isolation suite.
- Five additional email-action schema and refinement contracts pass.
- Complete Dexter import-graph Deno checking and `git diff --check` pass.
- Writing-profile contracts: 11 pass; one existing settings/catalogue contract
  fails because unchanged Settings source lacks the expected “Eligible messages”
  copy. Test and Settings source match the pre-fix HEAD. Neither was weakened or
  edited. This is not an all-tests-green claim.
- Denied requests cover selected-email context, quoted instructions, drafts
  with no-send wording, model-proposed mismatched actions, and unavailable action
  permission in both access modes. Positive email tests use preparation/provider
  spies, not external mail. This bounded English classifier is not a universal
  natural-language authorisation proof.

## Controlled development release

Fresh fetch showed no incoming dev commits: the local checkpoint was one
documentation commit ahead of `origin/dev`. Development Supabase
`aqtwypsuijxlnvtxpuxe` is ACTIVE_HEALTHY. All 20 downloaded Dexter 161 source
files matched the pre-fix checkout exactly.

Only `agent-dexter` was deployed: version 162, ACTIVE, JWT verification retained,
bundle SHA-256 `a2388322ba19a4c71330c3baa724fd8b6529cb9c66ac9112370ac1cbb600457e`.
All 20 re-downloaded source files match the reviewed candidate byte-for-byte.
No other Edge Function metadata changed and none was removed. Booking remains
version 42. An unauthenticated Dexter request returns 401; this is not a hosted
cross-project or revoked-user test. No database migration, Auth, mailbox/provider,
Vercel/team/environment/domain configuration or frontend source was changed.

Private before/after source bundles remain separately in
`/tmp/multideck-email-intent-before.6nUipi` and
`/tmp/multideck-email-intent-after.183RTW`.
At hosted testing, existing Vercel deployment
`dpl_2uCgKkK56KkmKBK86eyppi57Cw9b` remains READY for `32c2233`, with the approved
`dev.multideck.app` alias and no alias error. It calls the newly verified backend.
No new client build is being substituted for backend or hosted evidence.

The subsequent normal Git push of source plus evidence to `origin/dev` was
verified at `c3b258a14105e17fa39d838117939197627dc585`. Its existing Vercel Git
deployment `dpl_559kGzUEWBmyJ8xtHXuXor3kShFq` reached READY, with the approved
development alias and no alias error (about 117 seconds building). The hostname
still serves `/assets/app-DdoXZh8s.js`, as expected for unchanged frontend source.

## Hosted read-only retest and persistence

Signed-in Chrome repeated the exact failed request in a new Approve-mode
conversation `b9820832-e6d4-42df-87f1-aa470a43eced`, asking to inspect milestone
`273b8213-e3d3-448a-b28d-77c70661ae8b` on synthetic JE0991134, Sea leg 1.

The terminal answer is now normal sourced chat, not an email composer:
Cargo ready, voided, Operator source; planned 18 September 2026 10:30 UTC;
estimated 11:45 UTC; actual not recorded; not editable. It explicitly says the
saved record is not evidence of real cargo movement. A fresh page load retains
the same answer and source link. Neither observed tab reports console errors.
This is not a complete network trace.

Database inspection confirms zero prepared actions for the new conversation
and zero watches created since this release. The previous erroneous action
`709702dc-3b74-4d1b-9755-77505b3804d0` remains `prepared`, not executed. No Send
or provider-draft action was approved, sent, retried or deleted.

Full-row aggregate MD5s before release and after hosted testing are identical
(each aggregation sorts by `to_jsonb(row)::text`; do not compare hashes produced
using a different ordering):

| Relation | Rows | MD5 |
| --- | ---: | --- |
| Job_Header | 77 | `27551385163759252766a0b871846dff` |
| Job_Routing | 45 | `c4ccff3971ca6b28c9dc6f1db3260130` |
| CusQuote_Versions | 38 | `48f5e0efb6d918d4019edbf8d9e47a28` |
| Job_RouteMilestones | 1 | `d82d2b0da5589c7a76db22bbf851c10e` |
| booking_api.events | 39 | `f87ecac6c272bf0b896e77d9a449dd0c` |

## Remaining gates

The read-only email-routing failure is closed by hosted persistence evidence.
The subsequent [milestone approval/watch test](2026-09-07-milestone-approval-watch-evidence.md)
proves creation approval and the exact-ID watch lifecycle, while exposing two
watch-setup usability defects. Broader hosted denial and
revoked-user coverage, Air/Road/Rail/multimodal depth and the full eight-clash
acceptance matrix remain unfinished. JQ20022 V2 send/accept/selective apply and
feature-preview environment repair retain their approvals. Customs/iCustoms is
untouched; tracking, PDF-logo and calculator work remain deferred. No 95% claim.
