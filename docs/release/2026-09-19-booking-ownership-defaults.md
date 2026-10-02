# Booking ownership defaults — local microstep

Status: approved and released to shared development on 19 September 2026. Frontend remains local; no GitHub push or Vercel deployment.

## Approved backend release — 19 September

This section supersedes the staged/unreleased statements in the historical microstep notes below. User approval: “yes I approve” to the scoped shared-development ownership release.

Target: MultiDeck `aqtwypsuijxlnvtxpuxe`, verified ACTIVE_HEALTHY. No other tenant project was changed.

| Local migration | Applied remote version | Name |
| --- | --- | --- |
| 20260919175923 | 20260919192852 | booking_ownership_defaults |
| 20260919182854 | 20260919192853 | booking_ownership_editor |
| 20260919193238 | 20260919193400 | booking_editor_audit_workspace |

Do not bulk-push or reapply these files: MCP assigned the recorded remote versions. Earlier planning-charge mappings remain in their own release record.

- `bookings-workflow` v52 → **v53**, JWT verification retained. Retrieved all three deployed files and compared against the candidate: exact match. Changes from v52 are ownership parsing/action and ownership workspace readback only; shared authentication and existing workflows are unchanged.
- `agent-dexter` v282 → **v283**, JWT verification retained. Added only the two explicit ownership chat/watch unsupported statements to freshly retrieved deployed code; all 55 dependencies preserved. Retrieved all 56 files afterwards and verified exact candidate match. No new Dexter ownership capability is advertised.
- Initial database rehearsal ran inside a rolled-back transaction against installed definitions. No historical Booking reassignment or billing-company backfill was performed.
- Deeper connected verification found that the original audit wrapper used the older private workspace, which omits operational Details overrides. The separate corrective migration switches to the actual UI workspace and accepts its unchanged saved-owner display value. Applied migrations were not edited. The regression fixture now distinguishes these two projections.

### Release verification

- 17 targeted local tests passed before release; the amended ownership regression passed again after the correction. Earlier client TypeScript pass remains applicable: no frontend changes in this release turn.
- Real database rollback checks passed for direct creator/branch/entity defaults, reading without audit/ownership mutation, a second editor's ownership change and before/after audit, stale save rejection, unknown-identity denial, and ordinary Details before/after audit attributed to the second editor without changing the owner. The final check also confirmed unchanged Details do not add another detailed-change event. These use real RPC functions and separate internal/Auth IDs, not two independently signed-in browser sessions. All temporary Booking data was rolled back; underlying database sequences may consume values during rehearsals.
- Chrome localhost JD0991142: enabled Branch/Booking owner dialog; Save with unchanged selections completed and refreshed successfully, retained Harry Phillips/Wakefield 41, and produced zero ownership_changed events. No browser console errors captured. Real changed-owner browser persistence remains a user acceptance check; changes and audit were exercised in rollback database tests.
- Public unauthenticated Edge POST returned 401. Anonymous/authenticated roles cannot execute the new service RPCs; private helpers and the renamed save bypass are also inaccessible to service_role. Cross-company rejection is covered by disposable tests; an independently authenticated second-tenant browser test was not performed.
- Security advisors before/after contained identical findings after removing observation timestamps: no new findings. Existing broader project findings were not altered.
- JD0991142's missing billing entity remains unresolved deliberately. New configured direct Bookings receive an entity; repairing this historical record still requires a narrow reviewed decision.
- Full Quote acceptance/conversion and multi-office UI switching were not re-run in this release. Only one permitted office is currently configured for the tested user.

Local release evidence, pre-release function backups, candidates and retrieved post-release bundles: `/tmp/multideck-ownership-release.6J2X80`. Do not deploy the stale local Dexter tree wholesale in a later release. Next step is user testing, not another automatic release.

## Follow-on: header editor and actual-editor audit

The user approved editable Branch and Booking owner in the header, with audit attribution to the authenticated editor, not the owner. The following supersedes the read-only first-slice UI description below.

- Header now displays saved Branch and Booking owner, using existing Booking tokens and controls. Details shows the same ownership read-only; intentional changes go through one explicit Save ownership dialog.
- Removed viewer/Quote fallback ownership and implicit owner-name writes from ordinary Details autosaves. Missing ownership is shown as Unassigned on older backends, not the current viewer. On the new backend, legacy records without an operations owner display their recorded creator; opening does not backfill them.
- Staged `20260919182854_booking_ownership_editor.sql` after the defaults migration. New direct/converted Bookings get a persisted initial owner. Existing records are not mass-updated.
- Service-only ownership read/save functions check authenticated actor, company, source/target office access, active same-company owner, lifecycle and exact saved timestamp. Office choices use current security/team assignments; scoped permission is required if no assignment exists. A billing-entity change (or missing current entity on branch transfer) is refused with a review message; no charge/currency conversion or financial posting occurs.
- Ownership audit records actor and before/after branch/owner/direction. Ordinary Details saves are wrapped with before/after Booking workspace business values, excluding event/document/declaration/charge lists and updated timestamps. The original save chain remains intact; direct ownership mutations through it are rejected. Other dedicated workflows retain their existing actor-aware audit paths.
- The verified authenticated Edge caller is the only source of audit identity. A submitted owner ID or forged actor field cannot substitute for that caller. Reading ownership creates no audit entry.
- Existing Dexter chat/watch unsupported ownership boundary remains explicit. No new Dexter ownership write or watch is claimed.
- Unsupported older backend: header opens a clear awaiting-update state with Save disabled. Saved-but-refresh-failed state offers Retry refresh without resending the write. Concurrent edits/stale timestamps are rejected.

