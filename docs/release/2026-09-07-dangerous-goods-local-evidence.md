# Dangerous-goods evidence — connected local implementation

## Scope and state

Local implementation only. The two migrations, Booking endpoint/client editor,
Dexter approved action and deterministic watch adapter belong to one release.
Do not deploy a partial subset. No development database, Edge Function, Vercel
configuration, customer Quote, external message or approval state changed here.

The checkout started at clean `f6f49c9` except the two preservation-test changes
made immediately before the user's goal check-in. Those changes are included.
The earlier Job-ref gate remains closed. The last live deployment inspected is
READY `5b70f31` on `dev.multideck.app`; it does not contain this DG implementation.

## Verified foundation and implementation

- Read-only development inspection found zero `Job_CargoDangerousGoods` rows,
  RLS enabled, no row policies, broad old browser table grants, and two non-null
  boolean columns defaulting to false. No live writes were used to test access.
- Reused that typed child table. Existing values/identities are retained and
  labelled legacy without invented operator attribution. Legacy entries are
  read-only. New operator flags are nullable and default to unknown, not No.
- Added source reference, recorded/voided status, actor/timestamp metadata,
  exact job/cargo/record optimistic tokens and attributed before/after history.
  One cargo line may retain multiple independent records. Void retains values;
  no hard deletion, parent hazardous-flag rewrite or Quote mutation occurs.
- Removed direct table grants in the local migration. The public save RPC is
  service-only and binds the authenticated actor through the Booking Edge path;
  internal save/projector helpers are not independently service-callable.
- Complete Save and Open responses preserve the existing document/version
  envelope. Current cargo owns the child records; archived cargo is not editable.
- Dexter reads exact source records, reviews supplied before/after values in
  both response paths, and always requires approval, including Full access.
  The registered action uses the same canonical save boundary. Watches resolve
  exact current source identity and label, react to stored field changes, and
  never classify goods, certify compliance, run timers or make autonomous edits.
- Booking UI is connected to the selected cargo line, blocked while its parent
  draft is dirty, and rejects late/wrong-Booking responses. Source, retained
  values, recent returned history, explicit unknown flags and void status are
  visible. Maritime entry follows the existing shared mode policy; previously
  supplied values remain visible. No mode reinterprets the supplied evidence.
- Added an isolated interactive `/components?component=booking-dangerous-goods`
  preview, source, usage example and product links. Preview saves are explicitly
  in-memory and never invoke the backend.

## Checks

- 24 backend-focused tests pass, including two real disposable-PostgreSQL
  suites. The DG lifecycle exercises Sea/Air/Road/Rail/multimodal recording,
  unknown/No/Yes/clear, stale and malformed writes, legacy/foreign/retired
  denial, source preservation, void audit and unchanged Quote/route records.
  Dexter covers real prepare/approve/execute/replay in Approve and Full access,
  matching once, unrelated changes, pause/resume, no-op, revoked owner, other
  user history denial and read/watch-list revocation. Auth and broad workspace
  resolution remain declared fixtures, not hosted cross-project proof.
- 20 client DG/milestone checks pass (8 DG, 12 milestone). DG includes actual
  submit-handler execution, exact payload, dirty/stale denial, retained failure
  entries, duplicate-submit guard, late responses and wrong-Booking response.
- Deno checks both full Edge import graphs with
  `--node-modules-dir=none --no-lock`; no dependency setup changed. An initial
  check without those established flags could not resolve the npm dependency;
  using the existing cache mode resolved it.
- Client TypeScript and Vite build pass, retaining the existing large-chunk
  warning. No validation or build guard was weakened.
- Chrome on the existing localhost:3000 server verified the real component:
  empty state, initial unknown flags, required-field focus, synthetic create,
  recoverable failed save with retained entries, discard confirmation, status
  selection, void/read-only state and logical focus restoration. The synthetic
  entry remains only in that preview page. No console errors were captured.
  The desktop form was visually inspected; its width was corrected to override
  the shared dialog's small-screen breakpoint and its footer made sticky.
- Shared primitives/tokens, explicit labels, focus/error feedback and retained
  drafts follow the UI/accessibility skills. No shared styling was changed.

## Remaining release and acceptance gates

Review and rehearse both exact migrations against current retained development
schema and populated legacy records, compare source/deployment drift and security
advisors, then perform the controlled combined development release. Hosted
Booking save/reload/clear/void and Dexter approval/watch evidence are still
required. Complete narrow-screen, keyboard-loop, reduced-motion and regional
English checks; this desktop component pass does not substitute for them.

Full all-mode freight operational depth and the complete customer-response /
PDF / Booking / selective-revision lifecycle remain open. JQ20022 V2 send,
acceptance and selective apply retain approval requirements. Feature-preview
Vercel environment repair still needs its recorded scope decision. Leave the
old erroneous email action unsent. Customs/iCustoms, tracking, PDF-logo and other
deferrals are unchanged. No 95% or production-readiness claim.
