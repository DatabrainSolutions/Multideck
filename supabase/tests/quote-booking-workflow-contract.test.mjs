import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const migration = (await Promise.all([
  read("supabase/migrations/20260819100028_quote_workspace_v1.sql"),
  read("supabase/migrations/20260819100219_quote_workspace_v1_service_bridge.sql"),
  read("supabase/migrations/20260819100932_quote_workspace_v1_accept_version.sql"),
  read("supabase/migrations/20260819101226_quote_workspace_v1_indexes.sql"),
])).join("\n")
const quoteLossMigration = await read("supabase/migrations/20260820112421_require_quote_loss_reason.sql")
const rollback = await read("supabase/rollbacks/20260819100028_quote_workspace_v1_rollback.sql")
const workflowEdge = await read("supabase/functions/quotes-workflow/index.ts")
const workflowCore = await read("supabase/functions/quotes-workflow/core.ts")
const quotePage = await read("multideck.client/src/pages/quotes-page.tsx")
const quoteWorkflowPage = await read("multideck.client/src/pages/quote-workflow-page.tsx")

test("quotes extend the canonical records with versions and audit events", () => {
  assert.match(migration, /"CusQuoteHeader_LifecycleCode" varchar\(40\) not null default 'draft'/)
  assert.match(migration, /create table public\."CusQuote_Versions"/)
  assert.match(migration, /"CusQuoteVersion_SnapshotJSON" jsonb not null/)
  assert.match(migration, /create table public\."CusQuote_Events"/)
  assert.match(migration, /create or replace function quote_api\.save_quote/)
  assert.match(migration, /create or replace function quote_api\.transition_quote/)
  assert.match(migration, /when next_lifecycle = 'accepted' then current_version_id/)
  assert.match(migration, /"CusQuoteHeader_ID", "CusQuoteVersion_ID", "CusQuoteEvent_TypeCode"/)
})

test("the live details and overview do not inject the old quote demo values", () => {
  const livePanelStart = quotePage.indexOf("function QuoteCargoWiseOverviewPanel")
  const livePanelEnd = quotePage.indexOf("function QuoteCargoWiseDetailsPanel", livePanelStart)
  const detailsPanelEnd = quotePage.indexOf("type QuoteChargeEditableField", livePanelEnd)
  const livePanels = quotePage.slice(livePanelStart, detailsPanelEnd)
  assert.doesNotMatch(livePanels, /SPQ-74218|HarbourWorks Safety|RIVERGATE WORKS|Nora Vale|KOBE DISTRIBUTION CENTRE/)
  assert.match(livePanels, /Pricing and win-rate insights will appear here/)
})

test("blank quotes cannot save and references are allocated only during a meaningful save", () => {
  assert.match(migration, /if not quote_api\.payload_has_content\(payload\)/)
  assert.match(migration, /Add at least one quote detail before saving/)
  assert.match(migration, /quote_number := nextval\('quote_api\.quote_number_seq'\)/)
  assert.match(workflowCore, /!hasContent\(quoteFields\) && !hasMeaningfulCharge/)
  assert.doesNotMatch(workflowEdge, /convert_to_booking/)
})

test("the live Edge boundary is authenticated, permission checked and company scoped", () => {
  assert.match(workflowEdge, /authenticateRequest\(request\)/)
  assert.match(workflowEdge, /permission_value: "Quotes\.Read"/)
  assert.match(workflowEdge, /data\.User_AccessStatus !== "active"/)
  assert.match(workflowEdge, /rpc\("quote_workflow_save_quote"/)
  assert.match(workflowEdge, /rpc\("quote_workflow_transition_quote"/)
  assert.match(migration, /revoke all on function public\.quote_workflow_save_quote[\s\S]+from public, anon, authenticated/)
  assert.match(workflowEdge, /String\(office\.Company_ID\) !== operator\.companyId/)
})

test("the migration excludes booking conversion and document-builder ownership", () => {
  assert.doesNotMatch(migration, /convert_to_booking/)
  assert.doesNotMatch(migration, /insert into public\."Job_Header"/)
  assert.doesNotMatch(migration, /prepare_quote_render/)
  assert.doesNotMatch(migration, /DOCB_DocumentTemplates/)
  assert.doesNotMatch(quoteWorkflowPage, /renderDocument\(/)
})

test("Dexter quote parity is permission guarded and existing watches stay event driven", () => {
  assert.match(migration, /multideck_dexter_domain_quotes/)
  assert.match(migration, /multideck_dexter_action_manage_quote_lifecycle/)
  assert.match(migration, /'\["Quotes\.Write"\]'::jsonb/)
  assert.match(migration, /"AIDexterAction_HasExternalEffect"/)
  assert.doesNotMatch(migration, /cron\.schedule[\s\S]+quotes/)
})

test("quote loss requires a saved reason and removes the staged lifecycle from Dexter", () => {
  assert.match(quoteLossMigration, /next_lifecycle = 'declined' and nullif\(btrim\(requested_note\), ''\) is null/)
  assert.match(quoteLossMigration, /'lossReason'/)
  assert.match(quoteLossMigration, /multideck_dexter_action_mark_quote_lost/)
  assert.match(quoteLossMigration, /"AIDexterAction_Code" = 'manage_quote_lifecycle'/)
  assert.match(quoteLossMigration, /"AIDexterAction_IsActive" = false/)
  assert.match(quoteLossMigration, /Evaluation remains event-driven from the quote table trigger/)
})

test("quote workspace presents one Open state until booking or loss", () => {
  assert.match(quotePage, /status: "Open"/)
  assert.match(quotePage, /status: "Lost"/)
  assert.match(quotePage, /function QuoteWorkspaceSkeleton\(\)/)
  assert.match(quotePage, /void getSalesQuote\(reference\)/)
  assert.match(quotePage, /await loadQuoteWorkspace\(reference\)/)
  assert.doesNotMatch(quotePage, /Loading quote…<\/div>/)
  assert.match(quotePage, /Why was this quote lost\?/)
  assert.match(quotePage, /transitionQuoteWorkflow\(currentQuoteId, "declined", reason\)/)
  assert.doesNotMatch(quotePage, /Mark calculated/)
  assert.doesNotMatch(quotePage, /const quoteStages/)
})

test("one rollback restores the exact pre-migration fixtures and removes only v1 work", () => {
  assert.match(migration, /quote_api\.rollback_quote_headers/)
  assert.match(migration, /quote_api\.rollback_quote_lines/)
  assert.match(rollback, /"CusQuoteHeader_WorkflowVersionCode" = 'quotes-v1'/)
  assert.match(rollback, /jsonb_populate_record/)
  assert.match(rollback, /drop schema quote_api cascade/)
  assert.doesNotMatch(rollback, /drop table if exists public\."Job_Header"/)
})
