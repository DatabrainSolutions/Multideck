import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const supabaseRoot = resolve(import.meta.dirname, "..")
const repoRoot = resolve(supabaseRoot, "..")

function read(relativePath) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8")
}

const migration = read(
  "supabase/baseline/public-schema.sql",
)
const leadNameMigration = read(
  "supabase/baseline/public-schema.sql",
)
const runtimeMigration = read(
  "supabase/migrations/202607310002_agent_dexter_supabase_runtime.sql",
)
const specialistMessageMigration = read(
  "supabase/migrations/202607310003_dexter_message_specialist.sql",
)
const responseVersionMigration = read(
  "supabase/migrations/202607310004_dexter_response_versions.sql",
)
const currentResponseHistoryMigration = read(
  "supabase/migrations/202607310006_dexter_current_response_history.sql",
)
const edgeFunction = read(
  "supabase/functions/agent-dexter/index.ts",
)
const dexterClient = read(
  "multideck.client/src/lib/dexter-api.ts",
)
const dexterPage = read(
  "multideck.client/src/pages/agent-dexter-page.tsx",
)
const dexterBranches = read(
  "multideck.client/src/lib/dexter-conversation-branches.ts",
)
const dexterApproval = read(
  "multideck.client/src/components/multideck/dexter-action-approval.tsx",
)
const dexterCitation = read(
  "multideck.client/src/components/multideck/dexter-inline-citation.tsx",
)
const clientStyles = read(
  "multideck.client/src/styles.css",
)
const translations = read(
  "multideck.client/src/i18n/translate.ts",
)

test("the schema baseline preserves Dexter's scoped data and action contracts", () => {
  assert.match(migration, /multideck_dexter_query_domain/)
  assert.match(migration, /multideck_dexter_execute_action/)
  assert.match(migration, /multideck_dexter_action_update_lead/)
  assert.match(migration, /sys_AIDexterDataDomains/)
  assert.match(migration, /AI_DexterActionAudit/)
  assert.match(leadNameMigration, /CRMLead_CompanyName/)
})