### Follow-on verification

17 focused tests passed, including disposable PostgreSQL two-user checks: B edits A's Booking without changing its owner; the detailed audit names B; branch/owner reassignment records before/after values and B; read/no-op produces no new detailed-change event; forged actor, invalid IDs, stale writes, foreign owner, billing-entity change, cancelled edit and generic-owner bypass are rejected. Existing service entry point is preserved and bypass wrappers/helpers are not publicly callable. The existing aggregate save and workspace provider are bounded fixtures in this test, not a full live database clone.

Client TypeScript and diff checks passed. Chrome localhost verified Wakefield 41 / Harry Phillips in the header, backend-not-yet-enabled message, Enter opening, Escape closing with focus restored, and 375px header reflow. No shared Booking was edited during these checks. The enabled editor's browser save/refresh/error flow and real two-user connected persistence remain release tests.

Release requires explicit approval for both staged ownership migrations and the matching bookings-workflow update, with deployed-source comparison first. Do not deploy the stale checkout Dexter tree wholesale. GitHub/Vercel remain excluded. JD0991142's missing entity is not repaired by this package; that still requires a reviewed, audited repair or a configured internal test record.

## Visible change

Booking Details → Job data → Ownership now shows Branch using the saved Booking office ID and the existing Quote office lookup. It reuses the Booking field component/tokens. Loading and unavailable lookup states do not substitute the current user's branch. Branch is read-only in this microstep; reassignment needs its own permission, accounting and audit workflow.

## Staged backend

`20260919175923_booking_ownership_defaults.sql` adds two private resolvers and narrowly patches the installed direct opener and underlying Quote conversion insertion. It preserves their existing authentication, reference allocation, idempotency and conversion logic; unexpected insertion anchors abort the migration.

- Direct opening: use the one valid explicit SEC default/assignment where configured; otherwise the one active team office assignment; otherwise the company's sole active office. An existing denied, expired or foreign assignment must not fall through to broader company access. Multiple offices/defaults require configuration, never UUID ordering.
- Quote conversion: retain the accepted Quote's office. Do not substitute the current user's branch.
- Billing entity: prefer the office's explicit same-company active link; otherwise one active company default, or a sole active company entity. Missing, invalid or ambiguous identity/base currency prevents creation with an actionable error. No currency is hardcoded.
- Persist entity at creation and add an `ownership_assigned` audit event with office/entity IDs and actor. Replays do not alter ownership or duplicate that event.
- No existing Bookings, company settings, office assignments or accepted Quotes are updated. No new tenant infrastructure is introduced.
- Dexter chat/watch explicitly cannot reassign ownership, modify defaults or substitute a generic watch. Local prompt additions require a future deployed-source-preserving release, not wholesale deployment of the stale checkout Dexter bundle.

There is no newly invented tenant-default settings screen. This slice reuses team/security assignments and the unambiguous single-branch case. A multi-branch tenant-wide default editor remains a separate product decision.

## Verification

- 16 targeted tests passed (ownership defaults plus planning navigation, charge readback and provisional request tests); no skips.
- Ownership test runs the real direct opener and new migration in disposable PostgreSQL, exercising persistence, audit, user/SEC preference, ambiguous branches, denied/foreign assignments, foreign/duplicate entity defaults, missing currency rollback, idempotent replay and helper grants. Quote insertion is a bounded fixture, not full end-to-end acceptance/conversion proof.
- Read-only deployed-source check found the required office insertion and single audit anchors in both live target functions. Recheck complete definitions before deployment.
- Client TypeScript build and `git diff --check` passed.
- Chrome localhost JD0991142 Details displayed Branch → Wakefield 41, read-only, using existing styling. No Booking fields were edited or saved during verification. Desktop verified; mobile and real connected default creation/conversion are not verified in this slice.

## Next approval boundary

Lee can review the visible Branch field locally now. Backend migration and the two Dexter prompt additions remain unreleased. Before release, review company defaults with the owner, check current live definitions and migration history, and use the exact isolated migration rather than a bulk push (prior planning migrations have recorded remote/local version differences).

JD0991142's previously observed missing billing link is deliberately not repaired by this migration. Recheck the live record before proposing a narrow, audited repair: user/colleague edits may have occurred since the earlier read. Do not bulk-backfill historic jobs. Planning-charge testing remains pending a configured record and approved backend work.

Customs/iCustoms, tracking, PDF-logo work, In-progress cancellation rules and unrelated Finance work remain untouched.
