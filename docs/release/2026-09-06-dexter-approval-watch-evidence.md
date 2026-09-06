# Hosted Dexter approval and routing watch verification

## Failure and correction

On 6 September 2026, Chrome on `https://dev.multideck.app` displayed the correct
one-field review for synthetic Booking **JE0991134**, Sea leg 1. Clicking its
Approve button returned “That prepared action could not be approved safely”.
Prepared action `b543d6f5-ca8f-4362-879c-a33a0dbd6861` remained `prepared`, with
no attempted/approved timestamp and no Booking change.

The deployed approval RPC checked only the legacy
`request.jwt.claim.role` setting. Current PostgREST uses JSON
`request.jwt.claims`; the development `auth.role()` resolver already supports
both. A disposable PostgreSQL test reproduces the old `server_only` rejection
with JSON server claims. Migration `20260906171016` replaces only that role
lookup with `coalesce(auth.role(), '')`, retaining all existing company, user,
conversation, prepared-state and expiry predicates and service-only grants.
No execution guard, permission, approval requirement or user role was removed.

References: [PostgREST request claims](https://docs.postgrest.org/en/stable/references/transactions.html#request-headers-cookies-and-jwt-claims).

## Verification and development release

- Commit `9b8e802` contains the correction and tests.
- Two PostgreSQL suites pass: focused legacy/current claims and denial tests,
  plus the existing stable cargo/equipment/route/approval/watch lifecycle. The
  cut-off fixture now uses JSON claims and the actual resolver shape instead of
  testing only the old setting. Thirteen security contract tests also pass:
  **15 tests total, zero failures or skips**. These counts include suites with
  multiple SQL assertions; they are not 15 hosted scenarios.
- The focused test proves browser grants remain denied, actual authenticated
  role invocation is denied, missing/anonymous/authenticated claims and forged
  user-metadata role claims fail, and wrong company/user/conversation/record,
  expired and non-prepared states cannot approve. Legacy server claims remain
  compatible. An initial test mixed write/read in one SQL expression; it was
  corrected to separate statements, without changing production logic.
- Structural rehearsal passed against the retained development schema dump
  SHA256 `42e3d4bbe8680c4cfed131520517272c56921de497d7f065b2ab3227399f267f`,
  applying the already-released cut-off migration then this correction. Managed
  Auth/Storage are declared local fixtures; this is not a fresh whole-schema
  or hosted cross-tenant certification.
- Isolated CLI working directory linked only to development
  `aqtwypsuijxlnvtxpuxe`. Fetched actual migration history; dry run listed exactly
  `20260906171016_dexter_approval_request_role_compatibility.sql`, no seeds or
  roles. Applied that migration once and independently verified its ledger ID,
  deployed definition and grants (anon false, authenticated false, service true).
- Migration SHA256:
  `89a68d6474d32742320e662d396e55fe34a5ec9e44c712166196f9ba3de24eff`.
  CLI's subsequent Docker catalogue-cache warning did not mean application
  failed; no duplicate retry was made.
- Before/after security advisors: 1,555 findings each, zero added/removed by
  stable finding identity. Existing findings are not declared resolved or safe.

## Real hosted lifecycle

Test-only label: `QA-FREIGHT-20260906-NOT-A-SHIPMENT`.
Exact route: `bfae1c4c-28b1-43fd-9d0f-6cc072f10030`.
Conversation: `ff652730-6889-455e-a9ba-4824c13c4065`.
Watch: `51ddacd6-46b4-4fd2-961c-965e328671ac`, title
`QA-FREIGHT-20260906 cargo deadline test`, exact route, `cargoCutoffAt changed`,
no proposed/automatic action.

The watch was created through the normal app in the preceding goal turn. Its
owner's existing email preference is disabled and in-app enabled; the deployed
notification function checks that preference. Preferences were not modified,
no test email/customer acceptance was requested or invoked in this exercise.

| Action through the real UI | Saved result | Watch events |
| --- | --- | --- |
| Approve the original still-valid reviewed proposal after the fix | Cargo `2026-09-18T10:30:00Z` | 1 |
| Set documentation only via Booking editor and Save | Documentation `2026-09-17T12:00:00Z`; cargo retained | Still 1 |
| Pause watch, then change cargo via editor and Save | Cargo `2026-09-19T10:30:00Z` | Still 1 |
| Resume watch, clear cargo and documentation via editor and Save | All three deadlines null | 2 |

The approved proposal recorded `ApprovedAt` before `AttemptedAt`, finished
`succeeded`, and retained the normal attempted and succeeded audit entries.
Chrome displayed completion and the watch's new alert. A full Booking reload
showed the saved first cargo deadline. Database watch-event payloads show the
exact source and old/new values for the initial addition and resumed clear.
There are exactly two associated in-app notification rows, one per matching
change. No event occurred for the unrelated edit or paused edit.

Final cleanup: watch **paused**, trigger count **2**, test deadlines **all null**.
Other route fields retain MD5 `359f2bda179858ca00cee76ff760e2ea` (comparison
excludes deadline fields and normal UpdatedAt). Accepted Original version
`44e4b47b-b9b3-42dd-ad76-30df16a4db66` retains full-row MD5
`5568ecb6e055ac0bd7dead5561a79436`. Audit and test notifications are retained,
not erased. No Quote version, financial data, Customs/iCustoms, provider setting,
tracking connection or PDF-logo implementation was changed.

## Remaining evidence and product work

This proves one real hosted approved-route-edit/watch lifecycle, not every
Dexter action or the 95% all-mode goal. Hosted other-user/cross-project denial,
the approved-revision email/acceptance/selective-apply lifecycle, wider mode
depth and notification queue verification remain open. JQ20022 V2 permission
remains pending; no send/accept/apply was performed.

Two visible follow-ups were retained rather than hidden: routing watch copy
uses raw `cargoCutoffAt` and ISO timestamps; Booking's `Original` source-version
badge disappears after ordinary Save even though the accepted version link
and full version row remain intact. Investigate save-response metadata before
changing version logic. No new visual/keyboard/mobile certification or full
console/network audit is claimed by this bounded test.
