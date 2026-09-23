# CRM sales workflow

Incremental migration: `20260922140000_crm_deal_sales_workflow.sql`.

Browser RPCs use the current authenticated, active, linked operator and require CRM.Read; mutations additionally require CRM.Write. Same-workspace permitted colleagues can read all shared deals and history regardless of ownership. Personal To Do records remain private. New RPCs return the existing deal JSON enriched with `nextAction`, `actionHistory`, `loss`, `isLost`, `lostAt` and `editVersion`.

- `multideck_crm_deal_people(p_deal_id)` returns `{owners:[{id,name}],contacts:[{id,name,email}],canEdit,canReassign}`. Both write capabilities currently follow CRM.Write. Contacts are from the deal account; owners must be active, linked and permitted to read CRM.
- `multideck_crm_set_deal_next_action(p_deal_id,p_expected_version,p_input)` accepts `{title,type,ownerId,dueAt}`. Types are call, email, meeting, quote, follow_up, other. One open action per deal; replacing archives the old action as superseded. A linked personal To Do is created for the owner. Completing the linked To Do completes the action.
- `multideck_crm_complete_deal_next_action(p_deal_id,p_expected_version,p_action_id,p_note)` completes the exact current action and its To Do.
- `multideck_crm_lose_deal(p_deal_id,p_expected_version,p_input)` accepts `{reasonCode,details,competitor,revisitDate,pipelineStageId?}`. Reason codes: price, timing, competitor, service_fit, no_response, cancelled, other. Other requires detail. Optional target stage must be a Lost stage in the current pipeline. Marking lost atomically stores reason/history and retires the active action. Future revisit dates create an assigned follow-up To Do. Won/lost records cannot accidentally be reopened by ordinary stage moves.
- Existing versioned `multideck_crm_update_deal` handles ownerId and primaryContactId. Stale versions fail with `CRM_CONFLICT:`.

`nextAction` is null or `{id,title,type,ownerId,ownerName,dueAt,status,completedAt,completionNote,taskId,createdAt}`. `actionHistory` is a newest-first array of the same shape, including retired actions. `loss` is null or `{reasonCode,reasonName,details,competitor,revisitDate,lostAt}`.

## Sales insights contract

`multideck_crm_get_sales_insights(p_days=90,p_pipeline_id=null,p_owner_id=null)` returns:

- `generatedAt`, `period:{days,from,to}`.
- `filters:{pipelines:[{id,name}],owners:[{id,name}]}`.
- `coverage:{historyStartedAt,measuredStageDeals,totalDeals,note}`. Exact pipeline stage IDs and close-date changes are measured from deployment onwards; imported historical dates are never invented.
- `definitions:{winRate,stageTime,slippage,coverage}` human-readable method descriptions.
- `summary:{openDeals,wonDeals,lostDeals,closedDeals,winRatePct,overdueActions,missingActions,slippingDeals}`. Win rate is wins divided by won plus lost deals closed within the selected period; open deals are a current snapshot. Empty denominators return null, not zero.
- `stages:[{id,name,pipelineId,pipelineName,openDeals,averageDays,medianDays,sampleSize,dealIds}]`. Current-stage dwell, only from observed exact stage entry. Legacy records are observed at deployment and disclosed as such. Stage IDs, not stage labels or assumed ordering, define the cohort.
- `lossReasons:[{code,name,count,sharePct,dealIds}]` for losses closed within the period.
- `slippingDeals:[dealEvidence]`: currently open deals overdue against current close date or with an observed outward close-date change in period.
- `attentionDeals:[dealEvidence + reason]`, reason overdue_action, missing_action, or stalled_stage (14 observed days).
- `outcomes:[{id,name,companyName,ownerName,outcome,closedAt,lossReasonCode,route}]`.

`dealEvidence` is `{id,name,companyName,ownerId,ownerName,pipelineId,pipelineName,stageId,stageName,expectedCloseDate,previousCloseDate,pushCount,daysPushed,isOverdue,daysInStage,nextActionDueAt,route}`. IDs/routes support source drilldown and grounded AI analysis. No mixed-currency totals. Aggregates are complete; detail arrays are bounded and a `detailLimit` documents their cap.

