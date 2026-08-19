import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(
  new URL("../migrations/20260818131000_crm_legacy_view_exposure_lockdown.sql", import.meta.url),
  "utf8",
)
const functionMigration = readFileSync(
  new URL("../migrations/20260818132000_crm_legacy_function_surface_lockdown.sql", import.meta.url),
  "utf8",
)

const exposedViews = [
  "CRM_AIFocusAreaQueue",
  "CRM_AccountSalesSummary",
  "CRM_ActivityWorkflowRunSummary",
  "CRM_AppliedFieldUpdateAudit",
  "CRM_AutomationActionQueue",
  "CRM_AutomationPlaybookSummary",
  "CRM_BookingEngagementQueue",
  "CRM_CallActionAcceptanceSummary",
  "CRM_CallReviewTodoQueue",
  "CRM_CustomerKPIDashboard",
  "CRM_DataCaptureWizardQueue",
  "CRM_DataRequestQueue",
  "CRM_DataRequestResponseSummary",
  "CRM_FieldUpdateReviewQueue",
  "CRM_LeadKPIDashboard",
  "CRM_LeadWorklist",
  "CRM_MarketFeedbackSummary",
  "CRM_MessageRepetitionRisk",
  "CRM_NextBestActionQueue",
  "CRM_OnboardingWorklist",
  "CRM_PersonalMessageDraftQueue",
  "CRM_PipelineSummary",
  "CRM_PostCallReviewQueue",
  "CRM_QuickTaskOptionQueue",
  "CRM_SalesPitchImprovementQueue",
  "CRM_SalesRepKPIDashboard",
  "CRM_UserTodoQueue",
]

test("legacy CRM views are invoker-scoped and removed from API roles", () => {
  for (const view of exposedViews) assert.match(migration, new RegExp(`'${view}'`))
  assert.equal(exposedViews.length, 27)
  assert.match(migration, /alter view %I\.%I set \(security_invoker = true\)/)
  assert.match(migration, /revoke all privileges on table %I\.%I from public, anon, authenticated/)
  assert.match(migration, /grant all privileges on table %I\.%I to service_role/)
  assert.match(migration, /to_regclass\(format\('%I\.%I'/)
})

test("unused legacy CRM routines are private and have a pinned lookup path", () => {
  const legacyFunctions = [
    "CRM_RecordActivity",
    "CRM_LinkQuoteToOpportunity",
    "CRM_CreateQuoteFollowup",
    "CRM_ConvertLeadToOpportunity",
    "CRM_AcceptCallActionCandidate",
    "CRM_CreateQuickTask",
    "CRM_CreatePersonalMessageDraft",
    "CRM_ApprovePersonalMessageDraft",
    "CRM_RecordQuickTaskDecision",
    "CRM_RegisterActivityWorkflowEvent",
    "CRM_StartAutomationRun",
    "CRM_CreateDataCaptureSession",
    "CRM_QueueFieldUpdate",
    "CRM_RecordWizardFieldValue",
    "CRM_CreateDataRequestFromRun",
    "CRM_RecordDataRequestFieldValue",
    "CRM_ApplyFieldUpdate",
  ]
  for (const name of legacyFunctions) assert.match(functionMigration, new RegExp(`'${name}'`))
  assert.equal(legacyFunctions.length, 17)
  assert.match(functionMigration, /alter function %s set search_path = pg_catalog, public/)
  assert.match(functionMigration, /revoke all privileges on function %s from public, anon, authenticated/)
  assert.match(functionMigration, /grant execute on function %s to service_role/)
  assert.match(functionMigration, /Explicit Dexter exception/)
})
