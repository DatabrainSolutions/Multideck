import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const migration = await read("supabase/migrations/20260818133458_quote_booking_manual_workflow.sql")
const workflowEdge = await read("supabase/functions/quotes-workflow/index.ts")
const renderEdge = await read("supabase/functions/render-document/index.ts")
const dexter = await read("supabase/functions/agent-dexter/index.ts")

test("quotes have a guarded lifecycle, immutable versions and audited events", () => {
  assert.match(migration, /"CusQuoteHeader_LifecycleCode" varchar\(40\) not null default 'draft'/)
  assert.match(migration, /create table if not exists public\."CusQuote_Versions"/)
  assert.match(migration, /"CusQuoteVersion_SnapshotJSON" jsonb not null/)
  assert.match(migration, /create table if not exists public\."CusQuote_Events"/)
  assert.match(migration, /Accepted or converted quotes cannot be changed/)
  assert.match(migration, /Generate the current quote version before sending/)
  assert.match(migration, /Choose a follow-up date before marking the quote sent/)
})

test("quote conversion creates exactly one canonical booking from an accepted version", () => {
  assert.match(migration, /create or replace function quote_api\.convert_to_booking/)
  assert.match(migration, /for update/)
  assert.match(migration, /"CusQuoteHeader_AcceptedVersionID" is null/)
  assert.match(migration, /"CusQuoteHeader_ConversionKey"/)
  assert.match(migration, /insert into public\."Job_Header"/)
  assert.match(migration, /insert into public\."Job_Routing"/)
  assert.match(migration, /insert into public\."Job_Cargo"/)
  assert.match(migration, /'reused', true/)
})

test("the Edge boundary is authenticated, company scoped and uses private workflow RPCs", () => {
  assert.match(workflowEdge, /authenticateRequest\(request\)/)
  assert.match(workflowEdge, /const \{ admin, userId \} = await authenticateRequest\(request\)/)
  assert.match(workflowEdge, /operatorContext\(admin, userId\)/)
  assert.match(workflowEdge, /permission_value: "Quotes\.Read"/)
  assert.match(workflowEdge, /data\.User_AccessStatus !== "active"/)
  assert.match(workflowEdge, /schema\("quote_api"\)\.rpc\("save_quote"/)
  assert.match(workflowEdge, /schema\("quote_api"\)\.rpc\("transition_quote"/)
  assert.match(workflowEdge, /schema\("quote_api"\)\.rpc\("convert_to_booking"/)
  assert.match(workflowEdge, /String\(office\.Company_ID\) !== operator\.companyId/)
})

test("customer quote documents reuse the existing Carbone renderer without changing builder UI", () => {
  assert.match(migration, /'CUSTOMER_QUOTE'/)
  assert.match(migration, /create or replace function document_api\.prepare_quote_render/)
  assert.match(migration, /create or replace function document_api\.complete_quote_render/)
  assert.match(migration, /create or replace function document_api\.fail_quote_render/)
  assert.match(renderEdge, /targetType !== "Job_Header" && targetType !== "CusQuote_Header"/)
  assert.match(renderEdge, /prepare_quote_render/)
  assert.match(renderEdge, /complete_quote_render/)
  assert.match(renderEdge, /fail_quote_render/)
})

test("Dexter quote parity is explicit, approval-safe and event driven", () => {
  assert.match(migration, /multideck_dexter_domain_quotes/)
  assert.match(migration, /multideck_dexter_action_manage_quote_lifecycle/)
  assert.match(migration, /'manage_quote_lifecycle'/)
  assert.match(migration, /'\["Quotes\.Write"\]'::jsonb/)
  assert.match(migration, /after insert or update of[\s\S]+execute function quote_api\.emit_watch_signal/)
  assert.match(migration, /AI_DexterWatchSignals/)
  assert.doesNotMatch(migration, /cron\.schedule[\s\S]+quotes/)
  assert.match(dexter, /document generation and accepted-quote booking conversion remain in the Quotes workspace/)
})
