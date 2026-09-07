# Quote customer-response data boundary — 6 September 2026

## Release-blocking finding

The hosted JQ20022 test revealed a customer-response branding failure. Tracing that failure exposed a separate, more serious defect: deployed `quote-response` version 40 returned the complete issued Quote snapshot from the service-only RPC. That snapshot can contain internal charge costs, supplier details and margins even though the customer screen and generated PDF display selling values only. A scoped read confirmed `costAmount` in this test's issued snapshot. Hiding fields in the UI is not a data-access boundary.

This is a confirmed development code-path vulnerability, not evidence of third-party misuse. Other tenant deployments and historical accesses have not been reviewed. Review affected deployments before treating this as a platform-wide remediation; no unapproved tenant changes were made.

## Correction

- Both the public RPC and Edge Function now positively select the summary's route, validity, currency and customer-visible selling amounts. Hidden charge lines and all unrecognised fields are excluded. Scalar checks prevent nested objects carrying internal data through an allowed field. The issued PDF remains the complete customer document; its original accepted contents were not replaced.
- Expired/revoked responses contain only their state. Completed responses contain only the recorded outcome and time. Existing token, exact-origin, document-binding, permission and response-write checks remain in place.
- Branding previously queried private `quote_api` through PostgREST. A development publishable-key read returned HTTP 406 / PGRST106 (`Invalid schema: quote_api`), explaining the silent fallback. The existing token-validating service-only RPC now returns server-only company context; the Edge Function uses that to read the bounded brand contract and strips the context before responding. The private schema remains unexposed; no browser permission was added. See [Supabase custom-schema access requirements](https://supabase.com/docs/guides/api/using-custom-schemas).
- Client response types are narrowed to the same customer contract. Existing response-page rendering is compatible; no internal app styling or gallery component changed.

## Development deployment and verification

Target: development project `aqtwypsuijxlnvtxpuxe` and `dev.multideck.app` only.

1. Deployed immediate Edge projection hotfix as version 41, then applied only `20260906101833_quote_response_public_boundary.sql` through an isolated CLI checkout with the freshly fetched live ledger. Dry run listed exactly that migration; no team migration identity, retired screening source or baseline was rewritten.
2. Deployed `quote-response` version 42 (ACTIVE), ID `08ff9fee-dfb2-40e0-8dd7-67b987131f7e`, bundle hash `1280bda296487806d714f5c25d0e4a99f0e7911933a05c56e984910bfd979e44`. All six deployed source files were compared exactly with the intended package. Existing `verify_jwt: false` is preserved for this token-protected public endpoint; it is not a new authentication relaxation.
3. Live SQL confirms one matching migration and RPC execute denied to `anon` and `authenticated`, allowed only to `service_role`. Security advisors remain 1,555 existing findings with zero added/removed findings after excluding only their observation timestamp. This does not mean the existing advisor backlog is resolved.
4. Seventeen focused tests pass with zero failures/skips. The new behavioural tests execute the actual TypeScript projection and branding boundary, plus the real legacy token/origin view and new migration in disposable PostgreSQL 17. They cover active, hidden/nested/malformed data, invalid token/origin, terminal states, source preservation and role denial. Minimal surrounding table/permission fixtures are explicit; this is not a whole-tenant concurrency test.
5. Deno checks the full response import graph with `--no-config --no-lock --node-modules-dir=none`; client production build passes with existing chunk warnings. `git diff --check` passes. Build log: `/tmp/multideck-public-boundary-build-20260906.log`.
6. Reloaded the already accepted JQ20022 customer link: saved Jenkar logo/light branding and the completed acceptance state are visually correct, with no new response controls. No extra email, acceptance, Booking, transport instruction or financial action was performed in this checkpoint.

## Remaining gates

- The active-link projection is covered by executable database/TypeScript tests, but a fresh active hosted customer-link response after the fix still needs verification during a controlled revised-Quote test. Do not reset the accepted link or rewrite its history to obtain that evidence.
- The original JQ20022 PDF logo is still broken. The valid legacy PNG differs from current tenant branding; the exact render failure remains under investigation. Fix future generation and verify a fresh render, never replace issued/accepted evidence.
- Other-tenant deployment review, revision acceptance/partial Booking updates, notification queue timing/retries, deeper all-mode operations and hosted Dexter action/watch lifecycles remain unfinished.
- This change restricts external read output; it introduces no operational record, write action or watch event. Canonical internal Dexter reads, approved writes and deterministic lifecycle watches retain their existing permissions. No recurring AI polling or autonomous send authority was introduced.

Supabase, PostgreSQL and full-flow verification guidance informed the two-layer data boundary and its explicit evidence limits. The broad freight goal remains active; this checkpoint is not a 95% completion claim.
