# Development release: response queue and Booking evidence

## Release identity

- Published `f235088b641c8807353dc6e7d4f36e8a2c383390` to `origin/dev` by
  fast-forward from `59146c23348dee3525c55476d215dbea6a14b4bc`; six commits,
  zero upstream divergence/conflicts. The remote SHA was read back after push.
- Local recovery tag `codex/freight-before-notification-release-20260906`
  retains the preceding development source. Do not interpret it as a database
  rollback instruction.
- Existing Vercel project `multideck-app-dev`, ID
  `prj_Z8F1DDOmYitMo4Ryl20CfO9tMux1`; existing Git integration, Preview target,
  `dev` branch. Deployment `dpl_UjnshBqVtkXPyGKD8gVPKfRrHDDG` is **READY**.
- Approved hostname `https://dev.multideck.app` and immutable deployment
  `https://multideck-app-mj9104jrf-databrain-solutions.vercel.app` serve the same
  entry asset `/assets/app-CsUGlITr.js` (HTTP 200).
- Build log reports deployment completed at 13:33:02 UTC, 6 September 2026.
  No duplicate deployment or manual promotion was triggered.

Vercel project/account IDs, Node version, framework, returned domains and
configuration-updated timestamp match the pre-release read. No environment,
domain, team, Auth, integration or provider settings were modified. Only the
frontend Git release ran. The earlier local PDF-logo source is now recorded in
Git history, but **quotes-workflow was not deployed**: the user's logo deferral
remains in force. The two clear-fix migrations were already deployed separately;
this source publication did not reapply them or backfill business records.

## Verified

- Local TypeScript/Vite build passed; existing bundle-size warnings retained.
- Combined focused release run: **27 pass, zero fail/skip** across actual
  Booking overview rendering/availability, layout contracts, notification queue
  contracts and the shared notification-store behaviours.
- The prior isolated Chrome queue checks remain documented in
  [queue evidence](2026-09-06-quote-response-queue-evidence.md); no redundant
  resend or fabricated live response was used for release verification.
- Signed-in Chrome on the approved hostname, hard reload after READY:
  synthetic JQ20022 remains Original / Submitted / Accepted, linked to
  JE0991134, with its saved Sea/Export/FCL route and blank transport dates.
  DOM inspection confirms the new built asset and requested
  `/quotes/jq20022` readiness marker is `ready` after real workspace loading.
- Opening the linked Booking displays `Forecast unavailable`, with the
  explicit distinction between planned dates and arrival probability. The
  information score is labelled field presence, not operational approval.
- Saved workspace data shows Documents as records available; the Documents
  tab independently lists the one original accepted Quote PDF. No existing
  PDF was regenerated, downloaded, renamed or overwritten.
- Rendered Booking screenshot inspected. The captured warning/error console
  log for these bounded reads was empty. No general backend-log or all-routes
  health certification is claimed.

## Remaining

The fresh accepted-revision email/response/selective Booking application awaits
the specific user approval already requested. Hosted popup delivery, interrupted
Realtime recovery and retry persistence still need their complete lifecycle
evidence; a loaded Quote marker does not prove the entire queue transport.

Deeper all-mode operations and the dedicated approved Dexter revision adapter
remain part of the full goal. No customer acceptance, email, declaration,
shipment instruction, financial transaction or tenant business record was
submitted by this release check. Customs/iCustoms remains excluded from mutation;
tracking and PDF-logo work remain deferred. This is a development release,
not the original 95% completion claim.

The Vercel deployment/API guidance informed exact Git/deployment/asset checks;
verification guidance kept UI reads distinct from the remaining hosted write
lifecycle. The post-release evidence document itself is a later local checkpoint,
not part of the deployed application bundle.
