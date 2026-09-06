# Quote delivery recipient readiness — 6 September 2026

## Failure and rule

The development test Quote JQ20022 had complete shipment/commercial fields and an approved manual delivery recipient, but readiness returned only `Customer email` as missing. The current v4 submission procedure reused that same readiness check despite separately validating the chosen delivery address. This made the supported one-send override unusable when no contact email was saved.

Shipment/commercial readiness must not require a saved contact email. Delivery must require a valid resolved recipient. The recipient belongs to delivery evidence, not a silent update of the Quote or CRM. Existing client and server recipient validation, mailbox permissions, tenant scope, submission/document binding and approval requirements remain authoritative.

## Narrow correction

`20260906094835_quote_delivery_recipient_readiness.sql` removes precisely the saved-contact-email condition from the current underlying readiness function. It asserts the expected wrapper and v4 recipient validation before editing the function definition, failing for review if those boundaries drift. All other checks, function identity and ACL remain unchanged; no data, grants, RLS or public interfaces are added or changed.

Dexter continues to read the same authoritative readiness and delivery evidence; this does not grant chat a send action. Operators still review recipient, mailbox and exact content in the Send dialog. Existing confirmed-delivery/response watch events remain the same, with no new event from a read-only readiness query and no recurring LLM evaluation.

## Evidence

- The actual PostgreSQL readiness, cargo, value and v4 preparation functions run in the existing isolated lifecycle fixture. A new case proves blank saved contact plus valid manual recipient creates only a pending/revoked link; null, blank, malformed, multiple and newline-bearing addresses create no link; Quote/header/version values remain unchanged; missing Incoterms or customer charges still block. Existing cargo/revision/mode/value tests also pass in that database test. Permission resolution and broad tenant tables remain explicitly scoped fixtures, not full hosted proof.
- 22 supporting client/delivery/document contracts pass with no skips. Existing local frontend build from the supplier release remains valid; this correction changes no frontend code.
- Live pre-apply JQ20022 readiness is `{ready:false,missing:["Customer email"],warnings:[]}`. Header hash is `cef94a99befe1d1dac906ceaa2d6d643`; all-version hash is `77f2338b77ed3dea6ea21935f370c9a9`.
- Current Supabase function documentation and changelog checked. Relevant function-security guidance remains empty search paths and least privilege; no relevant breaking change for this operation was identified.

Deployment and post-apply verification pending in this checkpoint. Full email/PDF/customer acceptance/Booking evidence and the wider goal remain open.
