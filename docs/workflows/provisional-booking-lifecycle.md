# Provisional booking lifecycle

Status: backend deployed to MultiDeck (`aqtwypsuijxlnvtxpuxe`); the integrated frontend is verified locally. Source publication is recorded in Git history. A frontend deployment is not established by these checks.

Source: [Lee Wright, 10 September 2026, 13:41 BST](https://databrainworld.slack.com/archives/C0BAE05T477/p1789044065119459). Lee requests Provisional / In Progress / Complete, removing the separate provisional sidebar entry, and excluding provisional jobs from financial reports.

## Operator flow

New booking retains the existing direction-first, idempotent creation flow and booking reference. The persisted `draft` status is displayed as Provisional. Operators edit known information directly in the normal workspace; ordinary fields save automatically after a short pause. Customer, transport mode, origin and destination are required when progressing to In progress. The status dropdown opens an explicit confirmation; confirm the transition after ordinary edits have saved. Server failure retains the draft and gives a persistent recovery message. Complete cannot skip In progress. Completion sets the existing closed date; reopening as In progress clears it.

Existing quote acceptance keeps its current same-record handoff: an accepted quote with a linked customer creates `open` (In progress), and one needing a customer link remains `draft` (Provisional). References, quote/version links, cargo/equipment IDs, documents and history are not recreated. Existing operational codes (booked, in_transit, arrived, delivered, ready_for_invoice) display as In progress; complete/completed display as Complete. Cancelled/archived remain distinct. Carrier tracking is separate from booking lifecycle.

The new dropdown requires Bookings.Write and the backend's lifecycleSupported capability. It remains disabled with an explanation against an older backend, preventing the client from implying that its server validation/report semantics have already shipped. Ordinary saves carry the loaded timestamp and reject a stale overwrite. Row triggers validate lifecycle transitions and record one audit event per actual status change across the workspace and existing Dexter write path.

## Confirmed financial boundary

[Lee's reply at 15:52 BST](https://databrainworld.slack.com/archives/C0BAE05T477/p1789051942107479) confirms that Provisional represents possible intent and must have no invoice or financial records until it becomes an actual booking. This resolves the earlier posted/mixed-invoice reporting question through prevention, rather than removing posted accounting entries.

The second local migration guards insert/update on financial and job-costing columns with a foreign key to Job_Header, including FIN_Documents, job allocations, accruals, WIP and cost lines. It also validates the polymorphic Job_Header source on finance documents. A job lock serialises finance capture with a return to Provisional. Returning a job with any financial record to Provisional is rejected. Existing RLS, permission, approval and audit boundaries are retained.

The accepted-quote conversion keeps charges in the exact accepted quote snapshot while a customer link is missing. On progression to In progress they transfer once, within the same transaction. A cancelled provisional booking does not release charges. Existing historical cost lines are not duplicated. Quote charge-review attempts on provisional records fail at the same finance boundary and can be retried after progression.

Job finance summaries and Accruals & WIP candidates continue to exclude provisional records. Invoiced-sales and posted ledger documents are not hidden or rewritten. The lifecycle selector only enables when both local migrations have been applied. The finance tab explains progression is required.

A read-only check of the MultiDeck Supabase project (`aqtwypsuijxlnvtxpuxe`) used by localhost found zero directly job-linked invoices and four existing cost lines on provisional bookings. This is not the separate Jenkar project; its use by localhost does not establish that it is a disposable development database. Those historical lines are preserved and require Finance review before rollout; no deletion or reclassification was performed. The reporting reply monitor was paused after the answer was read and relayed.

## Dexter

Existing bookings reads expose jobStatus. Existing update_booking is the allowlisted, reviewed write and reaches the same lifecycle trigger. Existing deterministic booking watches observe the `status` field with stored codes (draft/open/complete), separate from trackingStatus. Registry descriptions make those mappings explicit. No recurring LLM polling is introduced into the product.

Creating an incomplete provisional booking through Dexter remains unsupported: its existing create_booking action requires an exact customer and must not invent one. Use New booking for an incomplete provisional record. Dexter may change an existing booking's lifecycle through its approved update action once server validation is installed. Hosted end-to-end chat approval and watch delivery for this migration remain unverified.

## Verification

The dedicated temporary-Postgres test applies both actual migrations with explicit fixtures for existing aggregate stages and finance views. It verifies transition rollback, missing customer/mode/route, same job ID, stale-save rejection, reader/foreign-company denial, single audit events, completion/reopening and job-summary inclusion/exclusion, rejection of provisional invoice drafts/polymorphic sources/mixed-job allocations/costs/WIP/accruals, and exactly-once deferred quote-charge transfer. It also executes the production booking-register query and verifies lifecycle search, lifecycle ordering and separate tracking-status ordering. It does not substitute for the full hosted aggregate/integration journey.

The integrated client build passes, including the creation dialog, autosave and customer panel. Focused draft merge, party editing, autofill and customer-panel tests pass. Earlier approval and deterministic-watch regression checks passed. Two existing quote source-contract assertions fail identically against HEAD and the working source; they expect older save-handler and reference-mapping code. No tests were weakened to hide these failures.

## Connected verification, 10 September 2026

Applied migration versions are `20260910151110` and `20260910151116`; local filenames match the deployment ledger. Supabase reports `agent-dexter` version 225 and `finance-accruals` version 22 ACTIVE, with JWT verification enabled. The lifecycle capability was read back as enabled. Provisioning instructions list both migrations in order.

Chrome created isolated booking JD0991137. Progression without a customer failed and retained Provisional. Required demo-customer/route details were saved through the actual booking aggregate RPC after intermittent browser field-control timeouts. Chrome then saved In progress, reloaded it, saved Complete and reloaded it on the same record. Database readback confirms the completion date, exactly two lifecycle events and zero costing lines.

A rollback-only transaction against the actual connected aggregate verified unauthorised actor denial, stale-save rejection, provisional costing rejection, progression, completion and audit. Another rollback-only transaction verified source-snapshot charge release exactly once, provisional report exclusion and denial of returning a charge-bearing booking to Provisional. These are connected database checks; they do not prove a full hosted quote acceptance or Dexter chat/watch delivery journey.

New booking now opens a Radix dialog over the still-mounted originating screen, retaining its route, table and scroll state. It uses the shared branded Select, requires a direction, blocks repeat submission while creating, retains the selected direction on error and reuses the same idempotency key for retry. Confirmed creation navigates to the record. Direct creation links display the matching overview behind the dialog. Desktop and 390px rendering, keyboard focus containment, Escape/cancel focus restoration, disabled required submission, loading and an offline failure/retry were checked in Chrome. The successful retry created JD0991139. The network and viewport overrides were restored.

Both isolated QA records were soft-deleted with explicit QA audit events; no hard deletion or financial posting occurred. The four historical provisional lines remain unchanged, total local cost 0 and revenue 4. The existing frontend alias still pointed to Vercel deployment `dpl_22cvHdku5DZbiwhaahSHqhz5ttbX` at the publication hold point; no frontend deployment was run.

## Booking details and autosave verification

The header and Details use the shared quote controls and layout. The customer Name field spans the same width as its neighbouring fields: checked at a 2560px desktop viewport and 390px mobile viewport, with no horizontal page overflow on mobile. Ordinary successful saves leave the header quiet; pending work and errors remain visible. Destructive, lifecycle and source-evidence actions retain explicit review.

Isolated provisional booking JD0991142 was created through the connected dialog. Customer Demo Organisation 003 and payer Demo Organisation 027 were selected independently and retained after a full reload; a read-only database check confirmed their separate account IDs, names and codes. Manual name edits now detach the previous account identity, saved blank party fields no longer fall back to another party's name, and late responses match recreated party rows by role. Clearing the payer was confirmed in the database with a null name/account/code while the customer remained unchanged. The user's original payer-loss report was not reproduced as a failed account selection in this isolated journey.

An offline save retained the Customer PO input and displayed a recoverable error. Attempting to leave opened the unsaved-changes dialog; Keep editing retained the value, and retrying online persisted it, confirmed by database readback. Network overrides were restored. The draft merge tests cover typing during an in-flight save, server-assigned IDs, reordered parties, deliberate clears and conflicting updates.

Three complete Overview-to-Details cycles produced no autofill reveal overlays. A fresh Use customer action still produced the field reveals. Reduced-motion and explicit-event behaviour are covered by focused tests. The real linked contact pill opened its details within the customer block; Back received focus, and keyboard activation returned focus to the original contact pill. The customer panel's loading, missing-data, error, denied, wrong-account and stale-response states are covered by focused tests and its gallery preview.

These checks do not establish a full hosted quote-acceptance journey, Dexter chat/watch delivery, every permission role, or frontend deployment. JD0991141 and the user's other review records were left untouched during the isolated checks. JD0991142 remains an identified provisional QA record with no financial writes performed by this check.
