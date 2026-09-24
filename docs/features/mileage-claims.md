# Trips & mileage

Multideck-owned internal workflow. Employees record a trip under Sales & CRM → Trips & mileage, review the route and amount, then submit. With approval disabled, the claim enters Finance → Mileage payments immediately. With approval enabled, an assigned approver or workspace administrator must approve another employee’s claim first. Finance records a payment reference after making the transfer externally; Multideck does not send money.

## Access and records

The existing authenticated `cmp_Users` identity supplies the workspace and claimant. No new login or tenant model. Claims and route data are personal: claimant, assigned approver (submitted claims), existing `Finance.ReviewAndPost` permission (submitted claims), and workspace administrators. Writes use the version-checked `multideck_mileage` RPC; direct browser table access is revoked and RLS is enabled. Inactive, unlinked, anonymous and foreign-workspace callers are denied. Only an employee can edit their own draft/returned trip. No self-approval, arbitrary amount overrides or repeat payment. Changes are audited and generate existing Multideck in-app notifications in the same transaction.

The company field filters accessible CRM companies as the employee types and also accepts a manual name. Selecting a CRM company creates the bounded Recent visits projection: employee, trip date and business purpose. A manual name stays on the claim without creating a CRM link. Recent visits exclude draft/returned trips, home addresses, mileage and reimbursement amounts. A permitted colleague can see visits without gaining expense access. An employee’s historical visits survive deactivation.

## Calculations

The database owns the calculator used for preview and submission; the browser does not supply authoritative rates or amounts. Submission serialises claims per employee, allocates the remaining 10,000-mile high-rate allowance, and snapshots the result. Rejected claims release their allocated high-band miles. Changes to policy never recalculate submitted claims or bypass a pending approval.

UK personal-car mileage: 45p before 6 April 2026, 55p from that date, then 25p after the annual threshold. Motorcycle 24p; bicycle 20p. Company-car advisory rates are date-effective from September 2025 through November 2026 and fail closed outside that reviewed range. Petrol/diesel hybrids use their corresponding fuel/engine band. Electric rates distinguish home/public charging. An optional administrator-set electric rate is explicitly labelled a workspace override, not an HMRC rate.

Sources checked 21 September 2026:
- https://www.gov.uk/expenses-and-benefits-business-travel-mileage/rules-for-tax
- https://www.gov.uk/guidance/advisory-fuel-rates

Before an employee’s first submission for a tax year, administrators can set personal-car mileage already claimed in the previous system. This preserves the allowance when moving from Trip Track. Existing claims, vehicles and users are not imported automatically.

The journey uses the shared WizardDialog with Journey → Visit → Route → Summary. Journey collects the route and vehicle, Visit collects the company and business purpose, and Route calculates road mileage automatically and allows an override with a reason. The desktop Route step places mileage and claim cost above the override controls on the left, with the map on the right. Suggested reasons populate the editable reason field; rate details and optional odometer evidence expand on demand. Narrow screens stack the panels with the wizard footer always available. The final step summarises the claim before creation and submission. Back preserves entered values, and no trip is created by moving between steps. Return to start appends the origin after every additional stop and the destination; it does not repeat the outbound stops in reverse. Google Routes is used when a server key exists; otherwise OpenStreetMap/OSRM supplies actual road geometry. Full UK postcodes use Postcodes.io coordinates, clearly marked approximate. Other locations use Photon and ambiguous results require a full postcode. A Leaflet map displays the returned road geometry, including when mileage is overridden.

A server-owned quote binds distance to the claimant and reviewed inputs. Caller-private quotes are cached for 24 hours. Provider attempts are limited to 100 per employee per day; uploads and Luna reading share that allowance. Public provider calls use a database-backed per-project throttle with bounded retries. Default public OSRM/Photon endpoints are for low-volume use, have no service guarantee and must be replaced by dedicated endpoints before wider tenant rollout. The per-project throttle does not coordinate separate tenant deployments. Configure `MILEAGE_OSRM_URL` and `MILEAGE_PHOTON_URL` server-side for that rollout.

Confirmation permits a mileage override with a reason and optional before/after odometer photos. JPEG, PNG and WebP photos up to 5 MB are stored immutably in a private bucket, with signed previews issued only after claim access checks. Luna can suggest a visible odometer reading on explicit request through the governed model gateway; the claimant must review and apply it. Luna does not invent road distances. Unattached photo uploads are not automatically deleted; a retention policy is required before widespread use.

