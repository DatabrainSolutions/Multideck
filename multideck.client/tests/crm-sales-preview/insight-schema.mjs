import { readFileSync } from 'node:fs'
// Apply the actual saved-briefing and event-series migrations to the native fixture.
// No scheduler/provider credentials are configured in the local review workspace.
export function applyCrmInsightSchema(sql, ok) {
 for (const name of ['20260922160000_crm_sales_briefings', '20260922161000_crm_sales_insight_series', '20260922170000_crm_sales_narrative_evidence']) {
  ok(sql(readFileSync(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')))
 }
}
