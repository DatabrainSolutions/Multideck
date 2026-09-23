# Dexter activity trail and failed-request recovery, 22 September 2026

Frontend implemented and verified on localhost:3000. Backend deployed to the verified MultiDeck project `aqtwypsuijxlnvtxpuxe`: agent-dexter version 295, ACTIVE, JWT verification enabled. The hosted frontend has not been pushed or deployed by this task.

The response has one continuous text shimmer, updated by real read/search/document/draft operations. Gmail and Outlook identities come from the authorised provider scope and structured email results, never from generated prose. Activities are saved in existing response metadata and restored through owner-checked conversation hydration. Interrupted responses retain activity evidence. Older responses remain compatible without invented historical steps.

This is presentation telemetry for existing capabilities. It adds no read/write/watch capability, permission, provider request or recurring model call. Watching for you retains its deterministic events and access boundaries. Background results can retain the same saved activity metadata.

## Live failure and recovery repair

Provider logs confirmed HTTP 400 `invalid_function_parameters` for `update_deal_sales.properties.input`: the nested object omitted `required`. Because all active actions are offered to the model, the unrelated Gmail question also failed.

Applied additive migration `20260922160940_dexter_deal_sales_strict_schema.sql`, matching the live migration ledger. Seven operation-specific strict alternatives preserve partial assignment semantics. Approval, writers, permissions and deterministic watches are unchanged. The original applied CRM migration was not edited. Recursive validation now checks nested objects, arrays, alternatives and definitions before provider submission; the regression reproduces the actual defective schema.

Initial provider failures explicitly identify when retry is safe. Both actual send/retry handlers clear the recovery lock only on that confirmation; uncertain network failures, timeouts and later tool failures retain reconciliation. Draft text is preserved. Recovery status now sits inside the message container, removing the large empty gap and duplicated prompt. Recovery no longer falsely says it is searching workspace data.

## Verification

- Client TypeScript and production build passed. Existing large-chunk warnings remain.
- Tracker, merge/parsing, hydration, async reads, durable streams, active-run ownership, nested schemas, thread switching, response presentation and actual client send/retry failure handlers: 29 focused checks passed. Updated reasoning-disclosure contract: 1 passed.
- PostgreSQL data-access runner: 83 main checks plus 10 finance checks passed, no failures or skips. Includes actual CRM approval/audit/idempotency and deterministic watch lifecycles with the repair migration.
- Shared/backend activity modules type-check; modified backend files pass TypeScript syntax parsing.
- Chrome gallery: real Gmail/Outlook component previews; active, completed and failed stages; keyboard Enter/Space disclosure; 390px layout; loaded assets; light/dark themes; static readable reduced-motion fallback.
- The shimmer retained its animation start time across an activity-label change.
- Repeated the user's read-only Gmail question against the deployed function. It completed and saved eight actual activities. A failed email read remained visibly marked alongside successful reads. A second live request also completed with five saved activities.
- Reopened `/agent-dexter?conversation=f7ae3548-1ec5-492b-85a9-d038fe60e0c3`: saved answer, source links, tables and all eight activity rows rendered; Gmail logos loaded at 16px; no console errors. At 390px, document width remained 390px, with no horizontal page overflow.
- Existing send-lifecycle source-contract tests have two unrelated failures: a direct `refreshSession` assertion and an old composer class string. Both also fail against HEAD and were not weakened or changed.

Not verified: a live Outlook mailbox request or hosted frontend deployment. Outlook identity/states were verified through the actual component gallery. No email was sent by this task.

Preview: http://localhost:3000/components?component=dexter-live-reasoning

## Warning tooltips

Warning icons now open a tooltip on hover, keyboard focus or tap. New failures retain a bounded, product-authored explanation based on known error codes, including email page limits, mailbox reconnection, missing permissions and attachment limits. Raw provider errors and tool arguments are never copied. Older saved failures explicitly say the exact reason was not saved, with a retry suggestion. The component gallery includes the actual three-page-limit example; interrupted steps have separate copy. Backend version 295 includes detail capture.

Chrome verified: click/tap opens warning details, Escape dismisses, hover reopens, and keyboard Tab/Shift+Tab focus exposes the accessible explanation. Mobile tooltip bounds were 46–326px in a 390px viewport. Temporary device emulation was restored.
