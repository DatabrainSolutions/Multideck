# Admin analytics

The financial dashboard lives at `/finance/dashboard`; `Finance.Director.Dashboard.View` and all existing role mappings are unchanged. The old `/admin/finance-dashboard` URL redirects. Finance Directors without an administrator role cannot access the new Admin report. `/admin` is restricted to active linked Administrator or Company Admin actors, independently of the financial permission. Source-domain read permissions still apply to commercial and system figures.

Reporting uses complete UTC days and an equal preceding period. Bookings are first non-provisional placements, excluding current cancellations and deleted/development fixtures. Historical first-placement timestamps are unavailable, so historical creation dates are labelled estimates. Customer creation requires the Customer organisation type. Repeat customers booked before the reporting period. Accepted prices come only from the accepted submitted version; currencies stay separate. Missing outcome dates and incomplete submitted prices are disclosed, rather than replaced by current drafts.

Lead and quote funnels follow cohorts created or first sent during the period and show outcomes to date. Lead response time includes only recorded first responses. No response is separate from a customer decision. Loss reasons are categorical, with customer-supplied reasons labelled separately. Application workflow attempts cover create lead, convert lead, create quote, send quote and create booking. Completion requires a confirmed company-scoped source record. Unfinished attempts have no recorded completion/cancellation after 24 hours; this is not proof of abandonment.

Foreground active/idle estimates record fixed module names and timestamps, never form values, addresses, URLs, keystrokes or content. Five minutes without interaction marks idle. Hidden/unfocused windows and timer gaps over one minute are excluded. UTC-day interval unions deduplicate overlapping sessions per person; active takes precedence over idle. Module time may overlap across devices; the overall total remains deduplicated. Failed ingestion does not block work or fill historical gaps.

Raw usage detail and workflow attempts expire after 90 days. Expired attempts retain daily counts, not person-level detail or last steps. Daily trends expire after 13 months. The maintenance function is service-only and runs daily through pg_cron when available. Existing audit and AI egress retention are unchanged. The billing allowance has its own billing-period basis; provider requests and tokens are not billed-credit equivalents.

## Explicit Dexter parity exception

Employee active/idle estimates, employee rankings and instrumented workflow completion/drop-off are intentionally unsupported in both Dexter chat and Watching for you. Their source tables have no authenticated read grants and no Dexter domain/watch adapter. The assistant must explain the limitation and direct administrators to Admin > Dashboard, without inferring employee activity from presence, audits or AI calls. Commercial records and their existing deterministic watches retain their original permissions and lifecycle.

## Release validation

Run the PostgreSQL access regression runner, the Admin model tests, and the client build. Before an authorised tenant release, identify the intended separate Supabase project and probe active Administrator, Company Admin, ordinary permitted colleague, Finance Director, revoked/inactive/unlinked and foreign actors. Apply the new migration and deploy `admin-dashboard` and the scoped Dexter prompt together with the client. Confirm the cron job exists and runs, then repeat access probes and the authenticated browser journeys. No production release or live verification is implied by local test results.
