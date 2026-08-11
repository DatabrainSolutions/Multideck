import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const repoRoot = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8")

const store = read("multideck.client/src/lib/contact-card-store.ts")
const data = read("multideck.client/src/data/contact-card-data.ts")
const automation = read("multideck.client/src/components/multideck/contact-card-automation.tsx")
const schema = read("supabase/migrations/20260731212420_qr_contact_cards_supabase.sql")
const automationRuns = read("supabase/migrations/20260803223000_contact_card_automation_runs.sql")
const design = read("multideck.client/src/components/multideck/contact-card-design.tsx")
const cardLayouts = read("multideck.client/src/lib/card-layout.ts")
const publicView = read("multideck.client/src/components/multideck/contact-card-public-view.tsx")
const tenantConsent = read("supabase/migrations/20260803224500_contact_card_tenant_marketing_consent.sql")
const consentServiceRole = read("supabase/migrations/20260803224600_grant_marketing_consent_service_role.sql")
const consentControl = read("multideck.client/src/components/multideck/marketing-opt-in-control.tsx")
const contactCardSettings = read("multideck.client/src/pages/contact-cards-page.tsx")
const analytics = read("supabase/migrations/20260803224656_contact_card_database_analytics.sql")
const analyticsPanel = read("multideck.client/src/components/multideck/contact-card-analytics.tsx")
const contactCardDexter = read("multideck.client/src/components/multideck/contact-card-dexter.tsx")
const dexterApi = read("multideck.client/src/lib/dexter-api.ts")
const dexterFunction = read("supabase/functions/agent-dexter/index.ts")
const crmFieldMappings = read("supabase/migrations/20260811085329_contact_card_crm_field_mappings.sql")

test("QR cards have no local demo-store fallback", () => {
  assert.doesNotMatch(store, /localStorage|createSeedCards|resetContactCards/)
  assert.doesNotMatch(data, /generateScans|generateExchanges|createSeedCards/)
  assert.match(store, /multideck_contact_cards_workspace/)
  assert.match(store, /multideck_contact_card_submit_exchange/)
  assert.doesNotMatch(design, /SAMPLE_VALUES|Halcyon Textiles|nadia\.perera/)
})

test("contact-card registers and analytics are calculated by Supabase", () => {
  assert.match(analytics, /_multideck_contact_card_analytics/)
  assert.match(analytics, /'analytics'/)
  assert.match(analytics, /timelineHour/)
  assert.match(analytics, /automationFailures/)
  assert.match(store, /payload\.analytics/)
  assert.match(data, /return card\.analytics\.totals/)
  assert.match(analyticsPanel, /const hasScans = totals\.scans > 0/)
  assert.doesNotMatch(data, /VISIT_WINDOW_MS|const counts = new Map|card\.scans\.filter/)
})

test("contact-card automation suggestions use the real Dexter Edge Function", () => {
  assert.match(dexterApi, /propose-contact-card-automation/)
  assert.match(contactCardDexter, /proposeContactCardAutomation/)
  assert.match(dexterFunction, /operation === "propose-contact-card-automation"/)
  assert.match(dexterFunction, /multideck_contact_cards_workspace/)
  assert.match(dexterFunction, /define_contact_card_automation/)
  assert.doesNotMatch(contactCardDexter, /deterministic stand-in|Math\.random|proposeAutomation/)
})

test("contact cards always create or update CRM leads using allowlisted field mappings", () => {
  assert.match(crmFieldMappings, /apply_contact_card_crm_field_mappings/)
  assert.match(crmFieldMappings, /duplicateHandling/)
  assert.match(crmFieldMappings, /mappedFields/)
  assert.match(crmFieldMappings, /perform private\.apply_contact_card_crm_field_mappings/)
  assert.match(automation, /CRM field mapping/)
  assert.match(automation, /duplicateHandling: "update"/)
  assert.match(dexterFunction, /Allowed sources: firstName, lastName, email, company, phone, marketingConsent, cardName, fixed/)
  assert.match(dexterFunction, /const actionKinds = new Set\(\["add-to-crm"\]\)/)
})

test("contact cards expose four layouts, social links and a real QR test path", () => {
  for (const preset of ["classic", "editorial", "compact", "spotlight"]) {
    assert.match(cardLayouts, new RegExp(`id: "${preset}"`))
  }
  assert.match(design, /ContactCardSocialLinksEditor/)
  assert.match(design, /Test QR code/)
  assert.match(publicView, /ContactCardSocialLinks/)
  assert.match(publicView, /profileImageDataUrl/)
})

