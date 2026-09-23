# Source-backed sales themes

The automatic saved sales result can classify recorded sales feedback into themes. The model groups source text; current CRM records supply outcome, pipeline, stage and owner data. Any graph built from a theme counts distinct deals from its cited narrative cohort, rather than treating a model-authored number as a measurement. The existing queue, six-hour company limit, unchanged-evidence skip and finite retries still govern generation. Reading, filtering and reprojecting current metadata never call a model. Narrative window timestamps and current deal joins are excluded from the classification fingerprint; source text, membership dates, coverage counts and measured evidence remain part of it.

## Canonical narrative contract

Migration `20260922170000_crm_sales_narrative_evidence.sql` wraps the canonical `multideck_crm_get_sales_insights(p_days,p_pipeline_id,p_owner_id)` and adds:

```ts
narrative: {
  version: 1,
  from: string,
  to: string,
  totalDocuments: number,
  includedDocuments: number,
  totalDeals: number,
  includedDeals: number,
  truncated: boolean,
  documents: Array<{
    id: string,
    dealId: string,
    kind: 'loss_feedback' | 'action_outcome',
    text: string,
    recordedAt: string
  }>,
  deals: Array<{
    id: string,
    name: string,
    outcome: 'open' | 'won' | 'lost',
    closedAt: string | null,
    ownerId: string | null,
    pipelineId: string,
    pipelineName: string,
    stageId: string,
    stageName: string,
    daysInStage: number | null
  }>
}
```

The company comes from the current unique, active linked operator with `CRM.Read`. Existing period/pipeline/owner validation remains authoritative. Document dates are restricted to the snapshot period, using the deal's current owner and pipeline. The automatic worker always requests the company-wide 90-day scope.

Documents are ordered by recorded date descending and source ID ascending, capped at 40, with each text limited to its first 600 characters. IDs are `loss_feedback:<deal UUID>` or `action_outcome:<action UUID>`. `totalDocuments` counts every eligible document before the cap; `totalDeals` counts their unique deals. Included counts describe the bounded selected documents and their unique deals. `truncated` identifies a document cap, and `deals` contains exactly the selected unique cohort. Empty eligible narrative has empty arrays and zero included counts. These denominators are not the whole pipeline and must not be presented as a general sales win rate.

`daysInStage` is the measured current age of an open deal's current stage, using the same recorded entry/reopen history as native metrics. Unknown entry time and closed deals return null. `closedAt` is the actual current won/lost timestamp; legacy unknown dates remain null.

## Eligible sources and explicit exclusions

Eligible text consists of current lost-deal feedback with a recorded loss timestamp, and completed shared `CRM_DealActions` outcome notes with a recorded completion timestamp. Both already appear on the shared deal detail. Blank notes, cancelled/open actions, deleted or non-visible deals, foreign-company actions, fixture records, old dates and future dates are excluded. An inactive author does not remove company history. Task bodies, personal task records, mailbox messages, call transcripts and arbitrary activity summaries are never read by this capability.

`deal_note` is unsupported and rejected by the worker contract. Inspection of the native schema and migration chain found `CRM_Notes` with RLS enabled and no shared operator read policy or canonical deal-note reader. Even an `internal` sensitivity label does not establish shared visibility. This migration therefore does not read those notes or broaden their policy. Dexter's registry explicitly describes this limitation; it must not claim access to restricted or personal notes. A future shared-note workflow needs its own authorised read boundary and lifecycle tests before becoming a narrative source. `IsTrainingAllowed` is not repurposed as permission to expose note content.

## Saved classification and current measurements

The worker's version-3 result adds `schemaVersion:3`, generated `themes` and narrative coverage/cohort metadata to the backward-compatible saved result. Each theme membership contains the validated source ID, deal ID, kind, recorded date and verbatim source excerpt. Numeric outcome/stage counts are derived from canonical deal metadata and distinct membership deal IDs. The raw full source body is not part of the saved page result.

On `multideck_crm_get_sales_briefing()`, a version-3 result's `narrative.deals` is reprojected from currently authorised CRM rows for that saved cohort. `result.metricsAsOf` records this current measurement time, while the original generated/source dates remain unchanged. Owner, stage and outcome charts can therefore follow current CRM state without waiting for another classification. Current chart filters must be applied to this measured metadata and membership dates. A classification remains generated interpretation of its recorded excerpts, not evidence of causation or complete historical coverage.

## Source revocation and queue invalidation

The existing complete deal-source guard is extended by private lease/result narrative manifests. Each selected source records its type, ID, linked deal and a signature of its complete text and recorded timestamp. The signature is internal and never returned to clients or sent to a model.

Before provider work and completion, the exact lease must still have current actor access and all selected source signatures. Movement, deletion, cancellation, cleared feedback or edited text invalidates the source immediately. A saved result with an invalid source returns `result:null`, `generatedAt:null`, `resultWithheld:true` and `status:'pending'`, including through Dexter. A source change forces `lastFingerprint:null` on the next claim and prohibits a skipped completion, even if bounded chart aggregates are identical. The previous good result remains stored privately for audit/recovery but is not returned while its source set is invalid.

Completed-action source inserts/updates/deletes queue the old and new company where relevant. Loss feedback already participates in the recorded deal-change queue. Migration applies one upgrade invalidation to existing company rows, preserving their cooldown. Private/unsupported notes never trigger model work. There is no recurring model polling or page-triggered generation.

## Dexter and verification

The existing `sales_insights` domain reads the bounded canonical narrative; `sales_briefing` reads saved generated themes with current measured metadata and the same source guard. The existing deterministic saved-fingerprint watch fires when a changed saved result is completed, not on a read or unchanged comparison. Pause/resume, current role/owner access and company scope remain enforced. No new narrative write action is added: source completion/loss editing uses the existing approved CRM workflow, while generated classification is read-only.

`supabase/tests/crm-sales-narrative-postgres.test.mjs` applies the real incremental migrations to temporary PostgreSQL. It exercises native loss/action completion, source caps and complete denominators, periods and owner/pipeline filters, same-company colleague and foreign access, unreadable notes, source edit/delete/move/clear suppression, exact leases, current saved-cohort projection, and real Dexter watch creation/evaluation/pause/resume/revocation. No provider or live tenant calls occur in this test.
