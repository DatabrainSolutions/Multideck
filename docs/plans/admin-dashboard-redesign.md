# Admin dashboard redesign plan and acceptance criteria

This plan implements the founder's request for a premium Admin system dashboard, while moving the existing financial dashboard into Finance. The financial permission must stay exactly as it is. This is a local implementation and verification plan; tenant deployment and confirmed live journeys must be reported separately.

## Agreed product definitions

- Admin has Overview, Growth, Usage & AI and System health views.
- Top customers rank by bookings placed. Bookings exclude provisional/draft and cancelled records. Historical placement dates must disclose estimates.
- New customers means Customer accounts created. Repeat customers booked before the reporting period.
- Won price uses the accepted submitted Quote version, with each currency reported separately and missing-price coverage visible.
- Quote loss reasons are categories, including customer-supplied reasons, not an average.
- Drop-off covers both commercial cohorts and measured application workflow attempts: lead creation/conversion, quote creation/sending and booking creation.
- Usage includes estimated active and idle time in focused Multideck windows, most active users and AI usage. Idle starts after five minutes; overlapping sessions are deduplicated. Do not equate activity estimates with productivity.
- Raw telemetry lasts 90 days; daily trends last 13 months. Existing audit and AI retention stay intact.
- Use complete UTC days with an equal preceding comparison. Billing allowances use their separately labelled billing period.

## Implementation sequence

1. Separate navigation, routing and permissions. Finance gets the existing financial report and old links redirect. Active Administrator/Company Admin actors get Admin analytics; ordinary colleagues and Finance Director-only users cannot read it.
2. Define and implement the reporting backend. Reuse real tenant-scoped operational records, preserve source-domain read permissions, distinguish historical estimates and incomplete data, and verify cross-tenant denial in PostgreSQL.
3. Build the four views using existing components and semantic tokens. Prioritise hierarchy and relevant charts; give the map equivalent keyboard access. Register the new reusable map in Components with source and usage.
4. Connect foreground usage and the agreed real workflows. Validate fixed event vocabularies server-side, derive the actor from Auth, confirm completion against actual source records, bound queues and exclude hidden/suspended intervals.
5. Follow the apple-design and animate skills. Motion provides feedback or continuity, respects reduced motion, and does not move data for decoration. Check typography, focus states, panel alignment and small-screen layout.
6. Document the Admin-only Dexter exception in chat and Watching for you together. Preserve existing commercial-source capabilities and their permissions.
7. Verify acceptance criteria and repair failures. Run the access regression suite, meaningful model/backend contracts, client typecheck/build, and browser checks for happy paths, loading, empty/failure states, keyboard and responsive layouts. Preserve unrelated concurrent edits.
8. Complete the audit with exact results and deployment status. Never treat a build or synthetic preview as proof of a live tenant integration.

## Visual research and resulting direction

The latest founder direction explicitly rejects repetitive stacked progress bars and keeps the geographic map.