test("Dexter conversation persistence is tenant scoped and closed to browser table access", () => {
  assert.match(runtimeMigration, /multideck_dexter_context\(\)/)
  assert.match(runtimeMigration, /"AICNV_CompanyID" = v_company_id/)
  assert.match(runtimeMigration, /"AICNV_OwnerUserID" = v_user_id/)
  assert.match(runtimeMigration, /revoke all on table[\s\S]*"AI_Conversations"[\s\S]*authenticated/)
  assert.match(runtimeMigration, /multideck_dexter_prepare_conversation/)
  assert.match(runtimeMigration, /multideck_dexter_save_exchange/)
  assert.match(runtimeMigration, /grant execute on function public\.multideck_dexter_save_exchange[\s\S]*authenticated/)
  assert.match(runtimeMigration, /ix_AI_Conversations_dexter_owner/)
  assert.match(specialistMessageMigration, /'specialist', nullif\(message\."AIMSG_ContentJSON" ->> 'specialist'/)
  assert.match(specialistMessageMigration, /"AICNV_CompanyID" = p_company_id/)
  assert.match(specialistMessageMigration, /"AICNV_OwnerUserID" = p_user_id/)
})

test("Dexter retries save response versions without duplicating the operator message", () => {
  assert.match(responseVersionMigration, /p_retry_message_id uuid default null/)
  assert.match(responseVersionMigration, /"AIMSG_UserID" = v_user_id/)
  assert.match(responseVersionMigration, /'responseToUserMessageId', v_user_message_id::text/)
  assert.match(responseVersionMigration, /'responseVersion', v_response_version/)
  assert.match(responseVersionMigration, /'parentResponseMessageId'/)
  assert.match(responseVersionMigration, /if p_retry_message_id is not null then[\s\S]*else[\s\S]*insert into public\."AI_Messages"/)
  assert.match(responseVersionMigration, /message\."AIMSG_CreatedAt" < v_retry_created_at/)
  assert.match(responseVersionMigration, /grant execute on function public\.multideck_dexter_save_exchange[\s\S]*authenticated/)
  assert.match(edgeFunction, /p_retry_message_id: retryMessageId/)
  assert.match(dexterClient, /retryMessageId\?: string \| null/)
  assert.match(dexterPage, /responseGroupsFor/)
  assert.match(dexterPage, /onRetryMessage/)
  assert.match(dexterPage, /selectedResponseMessageIds/)
  assert.match(dexterPage, /conversationBranchFor/)
  assert.match(dexterBranches, /parentResponseMessageId/)
  assert.match(dexterBranches, /selectedResponseMessageIds/)
  assert.match(edgeFunction, /p_parent_response_message_id: parentResponseMessageId/)
})

test("Dexter sends only the current response version into the next model turn", () => {
  assert.match(currentResponseHistoryMigration, /responseToUserMessageId/)
  assert.match(currentResponseHistoryMigration, /select max\(/)
  assert.match(currentResponseHistoryMigration, /and not exists \(/)
  assert.match(currentResponseHistoryMigration, /previous_user\."AIMSG_ID"::text/)
  assert.match(currentResponseHistoryMigration, /p_history_message_ids uuid\[\] default null/)
  assert.match(currentResponseHistoryMigration, /message\."AIMSG_ID" = any\(p_history_message_ids\)/)
  assert.match(currentResponseHistoryMigration, /"AIMSG_CompanyID"|_multideck_dexter_context/)
  assert.match(currentResponseHistoryMigration, /grant execute on function public\.multideck_dexter_prepare_conversation[\s\S]*authenticated/)
  assert.match(dexterPage, /trailMessagesFor/)
  assert.match(dexterPage, /estimateContextTokens\(branchMessages/)
  assert.match(edgeFunction, /p_history_message_ids: historyMessageIds/)
  assert.match(dexterPage, /historyMessageIds: retryHistoryMessageIds/)
})

test("the Edge Function keeps secrets server-side and uses the requested model lanes", () => {
  assert.match(edgeFunction, /Deno\.env\.get\("OPEN_API_KEY"\)/)
  assert.doesNotMatch(edgeFunction, /sk-proj-/)
  assert.match(edgeFunction, /fast: \{ model: "gpt-5\.6-luna", effort: "medium" \}/)
  assert.match(edgeFunction, /smart: \{ model: "gpt-5\.6-luna", effort: "high" \}/)
  assert.match(edgeFunction, /worker: \{ model: "gpt-5\.6-terra", effort: "medium" \}/)
  assert.match(edgeFunction, /store: false/)
  assert.match(edgeFunction, /userClient\.auth\.getUser\(\)/)
  assert.match(edgeFunction, /readTokenUsage\(response\)/)
  assert.match(edgeFunction, /multideck_dexter_prepare_conversation/)
  assert.match(edgeFunction, /multideck_dexter_save_exchange/)
})

test("Approve pauses before writes while Full access executes only registered actions", () => {
  assert.match(edgeFunction, /accessMode === "approve"/)
  assert.match(edgeFunction, /pendingAction:/)
  assert.match(edgeFunction, /p_access_mode: "approve"/)
  assert.match(edgeFunction, /p_access_mode: "full"/)
  assert.match(edgeFunction, /actions\.find\(\(candidate\) => candidate\.code === call\.name\)/)
})

test("Approve and Deny stay explicit, single-submit, and recoverable", () => {
  assert.match(dexterApproval, /data-decision="approve"/)
  assert.match(dexterApproval, /data-decision="decline"/)
  assert.match(dexterApproval, /t\("Deny"\)/)
  assert.match(dexterApproval, /pendingDecision !== null/)
  assert.match(dexterApproval, /role="alert"/)
  assert.match(dexterPage, /actionDecisionInFlightRef\.current !== null/)
  assert.match(dexterPage, /setActionDecisionError\(\{/)
  assert.match(edgeFunction, /body\.actionDecision === "decline"/)
  assert.match(edgeFunction, /Denied\. No workspace data was changed\./)
})

test("Dexter responses keep structured Markdown and one stable reasoning disclosure", () => {
  assert.match(dexterPage, /ReactMarkdown/)
  assert.match(dexterPage, /remarkPlugins=\{\[remarkGfm\]\}/)
  assert.match(dexterPage, /DexterMarkdownTable/)
  assert.match(dexterPage, /md-dexter-markdown__table-wrap--leads/)
  assert.match(dexterPage, /md-dexter-markdown__records/)
  assert.match(dexterPage, /<StatusPill tone="neutral"/)
  assert.doesNotMatch(dexterPage, /function DexterLeadTable/)
  assert.match(edgeFunction, /Lead, Route, Status, Service, Est\. value, Next action/)
  assert.match(dexterPage, /const spacedOutput: string\[\] = \[\]/)
  assert.match(dexterPage, /if \(isPlainLine && nextIsPlainLine\)/)
  assert.match(clientStyles, /\.md-dexter-markdown > p \+ p/)
  assert.match(clientStyles, /white-space: normal/)
  assert.match(edgeFunction, /Put one blank line between every heading, paragraph, list, table, and blockquote/)
  assert.match(edgeFunction, /you must call that action after locating the target record/)
  assert.match(edgeFunction, /Do not ask for confirmation in prose instead of calling the action/)
  assert.match(dexterPage, /DexterReasoningDisclosure/)
  assert.match(dexterPage, /data-reasoning-state=/)
  assert.match(dexterPage, /messages: \[\.\.\.previousConversation\.messages, pendingMessage, assistantStreamMessage\]/)
  assert.match(dexterPage, /retainStreamingAssistantId\(conversation, assistantStreamMessage\.id\)/)
  assert.match(dexterPage, /serverId: message\.serverId \?\? message\.id/)
  assert.match(dexterPage, /historyMessageIds: previousBranchMessages\.map\(dexterMessageServerId\)/)
  assert.doesNotMatch(dexterPage, /hasStreamedDelta/)
})

test("Dexter attaches clickable inline citations only to records returned by its data tools", () => {
  assert.match(edgeFunction, /function addDomainCitations/)
  assert.match(edgeFunction, /_citation: citationMetadata/)
  assert.match(edgeFunction, /\/crm\/leads\/\$\{encodeURIComponent\(recordId\)\}/)
  assert.match(edgeFunction, /\/crm\/deals\?record=/)
  assert.match(edgeFunction, /\/quotes\?search=/)
  assert.match(edgeFunction, /\/warehouse\/orders\?/)
  assert.match(edgeFunction, /\/warehouse\/inventory\?search=/)
  assert.match(edgeFunction, /Use only citation URLs returned by the data tool/)
  assert.match(edgeFunction, /wrap the smallest readable phrase/)
  assert.match(edgeFunction, /addDomainCitations\(domain, data\)/)
  assert.match(dexterPage, /isDexterCitationUrl\(href\)/)
  assert.match(dexterPage, /<DexterInlineCitation href=\{href\} title=\{title \?\? undefined\}>/)
  assert.match(dexterCitation, /href=\{href\}/)
  assert.match(dexterCitation, /aria-label=\{`\$\{t\("Open source"\)\}: \$\{sourceTitle\}`\}/)
  assert.match(translations, /"Open source": \{ de:/)
  assert.match(translations, /"Previous source": \{ de:/)
  assert.match(translations, /"Next source": \{ de:/)
})

test("Dexter response data and decisions adapt for narrow, RTL, and reduced-motion views", () => {
  assert.match(clientStyles, /@container dexter-table \(max-width: 900px\)[\s\S]*\.md-dexter-markdown__table-wrap--leads \.md-dexter-markdown__table-scroll[\s\S]*display: none/)
  assert.match(clientStyles, /@container dexter-table \(max-width: 900px\)[\s\S]*\.md-dexter-markdown__table-wrap--leads \.md-dexter-markdown__records[\s\S]*display: block/)
  assert.match(clientStyles, /@container dexter-table \(max-width: 700px\)[\s\S]*\.md-dexter-markdown__table-scroll[\s\S]*display: none/)
  assert.match(clientStyles, /@container dexter-table \(max-width: 700px\)[\s\S]*\.md-dexter-markdown__records[\s\S]*display: block/)
  assert.match(clientStyles, /\[dir="rtl"\] \.md-dexter-markdown blockquote/)
  assert.match(clientStyles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.md-dexter-markdown--streaming > :last-child::after[\s\S]*animation: none/)
  assert.match(dexterApproval, /motion-reduce:animate-none/)
  assert.match(dexterApproval, /<bdi>\{change\.value\}<\/bdi>/)
  assert.match(translations, /"Approve": \{[\s\S]*ar: "موافقة"/)
  assert.match(translations, /"Deny": \{[\s\S]*ar: "رفض"/)
})

test("Dexter follows the signed-in operator's locale and freight voice", () => {
  assert.match(edgeFunction, /PROMPT_VERSION = "freight-coworker-/)
  assert.match(edgeFunction, /operator's selected profile locale/)
  assert.match(edgeFunction, /Write natural British English/)
  assert.match(edgeFunction, /Sound like an experienced colleague doing the work alongside the operator/)
  assert.match(edgeFunction, /Treat ETD, ETA, ATD, ATA/)
  assert.match(edgeFunction, /Never use the em dash character/)
  assert.match(edgeFunction, /\.replace\(\/\\s\*—\\s\*\/g, ": "\)/)
  assert.match(edgeFunction, /args = sanitiseArguments\(parsed\)/)
  assert.match(edgeFunction, /sanitiseArguments\(body\.approvedAction\.arguments\)/)
  assert.match(edgeFunction, /reasoningSummary: result\.reasoningSummary/)
  assert.match(edgeFunction, /p_input_tokens: result\.usage\?\.inputTokens/)
  assert.match(edgeFunction, /p_output_tokens: result\.usage\?\.outputTokens/)
})

test("each Dexter role has a distinct freight-specialist operating brief", () => {
  assert.match(edgeFunction, /const SPECIALIST_INSTRUCTIONS: Record<string, string>/)
  assert.match(edgeFunction, /auto: `## Auto coordinator/)
  assert.match(edgeFunction, /sales: `## Sales and quoting specialist/)
  assert.match(edgeFunction, /customs: `## Customs and compliance specialist/)
  assert.match(edgeFunction, /ops: `## Operations and exceptions specialist/)
  assert.match(edgeFunction, /customer: `## Customer communications specialist/)
  assert.match(edgeFunction, /analytics: `## Analytics and reporting specialist/)
  assert.match(edgeFunction, /SPECIALIST_INSTRUCTIONS\[specialist\] \?\? SPECIALIST_INSTRUCTIONS\.auto/)
  assert.match(edgeFunction, /# Active specialist/)
  assert.match(edgeFunction, /Never invent rates, surcharges, capacity/)
  assert.match(edgeFunction, /Never infer clearance, admissibility, duty/)
  assert.match(edgeFunction, /Rank exceptions by urgency, operational consequence and customer impact/)
  assert.match(edgeFunction, /Never claim a message was sent unless a connected action confirms it/)
  assert.match(edgeFunction, /Never present correlation as causation/)
})

test("Dexter streams directly through the authenticated Edge Function and persists before completion", () => {
  assert.match(edgeFunction, /stream: true/)
  assert.match(edgeFunction, /response\.output_text\.delta/)
  assert.match(edgeFunction, /response\.reasoning_summary_text\.delta/)
  assert.match(edgeFunction, /summary: "auto"/)
  assert.match(edgeFunction, /reasoningSummary:/)
  assert.match(edgeFunction, /response\.completed/)
  assert.match(edgeFunction, /Content-Type": "text\/event-stream/)
  assert.match(edgeFunction, /const conversation = await saveExchange/)
  assert.match(edgeFunction, /emit\(\{ type: "complete", conversation \}\)/)
  assert.match(dexterClient, /supabaseFunctionsUrl/)
  assert.match(dexterClient, /Authorization: `Bearer \$\{session\.access_token\}`/)
  assert.match(dexterClient, /response\.body\.getReader\(\)/)
  assert.match(dexterClient, /payload\.type === "delta"/)
  assert.match(dexterClient, /payload\.type === "reasoning_delta"/)
  assert.match(dexterClient, /payload\.type === "complete"/)
  assert.doesNotMatch(dexterClient, /apiFetch/)
  assert.doesNotMatch(dexterClient, /\/api\/v1\/agent-dexter/)
})
