# Dangerous-goods development release

## Verified development deployment

Candidate `0e38c1b1575d873c663d6e7a1b4054d4085825df` was fast-forward pushed
to `origin/dev` after a fresh fetch confirmed no incoming changes. Existing
Git deployment `dpl_FhjijRnRfuqimp8cmdv7wtcDBY1x` reached READY for that exact
commit after about 138 seconds. `dev.multideck.app` is assigned without alias
error and serves `/assets/app-CNsnVEg4.js`. Target remains the existing Git dev
preview, not a production promotion. No shared Vercel/team/environment/domain
configuration changed.

Only the exact two migrations in the
[reviewed plan](2026-09-07-dangerous-goods-development-plan.json) were applied
to development `aqtwypsuijxlnvtxpuxe`. The isolated dry run and apply listed no
seeds or roles; ledger presence is confirmed for `20260907102754` and
`20260907103421`. Existing unrelated migration identities were retained rather
than replaying the repository's drifted finance/lifecycle-note filenames.

Before release, all 24 downloaded Booking/Dexter source files matched
`origin/dev`. After deploying only those two functions, all 26 downloaded files
match the reviewed checkout byte-for-byte:

| Function | Version | State | JWT verification | Bundle SHA-256 |
| --- | --- | --- | --- | --- |
| agent-dexter | 164 | ACTIVE | retained | `492aae26e8c4c3df98093fa07ed0dfb397dcea9fb7a5047a9aea03063ede5a74` |
| bookings-workflow | 43 | ACTIVE | retained | `7150292faca3f9146ff9b3796b1f3e5d6ccf8f71c88886481bd82d1f79b5d059` |

No other function metadata changed and none were removed. Existing shared
imports were bundled unchanged; Customs/iCustoms implementations were not edited
or independently deployed.

## Live preservation and permissions

Zero DG records existed before migration. Full-row fingerprints remained exact
across migration, before any synthetic hosted DG write:

| Relation | Rows | Aggregate MD5 |
| --- | ---: | --- |
| Job_Header | 77 | `a0c7363f71bc1034f556507a50ec4394` |
| Job_Cargo | 23 | `0bf0a0f2ee34442299030635c7b26d1c` |
| Job_Routing | 45 | `e51edb2cfbea046a0174ea07c05af212` |
| Job_RouteMilestones | 3 | `e7410a5af23cad3f92b9610bc5a865c2` |
| CusQuote_Versions | 38 | `73ee68f0a8424f20165f7c54e6187e10` |

Accepted Original `44e4b47b-b9b3-42dd-ad76-30df16a4db66` remains full-row MD5
`5568ecb6e055ac0bd7dead5561a79436` before release.

Live DG RLS is enabled. Direct anon/authenticated save is denied; service-role
save is allowed; the private mutation helper is not service-callable. Dexter's
action retains mandatory approval. Security advisors contain 1,555 findings,
with zero added/removed identities by cache key, name and level. This is a drift
comparison, not a claim that existing findings are resolved or safe. See the
[Supabase linter guidance](https://supabase.com/docs/guides/database/database-linter).

## Hosted operator lifecycle

Normal signed-in Chrome controls used synthetic JE0991134, cargo line 1
`47069295-655d-43d3-9583-7ee917d6552f`. Record
`30c2422e-4573-4ec9-8eef-02f4a6791ab4` is explicitly labelled
`QA-DG-20260907-NOT-A-SHIPMENT`, source reference
`Synthetic hosted verification only — not a classification`.

- Created at `2026-09-07T11:16:38.243338Z`, attributed to the signed-in operator.
  UN number, class, both flags and other unprovided fields remained null. A
  fresh client load displayed the exact saved source and values.
- Corrected only marine pollutant to false and added temporary test notes.
  Database confirmed unknown versus No is retained distinctly.
- A separately retained older editor tried to overwrite Notes. It returned the
  explicit reload/review conflict, retained its unsaved entries, and left the
  newer stored values intact. Cancel offered Keep editing by default; explicit
  Discard removed only the rejected draft. No stale-write audit entry exists.
- Cleared marine pollutant back to null. Browser automation's empty `fill`
  did not clear the Notes state on the first attempt; the audit correctly shows
  only the flag changed. Normal Select All/Backspace, followed by a different
  field edit, retained blank Notes in the form and saved null successfully at
  `2026-09-07T11:19:13.562982Z`. No database/UI bypass or code change was used.
- Voided at `2026-09-07T11:19:44.762223Z` through the normal status action.
  Fresh load shows Voided / Read-only, no correction control, null test values,
  retained source and all five attributed before/after history entries.

All 23 cargo, 45 route, 3 prior milestone and 38 Quote-version rows retain
their exact pre-release fingerprints above. The separate cargo hazardous flag
remains No. The Booking header's update timestamp/actor legitimately changes
when recording evidence; it is not claimed unchanged after these writes.
The final observed Chrome tab has no captured console errors. Both deployed
Edge endpoints reject unauthenticated calls with 401. This is not a full
network trace or cross-project token denial proof.

## Remaining

Hosted Dexter approved-write/watch verification with relevant denials remains
next. Use a new clearly labelled synthetic record; do not reactivate the voided
operator test or reuse any unrelated unsent prepared action. Do not replace
hosted evidence with isolated tests. Broader all-mode/revision acceptance, every outstanding
approval and all exclusions remain unchanged. No 95% claim.