- [Linear Insights](https://linear.app/docs/insights) pairs selectable charts with source detail. Use linked country, stage, loss-category and day readouts; customer rows open their real accounts.
- [Vercel Analytics](https://vercel.com/docs/analytics) keeps global periods, trend charts and concise breakdowns in a consistent plane. Use one reporting filter, a quiet KPI band and aligned panels.
- [Amplitude funnel interpretation](https://www.amplitude.com/docs/analytics/charts/funnel-analysis/funnel-analysis-interpret) makes cohort boundaries and drop-off definitions explicit. Show ordered cohorts with outcomes to date, without implying proven abandonment.

These are design inferences applied to Multideck, not a claim that one product is universally the best dashboard. The visual mix is an offline world heat map, a proportional loss-reason area map, a connected cohort journey, a daily usage calendar, shared-axis time-series charts, and customer/user tables. Ranking rows and workflow counts have no progress meters. Motion is limited to responsive pointer feedback; data quantities and keyboard inspection update immediately.

## Acceptance audit

- [x] Financial route/sidebar moved; existing Finance Director grants preserved by the new migration.
- [x] New Admin page and four focused views implemented.
- [x] Tenant-role, source permission, accepted-price currency, overlapping usage and retention database fixture passes.
- [x] World map source/usage and gallery preview added.
- [x] Review chart/data semantics and restricted-access states; separate currencies, missing-source states and coverage remain explicit.
- [x] Connect telemetry to the real workflow save/convert/send/confirm boundaries; hook lifecycle tests verify route, visibility and session changes. Database tests confirm source-record completion and idempotency.
- [x] Verify billing-period AI allowance separately from reporting-period requests, including exclusive period-end formatting and scoped failure recovery.
- [x] Complete Dexter chat/watch exception tests and lifecycle regression.
- [x] Run full mandatory PostgreSQL access regression, product-context assertion, client typecheck and production build.
- [x] Verify browser desktop/tablet/mobile, keyboard, loading, empty, source-restricted, forbidden and recoverable failure states. Preview console has no errors/warnings; live authenticated network verification remains a release check below.
- [x] Review final scoped diff, remove temporary preview entry points and record live-service/deployment limitations.

## Verification evidence and release limits

Local verification completed on 29 September 2026:

- The required PostgreSQL runner passed **152 tests (143 suite tests plus nine access contracts), zero failures and zero skips**. Coverage includes different tenant actors, ordinary colleagues, Finance Director-only actors, active Company Admins, inactive/revoked/unlinked accounts, source read permissions, Auth IDs distinct from internal user IDs, accepted submitted prices, malformed/missing price data, overlapping time intervals, confirmed workflow outcomes and retention maintenance.
- Client typecheck, product-context assertion and production Vite build passed. The build retains its warning about large application/gallery chunks; no warning was suppressed.
- Chrome verified the actual dashboard components using a temporary isolated synthetic-data harness at desktop 1280 px, tablet 768 px and mobile 390 px, including dark theme and both English regional date formats. No page-width overflow appeared. The harness and its entry point were removed; production code imports no fixture data.
- Keyboard inspection was exercised for tabs, country selection including Singapore, conversion stages, loss categories and calendar days. Currency selection, custom range rejection/application, seven- and ninety-day presets, loading, empty results, restricted sources, a 403, report retry and billing-panel retry were checked. Admin data values update immediately; hover/focus feedback and reduced-motion CSS retain their intended behaviour.
- Signed-out `/admin` and `/finance/dashboard` reach the real invite-only sign-in screen. The initial local audit had no authenticated session; the subsequent deployment audit below records the real administrator journey. Source-changing commercial workflows remain covered by the database and hook contracts, without writing artificial business records to the live tenant.
- Visual evidence uses synthetic data: [Overview preview](/Users/harryphillips/.codex/visualizations/2026/09/29/admin-dashboard/overview-preview.jpg), [Growth preview](/Users/harryphillips/.codex/visualizations/2026/09/29/admin-dashboard/growth-preview.jpg), [Usage preview](/Users/harryphillips/.codex/visualizations/2026/09/29/admin-dashboard/usage-preview.jpg).

### Authorised backend deployment and real-data audit

The founder subsequently authorised backend deployment and a CleanShot Studio recording using real tenant records, with the exported video sent to their Slack DM.

- Verified the local public configuration and the documented App deployment both identify **Multideck Dev**, Supabase project `aqtwypsuijxlnvtxpuxe` (MultiDeck, eu-west-2, ACTIVE_HEALTHY). No other project was changed.
- Re-ran the mandatory runner before deployment: **152 passed, zero failures/skips**. Applied `admin_dashboard_and_usage`; the management API recorded version **20260929223313**, corresponding to local source `20260929230000_admin_dashboard_and_usage.sql`. This follows the existing management-API migration naming pattern; do not re-apply it under the local timestamp.
- Deployed **admin-dashboard version 1**. Its custom authentication validates the session with Supabase Auth, checks the active linked profile, and calls actor-bound RPCs. Anonymous and invalid-session HTTP requests both return **401**. Retrieved deployed files match the submitted source after normalising the management API's `supabase/` path prefix.
- Deployed **agent-dexter version 308** by adding only the two Admin chat/watch exception paragraphs to the retrieved live version 307 bundle. Unrelated deployed capabilities were preserved. Retrieved deployed files match that submitted bundle.
- Ran the operational probe before and after: all **12 active operators** retained identical company header, detail, document and register visibility. Ran [Admin live preflight](../../supabase/tests/admin-dashboard-live-preflight.sql): all **five active administrators** can read, **seven ordinary colleagues** are denied, an unlinked foreign actor is denied, anonymous execution is unavailable, and browser roles cannot read raw telemetry or run retention. Admin booking counts match the actual company-scoped sources. The existing financial permission remains assigned only to **Finance Director**.
- Confirmed all six analytics tables have RLS and no direct anonymous/authenticated reads. The retention job is active at **03:15 UTC daily**. Real usage from the authenticated client persists in the deployed database; no historical usage was manufactured.
- Signed into the actual local App through Harry's existing linked Google administrator account. The real 30-day report shows 11 bookings, nine new customer accounts, four repeat customers and six recorded quote wins; the 90-day report includes 79 bookings, eight decisions and accepted submitted GBP prices. The tenant contains existing demo-labelled accounts, which remain visibly labelled. These are live stored tenant records, not the removed synthetic preview fixture.
- The authenticated Admin page has no observed console errors or warnings. Billing allowance loads successfully from the live service and remains separately dated. A live cohort exposed a caption issue: cumulative unreached count now uses the starting cohort. Typecheck and production build passed after that correction; the existing large-chunk warning remains.

The client is still the local implementation at `http://localhost:3000`, connected to the deployed Dev backend; a frontend deployment has not been performed or claimed. Recording/export/Slack delivery is pending the Mac being manually unlocked. Native computer control reported that automatic unlock failed, so CleanShot recording cannot proceed until the user unlocks the Mac.

Usage history begins with deployment and measurement; it is not backfilled from audits or presence. The release procedure is recorded in [Admin analytics](../architecture/admin-analytics.md).

Concurrent quote-intelligence work was preserved. Its unapplied migration received only a transaction wrapper needed by the ordered migration contract; the Admin additions to shared workflow and gallery files are scoped to this dashboard.
