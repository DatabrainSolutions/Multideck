# Contact-card readiness

## Release scope

App only. Customer portal and Cloud projects are unchanged. The target selected
for local review is `localhost:3000`, using the `aqtwypsuijxlnvtxpuxe` development
backend. No customer-tenant migration or card publication is implied.

Apply `20260907201057_contact_card_visit_reliability.sql` before releasing the
matching client. The new client requires `multideck_contact_card_record_scan_v2`;
it deliberately does not fall back to inaccurate legacy tracking. If the migration
is missing, the visitor's form remains intact and submission reports an error.
The migration preserves the existing six-argument scan API for old clients.

## Counting contract

- A visit is a public page open, not proof that a camera scanned a physical code.
- QR exports contain `source=qr`; copied links contain `source=link`. Untagged
  links are unknown. Historical `direct-scan` entries have unreliable attribution
  and are shown as `Unattributed (legacy)`.
- Each page open has a random request ID. Retrying that request returns the same
  scan capability, without incrementing totals or consuming another rate-limit slot.
- A random per-card, per-tab session expires after 30 minutes of inactivity.
  It is not a unique-person measurement or a fingerprint. Unavailable browser
  storage falls back to a new session per open. Historical visits with no session
  ID count separately; they cannot be retrospectively deduplicated accurately.
- Conversion is the share of sessions with at least one confirmed exchange.
  Two submissions in one session do not produce a conversion rate above 100%.
- Preview mode neither records visits nor writes a lead. Public reads recheck
  publication and return the server's public field projection, not workspace cache.
- New visits do not collect location. Historical location suppression is retained.

## Submission contract

The server validates a recent scan belonging to the same published card and locks
it for the transaction. Repeating the same input confirms the original result;
different input cannot reuse a consumed capability. Existing CRM records are not
modified by email matching. Request limits, required phone, field types and lengths,
hidden phone and disabled marketing consent are enforced server-side.

On an uncertain network response, the client retains the exact submission and
locks the fields while offering a safe retry. Explicit database rejection permits
correction. Expired sessions can be renewed without losing the entered details.

## Dexter and Watching for you exception

Contact-card analytics reads and telemetry watches have no dedicated connected
Dexter domain. Adding one requires a separate permissioned aggregate-read adapter
and bounded deterministic event design; anonymous, high-volume visit signals must
not be used to generate recurring model calls or fabricate operator activity.
Chat now explicitly directs those requests to the card's Analytics/QR tabs and
declines scan/session watches. Public telemetry and submission RPCs are never
allowlisted AI writes. The existing permissioned lead-note compiler and CRM lead
reads/watches are retained; retry protection prevents duplicate lead/automation
events rather than introducing a new watch domain.

## Verification boundaries

The PostgreSQL fixture runs the real scan, submission and analytics functions in
an isolated local server. It verifies locking, idempotency, publication/cross-card
denials, anonymous table/analytics denial, validation, limits and counts. Unrelated
CRM field mapping and automation actions are isolated stubs: it proves invocation
counts and transaction boundaries, not email/provider delivery.

Independent `jsQR` decoding is performed on SVG artwork rasterised by `sharp`.
The test suite exercises the supported versions, styles, error correction, logo
coverage and actual destination URLs. This is not a substitute for scanning the
final physical print on the recipient's phone, under its actual lighting and size.

Local codes explicitly warn that localhost will not open on another device.
Generate production artwork on the intended tenant's published HTTPS origin.

## Outstanding release gates

- Attach the prepared frontend deployment to `dev.multideck.app` using an account
  with domain access, then verify the served version and HTTPS browser journey.
  Development Dexter version 170 is deployed and read back (details below).
- Customer tenant rollout requires its own explicit target and deployment approval.
- Scan the final printed artwork on physical iOS/Android devices before distribution.

### Prepared development release target

Read-only Vercel checks confirm that `dev.multideck.app` resolves to project
`multideck-app-dev` (`prj_Z8F1DDOmYitMo4Ryl20CfO9tMux1`) in team
`team_87y8i5Fqi5jazTLBx2kPS5TX`. The project also lists root/other domains, so a
blanket production promotion must not be used for this scoped development release.
After approval, build a focused deployment containing the contact-card changes,
bind only `dev.multideck.app`, and verify the hostname/backend configuration and
served version. Preserve the concurrent Inbox, navigation and notification edits;
do not publish them implicitly. Deploy the scoped Dexter update only to
`aqtwypsuijxlnvtxpuxe`. The user subsequently approved this development-only release.

### Approved release attempt — 7 September 2026

- Prepared a separate local checkout at
  `/tmp/multideck-contact-release.Kxriwr/source`, based on
  `5209c75e093f96236437b5f88fb3c0a461fb0175` plus the scoped contact-card files.
  Uncommitted Inbox, sidebar, notification and reporting changes were excluded.
  The original checkout was preserved; no commit or push was performed.
- The downloaded Preview/dev environment had empty Supabase URL/public-key
  values and omitted the local build's project name. The product guard blocked
  the first build. Supplied the already-verified development public configuration
  and project name in this release checkout only; no guard or shared Vercel
  setting was changed. Host binding remains `dev.multideck.app` and the backend
  remains `aqtwypsuijxlnvtxpuxe`. The corrected build and all 68 tests passed.
