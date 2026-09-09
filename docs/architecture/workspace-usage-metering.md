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
