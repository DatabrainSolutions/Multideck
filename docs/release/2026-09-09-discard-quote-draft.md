# Discard working Quote draft — microstep

User approved shared-development database and Quote backend changes only. No GitHub push, frontend deployment, email send or committed discard of an existing Quote was performed.

## Behaviour

- More quote actions → Discard working draft → confirmation, with initial focus on Cancel.
- Only the current unsent draft can be discarded, and a readable submitted predecessor must exist. Latest accepted version wins; otherwise latest submitted version.
- Discarded draft snapshot stays immutable in storage for audit, leaves the version selector, and its number is never reused. There is no operator restore-discarded-draft action.
- Canonical Quote save projection restores the prior values, then the prior submitted version becomes current. Submitted snapshots and PDFs are not regenerated or changed.
- A scoped transaction context prevents the existing acceptance trigger from creating/hydrating a Booking during restoration. Normal acceptance still retains its original conversion code.
- Drafts with delivery/response records are deliberately rejected, including failed delivery records, pending a separately reviewed cleanup/retry process.
- Save requests carry the expected version. Quotes which have used discard fail closed for old clients without that version; intentional new-version creation carries an explicit flag. New unguarded Quotes retain compatibility.
- Dedicated Dexter discard/recovery and draft-discard watches are explicitly unsupported in registry descriptions. Operator-only parity exception; no destructive AI write was added.

## Activation

- Project: `aqtwypsuijxlnvtxpuxe` (MultiDeck, eu-west-2), confirmed ACTIVE_HEALTHY.
- Migration: `20260909123517_quote_discard_working_draft`.
- `quotes-workflow` deployed version **77**, ACTIVE, JWT verification retained.
- Deployed SHA: `bc873bffb6586c6c32c28be2ca918005be485530ee640043fe5684fbd991e68a`.
- Patched only the deployed `quotes-workflow/index.ts` and `core.ts`; preserved the other twelve deployed source files exactly. Downloaded deployed bundle was compared after deployment: every file matched the intended bundle.
- Important: other pre-existing local/deployed differences remain in index and shared dependencies. This was not a blanket deployment of the checkout; future release must reconcile those deliberately.

## Verification

- `quote-discard-draft-transaction.sql` passed with the candidate DDL and again against the applied schema, all inside ROLLBACK. Synthetic fixture Quote/version rows were not committed. PostgreSQL sequences may consume numbers during rolled-back fixture creation.
- Covered: original-only refusal, accepted restore, submitted fallback, submitted discard refusal, missing/wrong Quote denial, anonymous denial, stale snapshot rejection, repeat-call idempotency, stale/legacy save rejection, explicit new revision after discard, preserved archived snapshot and unchanged pre-existing submitted snapshots.
- Booking header aggregate fingerprint stayed unchanged during discard. No Booking conversion was performed by the discard path.
- All 14 pre-existing submitted versions retain fingerprint `f08401bc1fca42bcd61a8dc15cb4cb5b` before and after.
- Fifteen existing submission/version tests passed; TypeScript build check passed; diff whitespace check passed.
- Chrome localhost JQ20020 V3: action visible; confirmation rendered and screenshot inspected; Cancel initially focused; Cancel clicked without submitting discard.
- Security advisors ran: existing project-wide informational/warning groups remain; no findings named the new discard/guard functions. This is not a clean-project security certification.
- Deno check was blocked by local npm package resolution for Supabase JS; deployment bundling succeeded. No dependency installation/reconfiguration used to work around it.

## Stop point

Actual user draft discard → refresh → accepted Details/Documents/Audit verification is intentionally left for the user. Mobile, network-failure browser and full cross-tenant fixture testing are not certified by this microstep. No automatic continuation or wider deployment is authorised.