The AI briefing is saved automatically for the company's 90-day scope when significant sales evidence changes. Page visits and chart filters only read the saved result; they never generate analysis. A debounced queue, six-hour company limit, unchanged-evidence check and finite retries bound model usage. It cites source evidence, preserves historical coverage limitations and does not change CRM records or infer missing historical values. See [the saved briefing contract](crm-sales-briefings.md).

## Local verification (22 September 2026)

Production build and Deno checks passed. The mandatory data-access regression runner passed 78 checks without skips; 22 focused client checks passed.

Chrome journeys used the production pages and API adapters with real disposable PostgreSQL at `tests/crm-sales-preview/serve.mjs`. Verified action creation, completion notes, owner/contact edits and reload persistence; offline save retained the draft and recovered; loss, revisit and reopening preserved history. Read-only controls and foreign-workspace denial were checked in the browser. PostgreSQL tests separately verify private Tasks linkage, concurrency, revocation, approved Dexter writes, audit and deterministic watches.

Desktop, 768px tablet and 390px mobile views were inspected. The loss dialog keeps its action footer visible and Tab remains inside it. Insights uses a compact saved briefing, weekly line chart, paired stage/loss bars and close-date comparison. Chart labels remain readable on narrow screens, with keyboard selection aligned after resizing. Evidence expands inline, receives focus and restores its trigger on Escape. Opening the source deal and returning preserves the period and pipeline. Weekly data and metric switches fit the mobile viewport without horizontal overflow; UK and US date formatting were checked.

Offline reads retain the last successful view and retry recovers; permission-denied reads clear cached figures and commentary. Saved, stale and failed briefing UI states were checked with explicit local response fixtures; ordinary reads and refreshes made zero generation requests. The automatic queue, finite retries, unchanged-evidence skips, source visibility and deterministic Dexter watches were tested with real PostgreSQL and the production worker at its service boundaries.

Recordings and screenshots in `output/playwright` contain disposable test data. Shared review media shows actual local measured data and the honest unconfigured briefing state; it does not include the injected UI state-test result. These checks do not establish deployment, configured hosted scheduling or a live model response. Deployment and per-project worker configuration remain separate release steps in the saved briefing contract.

## Recovery, dates and permissions

`multideck_crm_reopen_deal(p_deal_id,p_expected_version,p_pipeline_stage_id,p_reason)` deliberately reopens only a lost deal, with a required reason and an open nonconversion stage in its current pipeline. It retires the outstanding revisit reminder. It never reverses customer activation from a won deal. `outcomeHistory` exposes preserved lost/won/reopened evidence with event ID, time, actor and recorded reason details. Reopened deals are excluded from the *currently closed* outcome denominator. Entering the same stage after reopening starts a new dwell period.

Legacy records marked lost/won by status or stage but without a close timestamp remain closed. Their timestamps are not invented, `coverage.undatedClosedDeals` discloses them, and period outcomes exclude them. The register's open filter, status facets and totals agree with the new outcome projection.

Next-action input may include `taskDate` (the local calendar date chosen with `dueAt`). The backend validates it within one day of the UTC instant, then returns the actual `taskScheduledDate`. Task date changes preserve the due time. `deal_people.currentUserId` identifies the signed-in operator; `owners[].canOwnAction` distinguishes CRM writers who can own a next action. A permitted colleague may own a deal without being allowed to complete a shared action. Task ownership alone cannot bypass CRM.Write after access revocation.

## Dexter and verification

Domains: `deal_sales` (full current record, exact version, authoritative eligible people and evidence), `sales_insights` (90-day measured snapshot). Allowlisted action `update_deal_sales` supports `set_next_action`, `complete_next_action`, `assign`, `mark_lost`, and `reopen`. It always requires explicit approval, rechecks active company/role access, uses the same versioned writers, and records standard prepared-action audit results. It cannot accept generic table writes. Failed or stale approvals preserve the saved data.

The existing `deals` watch capability now observes owners, main contact, named next action, action changes/completion, loss reason and revisit date. Changes arrive from actual database events, with no recurring LLM use. Paused, foreign, inactive, unlinked and permission-revoked operators cannot receive these events. A clock crossing a due date alone is not a database change and does not emit a watch; overdue state is measured on read.