`confirm` saves and submits in a single transaction, checks the reviewed amount and approval setting, and uses a claimant-scoped submission key to make retries idempotent. If the amount or approval policy changed, the entire transaction rolls back for another review. No approval sends the claim directly to accounts; enabled approval retains the existing approval gate. Reopening a draft preserves its existing photo references and blocks submission if those photos cannot be loaded.

## Setup and release

1. Run `node supabase/tests/run-data-access-regression.mjs` and the focused mileage tests.
2. In the explicitly authorised tenant only, apply the base mileage migration, `20260921190326_mileage_company_name.sql`, then `20260921192805_mileage_review_submission.sql`. Deploy `mileage-route`, `mileage-evidence`, and updated `agent-dexter`.
3. No Google key is required for the default routing/map flow. Optional Google routing uses server-only `GOOGLE_MAPS_API_KEY`; no browser Maps Embed key is needed. Optional Luna photo reading uses the existing `OPENAI_API_KEY` or `OPEN_API_KEY` and workspace AI policy.
4. Review approval settings, active approvers, existing Finance permissions and imported tax-year balances before staff start submitting.
5. Verify the real tenant URL, route/map, private photo upload/read access, Luna review, notifications, persistence, role revocation and cross-tenant denial before calling the feature live.

A provider failure preserves the journey and offers retry or an explicit manual override on the confirmation view. No email sender or one-click email approval endpoint is introduced. Saved vehicles/templates, delegated trip entry, server PDF documents and historical Trip Track import are outside this core implementation. The existing DataTable CSV export explicitly covers selected rows from the current page.

## Dexter support boundary

The registered `mileage` domain reads allowed claim summaries with IDs, GBP amounts, rate basis, status, version, timestamps and source links. It rechecks the active actor’s company and the exact claim boundary. Source routes are included in evidence; private origin/destination details are not exposed through the summary adapter.

Explicit unsupported exception: route calculation, claim writes, approval/payment recording and mileage Watching for you rules have no reviewed write/private-claim watch adapter. They must return unsupported and direct users to the native workflow. Existing generic Finance actions and company watches cannot substitute for them. This avoids exposing private employee claims through the existing company-scoped watch evaluator or bypassing the dedicated financial review. Chat and watch-generation prompts both state this boundary. Claim notifications are deterministic transactional notifications, not saved Dexter watches or recurring LLM evaluations.

## Local verification

Verified locally on 21 September 2026: production client build, Edge Function type check, full PostgreSQL access regression, focused route/calculation contracts, and Chrome against the production page backed by disposable PostgreSQL. The browser journey covered manual entry after a Google-configuration failure, amount preview, save/submit, optional approval, payment reference persistence after reload, foreign-workspace denial, 390px layouts, keyboard selection and modal focus restoration, reduced motion, and both English date regions. Finance defaults to ready-for-payment claims; sorting is applied before server pagination. CRM visit privacy is covered by the database contract; the full live company page and live Dexter conversation remain release checks.


- Real PostgreSQL tests: lifecycle with and without approval, return/edit/resubmit, duplicate/stale transitions, payment reference, personal/CRM visibility, active role mappings, revoked/inactive/anonymous/foreign identity, immutable amounts, tax-year/rate boundaries, opening mileage, and forged/foreign route quotes.
- `node --test supabase/tests/mileage-claims-postgres.test.mjs supabase/tests/mileage-route.test.mjs`
- `node multideck.client/tests/mileage-preview/serve.mjs` starts a disposable socket-only PostgreSQL and separate UI QA server on `127.0.0.1:3001`. It uses the production page and migration, synthetic identities and no hosted credentials. Stop the process to remove its database. App remains on port 3000. The QA entry point is not part of the production bundle.

Review-flow verification on 21 September 2026: production build; Edge type checks; full access regression; focused atomic-confirmation, reviewed-amount rollback, retry and photo-ownership contracts. A real OSRM request returned 29.41 miles and road geometry for WF10 5YL → LS1 1UR → start. Chrome on the disposable database verified automatic calculation, an additional stop followed by the final return location, mileage override, atomic confirmation and the resulting ready-for-payment record with its route retained. Hosted photo storage and Luna execution still require tenant verification.

Local proof does not establish hosted deployment, live photo/Luna execution, notification email delivery or a bank transfer.

Shared-wizard verification on 21 September 2026: Chrome verified required-field focus, route calculation on step two, a 17-mile override (£9.35), keyboard Next, Back preserving the override, 390px mobile steps with fixed navigation and focus/scroll reset, and final confirmation creating a ready-for-payment record in disposable PostgreSQL. The Development route function was separately exercised from localhost; no real claim was submitted there.
