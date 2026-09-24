# Saved CRM sales briefing

CRM Insights reads one saved, generated briefing for the current company across the last 90 days. It is independent of the operator's chart filters. Opening the page, reading through Dexter and polling refresh status do not enqueue work or call a model. Significant recorded deal changes queue an automatic refresh, keeping the prior good briefing visible while work is pending or fails, provided its original source records remain visible.

## Read contract

Authenticated callers use `multideck_crm_get_sales_briefing()` with no arguments. The RPC checks a unique, active linked operator with current `CRM.Read` and resolves the company from that operator. The underlying result, queue state, source membership and worker leases are private; clients have no table access.

The returned object contains:

- `result`: null or the grounded generated result. The backward-compatible base is `{generatedAt,dataAsOf,summary,findings}`. Version 3 adds source-backed themes, bounded narrative cohort metadata and current measured `metricsAsOf`; see [the narrative contract](crm-sales-narrative.md). Evidence retains canonical record IDs and links.
- `generatedAt`: when the saved result was generated; unchanged-evidence checks preserve this date. `checkedAt` records the latest successful comparison or generation.
- `status`: `pending`, `generating`, `ready`, `stale`, `failed` or `unavailable`. A prior visible result with newer evidence is `stale`; `refreshStatus` separately gives `pending`, `processing`, `ready`, `failed` or null.
- `pendingSince`, nullable `lastErrorCode`, and `automationReady`. Render error codes as plain-language recovery states. Automation readiness confirms the configured Vault endpoint/secret, HTTP extension and enabled expected cron job; it does not claim that a provider/model allowance is available.
- `scope`: `{companyId,days:90,pipelineId:null,ownerId:null}`. The current operator determines `companyId`; callers cannot choose another company.
- `resultWithheld`: true when any original source deal is no longer visible. In that case `result` and `generatedAt` are null, even during the six-hour cooldown. Do not redisplay an older client copy.

The saved source membership is the complete authorised deal set, separate from bounded evidence arrays. Deletion, movement into another company's pipeline, and related account/pipeline visibility changes therefore hide obsolete evidence immediately. New deal additions can leave the previous briefing visible while refreshing. An empty current snapshot can clear an obsolete result without a model call.

## Queue and worker contract

Migration `20260922160000_crm_sales_briefings.sql` creates one `AI_CrmSalesBriefings` row per company. It bootstraps existing companies with an eligible reader once. Recorded deal events and deal/related-scope changes increment a dirty version. Repeated events coalesce with a five-minute quiet debounce, capped at 30 minutes from the first pending change; the six-hour company cooldown and failure backoff still take precedence.

The scheduled database dispatcher runs once a minute. It performs a cheap queue check and issues an HTTP worker request only for due eligible work or expired leases. A clean queue does not invoke the Edge Function or model. Jobs use `FOR UPDATE SKIP LOCKED`, a ten-minute exact lease and at most one claim per company in six hours. Each dirty batch allows three attempts; retries back off by six, twelve and eighteen hours, and stop after the third failure. A later real evidence change may rearm a failed batch. A successful completion consumes only its claimed version, leaving changes made during generation pending.

Only `service_role` can call:

- `multideck_crm_claim_sales_briefing_jobs(p_limit integer default 2)` returns an array of `{companyId,userId,leaseId,snapshot,lastFingerprint}`. The Edge worker uses a limit of one. A claim chooses a currently eligible company operator, temporarily establishes that operator's auth subject, calls the canonical `multideck_crm_get_sales_insights(90,null,null)` and restores the original subject. It never queries an arbitrary client-selected company. `lastFingerprint` is null when a saved result's source visibility changed, even if bounded aggregates happen to match.
- `multideck_crm_validate_sales_briefing_job(p_company_id,p_user_id,p_lease_id)` returns a boolean for the exact, unexpired processing lease, active linked `CRM.Read` actor and complete still-visible claimed source membership. The worker checks it before provider work and before completing.
- `multideck_crm_finish_sales_briefing_job(p_company_id,p_user_id,p_lease_id,p_fingerprint,p_result,p_skipped default false)` returns whether the exact lease completed. Fingerprints must be 64 lower-case hexadecimal characters. A skipped completion must match the saved fingerprint and still-visible saved sources; it retains the previous result and generation time. A null unskipped result is allowed only when the canonical leased snapshot has zero deals. New results must be JSON objects of at most 60 KB. Finish rechecks current access and cannot overwrite a replaced or expired lease.
- `multideck_crm_fail_sales_briefing_job(p_company_id,p_user_id,p_lease_id,p_error_code)` records a bounded, allowlisted error and backoff while preserving the prior good result. Revoked or stale leases cannot alter a newer job. An expired worker is recovered by the next queue claim without bypassing cooldown or attempt limits.
- `multideck_crm_sales_briefing_worker_secret()` returns the configured worker secret to the service adapter only. It is never included in page, chat, notification or model data.

The Edge worker computes a stable evidence fingerprint before any model call. Identical evidence completes through `p_skipped=true`, including a previously verified empty workspace. Empty current evidence completes without a provider. Changed evidence is interpreted once through the existing metered model gateway; generated assertions must reference supplied evidence and retain coverage limits. No page request or deterministic watch can force generation.

## Dispatch configuration

Production dispatch uses the established Supabase Vault and `pg_cron`/`pg_net` pattern. Vault holds `multideck_crm_sales_worker_endpoint`, an HTTPS Supabase project URL ending `/functions/v1/crm-sales-insights`, and `multideck_crm_sales_worker_secret`, at least 32 characters. The dispatcher sends `x-multideck-crm-sales-worker` and `{source:"crm-sales-briefing-worker"}`. The worker verifies the header against the service-only secret RPC. The HTTP timeout is 55 seconds and the worker processes one claim per request. Missing configuration is an explicit unavailable automatic-refresh state and never falls back to per-visit generation.

This migration and the local tests do not configure a live project, write live customer records or call a model provider. Deployment, intended-tenant checks, Vault configuration and a hosted dispatch/provider check remain separate release steps.

## Dexter and deterministic watches

The `sales_briefing` data domain reads the same saved result and current permission boundary as the page. It identifies generated content and supplies `/crm/insights` as the source. Chat must distinguish the saved 90-day interpretation from freshly queried metrics and must not promise a new generation.

The matching `sales_briefing` watch capability accepts only the current company as its exact target. It supports saved `fingerprint`, `generatedAt` and `summary` fields. A changed saved fingerprint emits a deterministic signal and the existing watch evaluator creates the notification. Repeated identical checks emit no signal. Pause/resume, linked active owner access, company scope and current `CRM.Read` are enforced. Prepared write actions are explicitly unsupported for this capability: these watches notify when the saved briefing changes and cannot generate analysis or modify CRM data.

## Local regression

`supabase/tests/crm-sales-briefings-postgres.test.mjs` applies the native CRM fixture and the real migration against temporary PostgreSQL. It verifies coalescing, debounce/max wait, cooldown, exact and expired leases, bounded retries, retained good results, current/foreign/revoked access, source deletion/movement, forced regeneration after visibility loss, verified empty clearing, in-flight dirty versions, queue-aware scheduled dispatch and actual Dexter watch creation/evaluation/pause/resume. Its HTTP boundary records inert fixture requests; it makes no external calls. The standard data-access regression runner includes this suite.