`node --test supabase/tests/crm-sales-workflow-postgres.test.mjs` exercises real PostgreSQL definitions for authenticated shared reads, conflicts, terminal guardrails, loss/reopen history, To Do linkage, local date boundaries, native won activation, legacy closure coverage, measured stage/close changes, actual watch creation/evaluation/pause/resume, and the actual prepared approval/execution/audit/retry flow. `createCrmSalesFixture(sql,ok)` supports disposable local browser QA. Fixtures are synthetic local records, never production data or production mocks. Run the full access regression command before release and perform a role-aware target-tenant preflight before authorised migration deployment.

## Recorded weekly history and stage distributions

Additive migration `20260922161000_crm_sales_insight_series.sql` wraps the existing authenticated Insights RPC. All existing fields retain their meaning. Its `trend` object contains `interval: "week"`, `timeZone: "UTC"`, `coverageStartsAt`, `from`, `to`, `filterBasis: "current_owner_and_pipeline"`, `metricDefinition`, `evidenceLimit: 500` and `buckets`.

Each bucket has `start`, `end`, `isPartial`, `won`, `lost`, `created`, `entered`, `dealIds`, `wonDealIds`, `lostDealIds`, `createdDealIds`, `enteredDealIds` and `evidenceTruncated`. Boundaries are ISO timestamps. Weeks start on Monday in UTC and are clipped to recorded coverage, the selected period and the snapshot time. Compare full weeks with full weeks; partial weeks are not equivalent periods. The final snapshot instant is included exactly once, including at a Monday boundary.

Won/lost values count recorded changes into that outcome, including earlier losses of reopened deals. They are historical decision counts, not the current closed-deal win-rate denominator. `created` counts actual recorded deal creation; `entered` counts creation in an open stage, a move into another open stage, or reopening. A single deal can contribute multiple events; evidence IDs are distinct. An imported initial observation starts coverage but does not count as a decision, creation or entry. Undated legacy closures remain disclosed in snapshot coverage and do not acquire invented historical decision dates.

`coverageStartsAt` is the earliest recorded event belonging to the currently visible, filtered deal cohort. `from` is the later of that timestamp and the selected period start. When no history exists, both are null and buckets are empty. No zero-filled weeks precede measurement. Zero within coverage means no recorded events, not proof that no unrecorded business activity happened. History follows the deal's **current** owner and pipeline filters; it is not historically attributed to previous owners or reconstructed pipeline membership. Existing snapshot coverage remains available alongside these more specific series bounds.

Counts include all qualifying events. Each bucket's distinct evidence arrays contain at most 500 IDs; `evidenceTruncated` is true when the complete distinct deal set exceeds that cap. A source list must disclose this bound. The full original snapshot and record visibility checks still apply.

Each `stages` entry also includes nullable `minimumDays`, `lowerQuartileDays`, `upperQuartileDays` and `maximumDays`. They use all measured currently open deals in that stage, alongside the existing median and sample size. The evidence preview cap of 100 rows does not limit these calculations. Unknown entry times are excluded, not zero-filled. These are current ages measured since actual entry or first observation; they are not completed-stage transit times and do not change with the selected history period.

Dexter chat receives the same series through its existing `sales_insights` domain and canonical RPC. The domain description and returned metric definitions identify the coverage and denominator differences. These derived measurements introduce no new write operation. Watching for you continues to react to the actual deal stage, outcome and action events through the existing deterministic adapter. A weekly bucket boundary or percentile changing as time passes is not a new business event and has no separate watch notification; no recurring LLM evaluation is introduced by this series.

`node --test supabase/tests/crm-sales-insight-series-postgres.test.mjs` runs actual PostgreSQL RPCs for repeated lost/reopen decisions, UTC calendar boundaries, creation/entry semantics, pre-period and imported history, absent coverage, exact snapshot timestamps, complete stage distributions beyond evidence limits, current owner/pipeline attribution, shared read-only colleagues, Dexter parity, and foreign/inactive/unlinked/revoked/anonymous denial. It applies the new migration after the base fixture and never connects to a hosted tenant.
