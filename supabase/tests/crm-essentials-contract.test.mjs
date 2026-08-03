import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260803150000_crm_shawn_essentials.sql", import.meta.url), "utf8")
const dexter = readFileSync(new URL("../migrations/20260803152000_dexter_crm_essentials.sql", import.meta.url), "utf8")
const followUps = readFileSync(new URL("../migrations/20260803212017_crm_follow_up_opportunities.sql", import.meta.url), "utf8")
const page = readFileSync(new URL("../../multideck.client/src/pages/crm-page.tsx", import.meta.url), "utf8")
const forms = readFileSync(new URL("../../multideck.client/src/pages/crm-forms-page.tsx", import.meta.url), "utf8")

test("CRM dashboard is authenticated, user-scoped and has truthful filters and states", () => {
  assert.match(migration, /multideck_crm_get_dashboard/)
  assert.match(migration, /CRMLead_OwnerUserID" = v_context\.user_id/)
  assert.match(migration, /p_inactivity_days not in \(30, 90, 180\)/)
  assert.match(migration, /last_contact_at is not null\), last_contact_at asc/)
  assert.match(page, /getCrmDashboard/)
  assert.match(page, /No leads match this view/)
  assert.doesNotMatch(page.slice(page.indexOf("export function CrmOverviewPage"), page.indexOf("function PipelineSettingsDrawer")), /CrmSalesCommandCenter|CrmMetricsGrid/)
})

test("follow-up opportunities are deterministic, mailbox-scoped and require review before CRM creation", () => {
  assert.match(followUps, /multideck_crm_get_follow_up_opportunities/)
  assert.match(followUps, /multideck_crm_create_follow_up_lead/)
  assert.match(followUps, /mailbox\."CommMailbox_UserID" = v_context\.user_id/)
  assert.match(followUps, /CommMailboxAccess_CanRead/)
  assert.match(followUps, /interval '3 days'/)
  assert.match(followUps, /interval '5 days'/)
  assert.match(followUps, /not "CommMessage_IsDraft"/)
  assert.match(followUps, /CRMLead_OwnerUserID" = v_context\.user_id/)
  assert.match(followUps, /This email is already connected to a CRM record/)
  assert.match(followUps, /revoke all on function public\.multideck_crm_get_follow_up_opportunities.*public, anon/s)
  assert.match(followUps, /grant execute on function public\.multideck_crm_create_follow_up_lead.*authenticated/s)
  assert.match(page, /getCrmFollowUpOpportunities/)
  assert.match(page, /Review the details found in the email before adding them to CRM/)
})

test("lead transfers lock, reject stale owners, update open opportunities and notify both owners", () => {
  assert.match(migration, /CRM_LeadTransferRequests/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /The lead owner changed while this request was open/)
  assert.match(migration, /status\."CRMOpptyStatus_IsOpen"/)
  assert.match(migration, /from \(values \(p_expected_owner_id\), \(p_target_user_id\)\)/)
  assert.match(migration, /CRM\.Leads\.Reassign/)
})

test("deal winning is conversion-stage validated, permissioned and idempotent", () => {
  assert.match(migration, /multideck_crm_win_deal/)
  assert.match(migration, /CRMPipelineStage_IsConversion/)
  assert.match(migration, /CRMOppty_WonAt" is not null/)
  assert.match(migration, /Org_Master_Type/)
  assert.match(migration, /CRM_AccountProfiles/)
  assert.match(page, /Confirm deal won/)
})

test("forms is an inert planned shell and Dexter exposes only deterministic parity", () => {
  assert.match(forms, /Nothing on this page saves, sends, signs or schedules reminders/)
  assert.match(forms, /<Button disabled/)
  assert.doesNotMatch(forms, /fetch\(|supabase|callCrmRpc/)
  assert.match(dexter, /pendingTransfer/)
  assert.match(dexter, /Comm_DeliveryEvents_dexter_watch/)
  assert.match(dexter, /request_lead_transfer/)
  assert.match(dexter, /mark_deal_won/)
})