test("automation runs are durable, inspectable and rerunnable", () => {
  assert.match(automationRuns, /CRM_ContactCardAutomationRuns/)
  assert.match(automationRuns, /CRM_ContactCardAutomationRunSteps/)
  assert.match(automationRuns, /multideck_contact_card_test_automation/)
  assert.match(automationRuns, /multideck_contact_card_rerun/)
  assert.match(automationRuns, /AutomationRun_Input/)
  assert.match(automation, /AutomationRunHistory/)
  assert.match(automation, /Rerun failed steps/)
  assert.match(automation, /Map fields/)
})

test("contact-card changes have Dexter read and event-driven watch parity", () => {
  assert.match(automationRuns, /multideck_dexter_domain_contact_cards/)
  assert.match(automationRuns, /AIDexterWatchCapability_Code/)
  assert.match(automationRuns, /TR_CRM_ContactCardAutomationRuns_dexter_watch/)
  assert.doesNotMatch(automationRuns, /setInterval|cron|llm/i)
})

test("pipeline and owner choices come from the Supabase workspace", () => {
  assert.match(automation, /useContactCardStore/)
  assert.match(automation, /pipeline\.id/)
  assert.match(automation, /stage\.id/)
  assert.match(automation, /owner\.id/)
  assert.doesNotMatch(automation, /const PIPELINES|const STAGES|const OWNERS/)
})

test("QR tables are private and public access is narrow RPC-only", () => {
  for (const table of [
    "CRM_ContactCards",
    "CRM_ContactCardAutomations",
    "CRM_ContactCardAutomationActions",
    "CRM_ContactCardScans",
    "CRM_ContactCardExchanges",
    "CRM_LeadPipelinePlacements",
  ]) {
    assert.match(schema, new RegExp(`alter table public\\."${table}" enable row level security`))
  }
  assert.match(schema, /revoke all on public\."CRM_ContactCards"[\s\S]*from public, anon, authenticated/)
  assert.match(schema, /grant execute on function public\.multideck_public_contact_card[\s\S]*to anon, authenticated/)
  assert.match(schema, /"Action_PipelineID" uuid references public\."CRM_Pipelines"/)
  assert.match(schema, /"Action_PipelineStageID" uuid references public\."CRM_PipelineStages"/)
})

test("public cards attribute submissions to the tenant with an on-by-default visibility setting", () => {
  assert.match(tenantConsent, /ContactCard_ShowTenantName" boolean not null default true/)
  assert.match(tenantConsent, /ContactCard_TenantName/)
  assert.match(tenantConsent, /company\."Company_Name"/)
  assert.match(contactCardSettings, /Show tenant name/)
  assert.match(publicView, /card\.tenantName/)
  assert.doesNotMatch(publicView, /Your details go to[\s\S]{0,100}card\.person\.company/)
})

test("marketing consent is explicit, audited and manually reversible across CRM records", () => {
  for (const column of [
    "CRMLead_MarketingOptIn",
    "OrgContact_MarketingOptIn",
    "Org_MarketingOptIn",
    "CommConsent_LeadID",
  ]) assert.match(tenantConsent, new RegExp(column))
  assert.match(tenantConsent, /multideck_crm_set_marketing_opt_in/)
  assert.match(tenantConsent, /Exchange_MarketingConsent" is true/)
  assert.match(tenantConsent, /case when p_opted_in then 'opted_in' else 'opted_out' end/)
  assert.match(tenantConsent, /manual_override/)
  assert.match(consentControl, /Opt-in marketing/)
  assert.match(consentServiceRole, /to service_role/)
  assert.doesNotMatch(consentServiceRole, /to anon|to authenticated/)
})

test("marketing consent has read-only Dexter evidence and deterministic watch signals", () => {
  assert.match(tenantConsent, /multideck_dexter_domain_marketing_consent/)
  assert.match(tenantConsent, /AIDexterWatchCapability_Code/)
  assert.match(tenantConsent, /_multideck_marketing_consent_watch_signal/)
  assert.match(tenantConsent, /Changes require the explicit record toggle/)
  assert.doesNotMatch(tenantConsent, /sys_AIDexterActions[\s\S]{0,500}marketing_consent/)
})
