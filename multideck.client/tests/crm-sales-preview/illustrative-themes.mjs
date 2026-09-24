// Explicitly selected local illustration only. No provider call or production grouping logic.
// The real parser resolves every membership/quotation from the authorised native corpus.
import '../../../supabase/tests/register-typescript.mjs'
const { buildSalesAnalysisSource, parseSalesAnalysis } = await import('../../../supabase/functions/crm-sales-insights/core.ts')
export function illustrativeSalesThemes(snapshot) {
 const { evidence, narrative } = buildSalesAnalysisSource(snapshot)
 const categories = [
  { label: 'Communication and ownership', description: 'Feedback discussing a named contact or proactive shipment updates.', match: /named operations contact|proactive shipment updates/i },
  { label: 'Cost and service trade-offs', description: 'Feedback comparing rates, collection charges and the service included.', match: /cheaper rate|collection charges|lowest rate/i },
  { label: 'Collection timing', description: 'Feedback about collection windows, departure days and warehouse schedules.', match: /warehouse schedule|departure day/i },
  { label: 'Capacity commitments', description: 'Feedback about guaranteed space and peak-season capacity.', match: /guaranteed.*space|confirm capacity/i },
 ]
 const themes = categories.map(({ label, description, match }) => ({ label, description, memberships: narrative.documents.filter(document => match.test(document.text)).map(document => ({ sourceId: document.id, excerpt: document.text.slice(0, 180) })) })).filter(theme => new Set(theme.memberships.map(member => narrative.documents.find(document => document.id === member.sourceId)?.dealId)).size >= 2)
 return parseSalesAnalysis({ summary: 'Illustrative semantic grouping of disposable local QA records. No model was called.', findings: [], themes }, evidence, snapshot.generatedAt, snapshot.generatedAt, narrative)
}
