# Workspace usage metering

The Admin usage page reports provider-backed workspace activity in customer-facing product units. Internal provider cost and allowance values stay server-only.

## Metering boundaries

| Category | Counted event | Failed or repeated work |
| --- | --- | --- |
| AI usage | A governed OpenAI request settles as `succeeded`, plus a Gemini transcription request accepted by the provider | Failed provider calls are excluded. Every successful Luna or Terra request is counted. |
| OCR usage | A governed Mistral OCR request settles as `succeeded` | Counts provider-processed pages. Failed OCR calls are excluded. |
| Shipment tracking | No provider event is connected yet | The Admin card stays `not_connected` and must not imply zero live use. |
| Generated documents | A Carbone `DOCB_RenderJobs` record reaches `completed` | Failed renders are excluded. A completed operational render counts once. |
| Customs | The first provider submission for a distinct Multideck declaration in the month | Draft creation, validation, acceptance and clearance do not add units. Rejection or later status changes do not double-count the same declaration. |

Gemini transcription remains subject to its per-operator safety cap, but its successful cost also consumes the pooled workspace AI allowance. A new transcription reservation must have room in both limits.

## iCustoms billing evidence

iCustoms' public customs software guide describes low-volume pricing as payment "per declaration submitted" and describes acceptance and clearance as later lifecycle events. Its public terms say subscription payment follows the selected package, but do not publish the API or enterprise retry and amendment charging rules.

The current Multideck boundary is therefore one distinct declaration at first submission. Before this usage is used for an invoice, confirm the tenant's signed iCustoms order form or obtain written confirmation covering rejected submissions, resubmissions, amendments and cancellations.

Sources:

- [iCustoms customs software guide](https://www.icustoms.ai/blogs/customs-software-explained-all-you-need-to-know/)
- [iCustoms terms and conditions](https://www.icustoms.ai/terms-conditions/)

## Dexter and Watching for you

Dexter reads the same tenant-scoped usage categories as Admin, without team-level or internal-cost fields. Usage changes emit deterministic `usage` watch signals after successful AI, OCR, document and Customs events. There is no recurring LLM polling and no Dexter write action for allowances or billing.

## Contracted seats and September 2026 pricing

`20260921120000_paid_seat_pricing_and_capacity.sql` introduces a server-managed
`AIUsagePolicy_PaidSeats` value. It is the contracted count, never the number of
active users or the maximum size of the marketing bracket. Basic (1–10), Pro
(11–25), Ultra (26–50) have GBP 1,995 / 2,995 / 3,995 monthly base fees plus GBP
149 per paid seat. Enterprise remains bespoke, so its monthly quote is null.

Only trusted Multideck provisioning may set paid seats and explicit AI/document
overrides on the existing service-only policy table. Tenant administrators can
read their own subscription, request changes, and manage users; they cannot grant
themselves paid capacity. Changes are logged in `AI_SubscriptionChanges`. A
configured count cannot be reduced below occupied seats.

Existing contracts and explicit IncludedGbp values are preserved until a paid
count is configured. Legacy admission uses the existing 10/25/50 plan ceiling;
an Enterprise contract without a confirmed paid count blocks new admissions.
Before rolling this migration to a tenant, confirm its contracted count and
carry any bespoke allowance into `AIUsagePolicy_AiOverrideGbp` and
`AIUsagePolicy_DocumentOverride`. Do not bulk infer paid seats from active users.
The Billing screen says when contractual pricing is unconfirmed.

For configured contracts the AI pool is USD 50 per seat per calendar month,
converted using the governed ledger's existing fixed 0.8 GBP/USD convention
(GBP 40 per seat); this is separate from the spreadsheet's commercial FX.
Historical provider charges are not repriced. AI, transcription and voice retain
their existing pooled enforcement and separate safety limits. Document capacity
is 1,000 completed Carbone renders per paid seat per month; queued/rendering jobs
reserve capacity, failed jobs release it, and unfinished jobs continue to reserve
capacity across month boundaries. OCR uses 1,000 pages per paid seat. Customs and
tracking contracts are unchanged; tracking remains explicitly not connected.

A company row lock serialises user admission and document reservations. Active
workspace profiles, including pending invitations, occupy seats; deactivated or
deleted profiles do not. Database triggers cover insert, company transfer and
reactivation, including direct server/import writes. Team preflight checks reject
full workspaces before calling the invitation provider; the database remains the
final authority against races. Existing over-cap users are not deactivated by the
migration. Only admissions that increase occupancy are blocked.

Dexter and Watching for you continue reading the same allowance categories and
successful usage events. Subscription provisioning, seat purchase and changing
billing contracts are intentionally unsupported Dexter actions: they require
Multideck's trusted provisioning boundary and must not be offered as chat writes.
There is no recurring AI polling and no automated billing/charging in this change.

Release proof: the migration and Edge Function must be deployed together to each
intended tenant before the UI can enforce the new contract. A Git dev push is not
a database deployment. Run the paid-seat PostgreSQL test and data-access runner;
then verify invitations and reactivation with a configured tenant before rollout.
