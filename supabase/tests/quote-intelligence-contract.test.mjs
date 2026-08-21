import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [migration, worker, engine, runtime, workflow, workflowCore, clientApi, page, phrases, dexter, watchMigration] = await Promise.all([
  read("supabase/migrations/20260820123000_quote_intelligence.sql"),
  read("supabase/functions/quote-intelligence-worker/index.ts"),
  read("supabase/functions/quote-intelligence/core.ts"),
  read("supabase/functions/quote-intelligence/runtime.ts"),
  read("supabase/functions/quotes-workflow/index.ts"),
  read("supabase/functions/quotes-workflow/core.ts"),
  read("multideck.client/src/lib/quote-workflow-api.ts"),
  read("multideck.client/src/pages/quotes-page.tsx"),
  read("multideck.client/src/i18n/quote-intelligence-phrases.ts"),
  read("supabase/functions/agent-dexter/index.ts"),
  read("supabase/migrations/20260802140000_dexter_watching_for_you.sql"),
])

test("snapshots, evidence and queue are tenant-scoped, bounded and worker-only", () => {
  assert.match(migration, /create table public\."CusQuote_Intelligence"/)
  assert.match(migration, /create table public\."CusQuote_IntelligenceQueue"/)
  assert.match(migration, /alter table public\."CusQuote_Intelligence" enable row level security/)
  assert.match(migration, /permission\."sys_Permission_Value" = 'Quotes\.Read'/)
  assert.match(migration, /revoke all on function public\.quote_intelligence_evidence\(uuid, uuid\) from public, anon, authenticated/)
  assert.match(migration, /interval '24 months'/)
  assert.ok((migration.match(/limit 250/g) ?? []).length >= 4)
  assert.match(migration, /for update skip locked/)
  assert.match(migration, /on conflict \("CusQuoteIntelligenceQueue_QuoteID"\) do update/)
  assert.match(migration, /make_interval\(secs => least\(3600/)
  assert.match(migration, /p_retry_at timestamptz default null/)
  assert.match(migration, /greatest\(p_retry_at, clock_timestamp\(\) \+ interval '1 minute'\)/)
})

test("pricing evidence uses persisted exchange rates and excludes missing conversions", () => {
  assert.match(migration, /from public\."FIN_ExchangeRates" exchange_rate/)
  assert.match(migration, /"FINRate_IsApproved" and exchange_rate\."FINRate_MidRate" > 0/)
  assert.match(migration, /fx\.factor is not null/)
  assert.match(engine, /row\.fxComplete/)
  assert.match(engine, /withoutOutliers/)
  assert.match(engine, /weightedPercentile/)
})

test("workspace reads cached intelligence while deterministic refresh remains separate from first paint", () => {
  assert.match(workflowCore, /"intelligence"/)
  assert.match(workflow, /readQuoteIntelligence/)
  assert.match(workflow, /action === "intelligence"/)
  assert.doesNotMatch(workflow, /gpt-5\.6-luna|governedModelFetch/)
  assert.match(clientApi, /subscribeQuoteIntelligence/)
  assert.match(clientApi, /postgres_changes/)
  assert.doesNotMatch(clientApi, /setInterval|poll/i)
  assert.match(page, /refreshQuoteIntelligence/)
  assert.match(page, /intelligenceUnavailable/)
})

test("Luna is batched, governed, fingerprint-bound and limited to one eligible daily refinement", () => {
  assert.match(worker, /gpt-5\.6-luna/)
  assert.match(worker, /reasoning: \{ effort: "medium" \}/)
  assert.match(worker, /type: "json_schema"/)
  assert.match(worker, /strict: true/)
  assert.match(worker, /purpose: "quote_intelligence"/)
  assert.match(worker, /QUOTE_INTELLIGENCE_LUNA_ENABLED/)
  assert.match(worker, /p_limit: 10/)
  assert.match(migration, /"CusQuoteIntelligence_AINextEligibleAt" = now\(\) \+ interval '24 hours'/)
  assert.match(migration, /"CusQuoteIntelligence_InputFingerprint" = p_input_fingerprint/)
  assert.match(migration, /p_adjustment_points < -8 or p_adjustment_points > 8/)
  assert.match(worker, /usage_allowance_reached/)
})

test("the quote UI contains no intelligence fixtures and localises sparse and failure states", () => {
  assert.doesNotMatch(page, /£1,092|£1,272\.40|Lane, price and history signal|Inside the recent won range/)
  assert.match(page, /Building baseline/)
  assert.match(page, /Low evidence/)
  assert.match(page, /Intelligence temporarily unavailable/)
  assert.match(page, /aria-live="polite"/)
  assert.match(phrases, /ar:/)
  assert.match(phrases, /Building baseline/)
  assert.match(phrases, /Intelligence temporarily unavailable/)
})

test("Dexter reads evidence and freshness while watches stay deterministic and transition-deduped", () => {
  assert.match(migration, /multideck_dexter_domain_quotes_intelligence/)
  assert.match(migration, /'algorithmVersion'/)
  assert.match(migration, /'calculatedAt'/)
  assert.match(migration, /'historicalCount'/)
  assert.match(migration, /AI_DexterWatchSignals/)
  assert.match(migration, /event-driven and makes no recurring LLM calls/)
  assert.match(dexter, /Quote intelligence is cached evidence/)
  assert.match(watchMigration, /v_matches and not coalesce\(v_previously_matched,false\)/)
})
