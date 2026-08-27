import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [migration, gateway, dexter, usageUi, usageCard, routes, navigation] = await Promise.all([
  read("supabase/migrations/20260826190000_admin_usage_categories.sql"),
  read("supabase/functions/_shared/model-gateway.ts"),
  read("supabase/functions/agent-dexter/index.ts"),
  read("multideck.client/src/components/multideck/ai-usage-overview.tsx"),
  read("multideck.client/src/components/multideck/usage-allowance-card.tsx"),
  read("multideck.client/src/App.tsx"),
  read("multideck.client/src/data/navigation-data.ts"),
])

test("Admin Usage exposes customer units without a customer-facing money allowance", () => {
  assert.match(navigation, /label: "Usage"[\s\S]*route: "\/admin\/usage"/)
  assert.match(routes, /"\/admin\/usage"/)
  assert.match(usageUi, /<UsageAllowances usage=\{usage\}/)
  assert.doesNotMatch(usageCard, /£|includedUsageGbp|usageGbp/)
  assert.match(usageCard, /Included/)
  assert.match(usageCard, /Extra usage/)
})

test("plan allowances use OCR pages, shipments, generated documents, and enabled customs declarations", () => {
  assert.match(migration, /v_ocr_included integer := 25000/)
  assert.match(migration, /v_ocr_included := v_seat_count \* 1000/)
  assert.match(migration, /'seatCount', v_seat_count/)
  assert.match(migration, /v_documents_included integer := 2000/)
  assert.match(migration, /when '10' then 100 when '50' then 500 else 250/)
  assert.match(migration, /when '10' then 250 when '50' then 1250 else 625/)
  assert.match(migration, /"DOCBRJ_StatusCode" = 'completed'/)
  assert.match(migration, /count\(distinct submission\."ICUSS_CustomsID"\)/)
  assert.match(migration, /module\."Is_Enabled"/)
  assert.match(migration, /'dataState', 'not_connected'/)
})

test("successful Mistral OCR always settles at least the reserved page count", () => {
  assert.match(gateway, /processedPages > 0 \? processedPages : Math\.max\(0, Math\.floor\(estimatedInputUnits\)\)/)
  assert.match(migration, /nullif\(p_input_units, 0\)/)
  assert.match(migration, /0\.003076923/)
  assert.match(migration, /"AIDexterEgress_Purpose" in \('document_ocr', 'invoice_ocr'\)/)
  assert.match(migration, /v_ocr_pages \+ v_requested_pages > v_ocr_included/)
})

test("AI and OCR expose tenant-scoped team usage without leaking internal allowance currency", () => {
  assert.match(migration, /create or replace function public\._multideck_usage_team/)
  assert.match(migration, /workspace_user\."Company_ID" = p_company_id/)
  assert.match(migration, /'teamUsage', v_ai_team/)
  assert.match(migration, /'teamUsage', v_ocr_team/)
  assert.match(migration, /private\.is_tenant_administrator\(v_context\.user_id\)/)
  assert.match(migration, /category\.value - 'teamUsage'/)
  assert.match(usageCard, /Top users/)
  assert.match(usageCard, /See all team/)
  assert.match(usageCard, /<DataTable/)
  assert.doesNotMatch(usageCard, /IncludedGbp|CostGBP/)
})

test("Dexter and Watching for you use the same tenant-safe usage categories", () => {
  assert.match(dexter, /userClient\.rpc\("multideck_get_usage_categories"\)/)
  assert.match(dexter, /delete usage\[internalField\]/)
  assert.match(migration, /multideck_dexter_domain_usage/)
  assert.match(migration, /public\._multideck_usage_categories\(p_company_id\)/)
  assert.match(migration, /TR_AI_DexterModelEgressAudit_usage_watch/)
  assert.match(migration, /TR_DOCB_RenderJobs_usage_watch/)
  assert.match(migration, /TR_ICUS_Submissions_usage_watch/)
  assert.match(migration, /"AIDexterWatchCapability_FieldsJSON" = '\["category","used","included","extra","usedPercent"\]'/)
})