- Uploaded the prebuilt frontend as a Preview deployment with no production
  promotion: `dpl_F34mg6RnE7xShVFkPdzjVGe6WCyA`, status `READY`, URL
  `https://multideck-app-2pww262b2-databrain-solutions.vercel.app`.
  Intended entry asset: `/assets/app-CFLMoaNt.js`.
- **Domain assignment failed.** Vercel CLI account `harry-2713` can deploy to the
  project but reports no access to `dev.multideck.app` or `multideck.app` under
  team `databrain-solutions`. No domain transfer or production promotion was
  attempted. Read-back still maps `dev.multideck.app` to the previous deployment
  `dpl_2XLxnsesuxGRmUF8dcbEj4rxahBE`; HTTP serves `/assets/app-Bw_ztGyP.js`.
  The new frontend is uploaded, **not confirmed live on the intended domain**.
- Deployed development `agent-dexter` version **170**, preserving all 25 files
  from deployed version 169 except the two reviewed contact-card prompt changes.
  Read-back matched the complete intended bundle. JWT verification stays enabled;
  an unauthenticated POST returned 401.
- To finish, an account with domain access must assign only `dev.multideck.app`
  to the prepared deployment. Verify the served entry asset and real HTTPS card
  journey afterwards. Do not weaken hostname checks to make the temporary
  deployment URL act as a tenant origin. Customer domains were not changed.

## Verified locally (7 September 2026)

- All 68 contact-card/QR tests pass, and the production client build succeeds.
  The build retains the existing large-chunk warning; this is not deployment proof.
- Real PostgreSQL: seven lifecycle/concurrency cases plus migration application
  pass, including visit and submission limits, separate sessions, repeated
  conversion, cross-card/expiry denials and preserving existing CRM contacts.
- Independent decoder: all 30 version/error-correction combinations, nine
  module/eye combinations, supported logo coverage and both 192px/384px outputs.
  Actual local/tenant URLs also decode with a logo and mild raster blur.
- Files downloaded through the real App PNG/SVG buttons both decode exactly to
  `http://localhost:3000/card/test?source=qr`; the copied link uses `source=link`.
- The selected draft's public URL is inactive. Authenticated preview, validation,
  successful preview exchange and the retry button after a blocked API request
  were checked in Chrome. No real lead was submitted during these checks.
- Mobile form inputs retain 16px text and field limits. Completion was checked at
  an actual 390px CSS viewport with no horizontal overflow and full-height card
  background. Browser scaling initially distorted the test viewport; explicit
  metrics were used to verify the final measurement.
- Completion now focuses its heading after the form exit animation, rather than
  attempting focus before that heading exists. Reduced-motion completion was
  checked; press feedback is restrained and no first-render entrance was added.
- Before the approved migration, backend read-back confirmed that the selected
  card remained a draft with zero visits and exchanges after preview tests.
  Tracking v2 was not installed at that stage; the later verification below
  confirms its installation.

## Development backend verified after approval (7 September 2026)

- Applied the exact reliability migration to `aqtwypsuijxlnvtxpuxe`. Read back
  tracking v2 and its grants; anonymous visits are allowed, private analytics are
  not. The local migration filename matches the server-assigned version
  `20260907201057`; its SQL content is unchanged from the approved file.
- Restarted App on port 3000. Used the already-published `harry-phillips` card,
  without publishing or altering the selected `test` draft.
- A QR open and a reload created two visits in one session. Opening the shared
  link in another tab created a third visit and a second session. Analytics show
  two `QR code link` events and one `Shared link`, separately from 88 legacy visits.
  Retrying an existing visit request returned its original scan ID.
- Downloaded PNG and SVG from the published Harry Phillips card's real QR tab;
  both independently decode to `http://localhost:3000/card/harry-phillips?source=qr`,
  the same public route used for the completed form and attribution checks.
- Submitted one explicitly labelled development QA lead using
  `contact-card-qa-20260907@example.invalid`, with marketing consent unchecked.
  Its enabled automation actions were inspected before submission: none were
  enabled, and no outreach was requested. The QA lead remains in development as
  verification evidence; it is not a genuine sales enquiry.
- The first network interruption stopped preflight and created no records. The
  subsequent POST returned 200 and committed one lead/exchange/run; its response
  was held until the client's timeout. The browser retained and locked the exact
  input, showed uncertain-result guidance, then `Try again` confirmed success.
  Database read-back after retry still showed exactly one lead, one exchange and
  one automation run for that input, with marketing consent false.
- The real operator Analytics page matched the database after submission: 90
  visits, 89 sessions, five starts, two exchanges and 2.2% conversion (including
  historical activity). After the additional shared-link check: 91 visits and
  90 sessions, with exchanges unchanged.
- Anonymous HTTP checks against the development backend passed: published card
  readable; draft card hidden; draft visit creates no scan; raw scans and private
  analytics return 401; a submission using an unknown scan returns validation
  error 22023. The selected draft still has zero visits and zero exchanges.
- Response interception was cleared after testing. No browser network override
  remains from this test.

These prove local-client integration with the migrated development backend, not
frontend deployment, customer-tenant rollout, or physical camera/print certification.
No customer tenant or draft publication was changed.
