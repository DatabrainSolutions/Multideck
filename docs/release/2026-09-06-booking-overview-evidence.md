# Booking Overview: evidence rather than simulated confidence

## Scope and outcome

The user reconfirmed the broader freight goal and deferred PDF logo work unless
it blocks Quote sending or Booking conversion. This checkpoint does not touch
the renderer, branding, issued PDFs, email, Quote versions or operational data.

Confirmed problems:

- The arrival-confidence component produced a percentage from fixed status
  bases (30, 54 or 78), progress, carrier presence and schedule presence. Its
  plotted history used fixed offsets. Neither represented a predictive model.
- The availability inspector always said Documents, Customs and Cost ledger
  were not connected, independent of the real Booking workspace.
- Details allowed an independently editable document-status string.
- A nearby field-presence percentage was labelled operational readiness, which
  could incorrectly imply departure clearance or financial close-out approval.

Corrections:

- Retained the forecast position but show “Forecast unavailable” and explain
  that planned dates are not an on-time probability. No substitute prediction,
  tracking integration or implied future backend capability was introduced.
- Use the already-authorised workspace document/declaration/charge arrays.
  Distinguish absent data, a loaded empty list and records present.
- Derive the Details document label from the same rule, without changing or
  deleting any historical editableDetails value.
- Label the existing presence score “Booking information coverage”, use neutral
  informational states, and explicitly disclaim clearance/close-out approval.

## Verification

- 31 tests pass, zero failures/skips, across booking-overview-evidence,
  booking-detail-progress-strip, booking-detail-visual-contract,
  booking-quote-routing-review and freight-field-policy.
- Final client production build passes (TypeScript and Vite); existing large
  chunk warnings remain. git diff --check passes.
- Behaviour tests execute the actual component bodies and availability helper;
  shared visual primitives and locale context are explicit substitutes.
  Both en-GB and en-US, status variations, present/empty/missing records and
  read-only Details source wiring are covered.
- Local in-app browser on JE0991133 shows Forecast unavailable and Documents
  Records available, Customs declarations No records and Charge lines Records
  available. Screenshot confirms the revised coverage wording and layout.
- At a temporary 390×844 viewport, document and both main elements measured
  390px wide with scroll width 390px; forecast remained visible. Override reset.
- No browser save, send, acceptance or other operational write was performed.
- No new reusable UI component or new usage surface was introduced. Existing
  Surface, StatusPill and Booking fields remain Multideck-owned.
- This is a client display correction, not a backend capability change; existing
  Dexter reads, approved actions and event watches are unchanged.

## Remaining work

This is not evidence of full freight completion. Revision/partial-apply,
decline/change responses, queue timing/retries, all-mode operational depth and
hosted Dexter approval/watch verification remain open. The public-response
security fix still needs a fresh active hosted link check and separate tenant
rollout review. The known PDF logo defect is intentionally deferred.

The previous local logo-source commit remains separate and undeployed. Do not
mistake a client release of this correction for a renderer release.
