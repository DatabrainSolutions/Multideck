import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { clearCrmReadCache, readCachedCrmResource } from "../src/lib/crm-read-cache.ts"

const customerApi = readFileSync(new URL("../src/lib/customer-api.ts", import.meta.url), "utf8")
const contactDetail = readFileSync(new URL("../src/pages/crm-contact-detail-page.tsx", import.meta.url), "utf8")
const dealApi = readFileSync(new URL("../src/lib/deal-api.ts", import.meta.url), "utf8")
const leadApi = readFileSync(new URL("../src/lib/lead-api.ts", import.meta.url), "utf8")
const crmPage = readFileSync(new URL("../src/pages/crm-page.tsx", import.meta.url), "utf8")
const topBar = readFileSync(new URL("../src/components/multideck/top-bar.tsx", import.meta.url), "utf8")
const inlineField = readFileSync(new URL("../src/components/multideck/inline-field.tsx", import.meta.url), "utf8")
const crmSupabase = readFileSync(new URL("../src/lib/crm-supabase.ts", import.meta.url), "utf8")

test("contact saves carry the edit version and invalidate the contact read after success", () => {
  assert.match(customerApi, /export async function updateContact\(contactId: string, input: UpdateContactInput, expectedVersion: number\)/u)
  assert.match(customerApi, /method: "PATCH"[\s\S]*body: JSON\.stringify\(\{ \.\.\.input, expectedVersion \}\)/u)
  assert.match(customerApi, /invalidateCrmResources\(session\.user\.id, \["accounts:", "contacts:", `account-detail:\$\{contact\.accountId\}`, `contact-detail:\$\{contactId\}`\]\)/u)
})

test("contact stale-edit conflicts refresh the server version and preserve the operator's work", () => {
  assert.match(contactDetail, /if \(!\(/u)
  assert.match(contactDetail, /cause instanceof CustomerApiError/u)
  assert.match(contactDetail, /cause\.status !== 409/u)
  assert.match(contactDetail, /const latest = await getContact\(contactId, \{ forceRefresh: true \}\)/u)
  assert.match(contactDetail, /contactRef\.current = latest[\s\S]*setContact\(latest\)/u)
  assert.match(contactDetail, /This contact changed elsewhere\. Your edit was not saved; the latest version is now shown\./u)
  assert.match(contactDetail, /This contact changed elsewhere\. Your edit was not saved\. Reload to see the latest version\./u)
  assert.match(contactDetail, /saveQueueRef\.current = save\.catch\(\(\) => undefined\)/u)
})

test("marking a deal won calls the customer-conversion RPC and invalidates both deal and account lists", () => {
  assert.match(dealApi, /export async function markDealWon\(dealId: string, pipelineStageId: string, reason\?: string\)/u)
  assert.match(dealApi, /"multideck_crm_win_deal"[\s\S]*p_deal_id: dealId, p_pipeline_stage_id: pipelineStageId, p_reason: reason\?\.trim\(\) \|\| null/u)
  assert.match(dealApi, /"This deal could not be converted into a customer\."[\s\S]*"Sign in again to manage CRM deals\."/u)
  assert.match(dealApi, /invalidateCrmResources\(session\.user\.id, \["accounts:", "deals:", `deal-detail:\$\{dealId\}`\]\)/u)
})

test("deal-won success closes confirmation and failure leaves a retryable flow with a refreshed board", () => {
  assert.match(crmPage, /setWinning\(true\)[\s\S]*const updated = await markDealWon\(pendingWin\.deal\.id, pendingWin\.stage\.id\)[\s\S]*setLiveDeals\(\(deals\) => deals\.map\(\(deal\) => deal\.id === updated\.id \? updated : deal\)\)[\s\S]*setPendingWin\(null\)[\s\S]*toast\.success\(t\("Deal marked won and customer activated"\)\)/u)
  assert.match(crmPage, /catch \(error\) \{[\s\S]*toast\.error\(error instanceof Error \? error\.message : t\("This deal could not be converted into a customer\."\)\)[\s\S]*setReloadKey\(\(key\) => key \+ 1\)[\s\S]*finally \{[\s\S]*setWinning\(false\)/u)
  assert.match(crmPage, /<Dialog open=\{pendingWin !== null\}/u)
  assert.match(crmPage, /<Button disabled=\{winning\} onClick=\{\(\) => void confirmDealWon\(\)\}/u)
})

test("an unavailable lead shows one honest recovery message and no conversion action", () => {
  assert.match(leadApi, /"This lead may have been removed or you may no longer have access\."/u)
  assert.match(crmPage, /t\("Lead unavailable"\)[\s\S]*t\(loadError \?\? "This lead may have been removed or you may no longer have access\."\)/u)
  assert.doesNotMatch(crmPage, /<p className="text-\[15px\][^>]*>\{t\("Unable to load this lead\. Check your connection and try again\."\)\}<\/p>/u)
  assert.match(topBar, /isCrmLeadDetail \? \([\s\S]*\{currentRecordName \? <div[\s\S]*t\("Convert to deal"\)[\s\S]*<\/div> : null\}/u)
})

test("a forced CRM refresh replaces the cached value used by the next read", async () => {
  clearCrmReadCache()
  let calls = 0
  const load = async () => ({ revision: ++calls })

  assert.deepEqual(await readCachedCrmResource("user-1", "contacts:", load), { revision: 1 })
  assert.deepEqual(await readCachedCrmResource("user-1", "contacts:", load, { forceRefresh: true }), { revision: 2 })
  assert.deepEqual(await readCachedCrmResource("user-1", "contacts:", load), { revision: 2 })
  assert.equal(calls, 2)
})

test("failed inline saves preserve the operator draft and expose retry or cancel", () => {
  assert.match(inlineField, /state !== "saving" && state !== "error"/u)
  assert.doesNotMatch(inlineField, /catch \(error\) \{\s*setDraft\(value\)/u)
  assert.match(inlineField, /savingRef\.current = true[\s\S]*finally \{\s*savingRef\.current = false/u)
  assert.match(inlineField, /onClick=\{\(\) => void commit\(\)\}>\{t\("Retry"\)\}/u)
  assert.match(inlineField, /\{t\("Cancel changes"\)\}/u)
})

test("CRM transport failures are human-readable and mutations reconcile uncertain outcomes", () => {
  assert.match(crmSupabase, /class CrmMutationOutcomeUnknownError extends CrmSupabaseError/u)
  assert.match(crmSupabase, /did not confirm whether that change was saved\. Refresh this record before trying again\./u)
  assert.match(crmSupabase, /The CRM could not be reached\. Check your connection and try again\./u)
  assert.match(crmSupabase, /if \(error instanceof CrmSupabaseError\) throw error[\s\S]*throw transportError\(mutation\)/u)
  assert.match(crmSupabase, /export function callCrmMutation/u)
  for (const mutation of [
    "multideck_crm_update_lead",
    "multideck_crm_create_follow_up_lead",
    "multideck_crm_request_lead_transfer",
    "multideck_crm_decide_lead_transfer",
    "multideck_crm_cancel_lead_transfer",
    "multideck_crm_transfer_lead",
  ]) {
    assert.match(leadApi, new RegExp(`callCrmMutation<[\\s\\S]{0,80}\\(\\s*\"${mutation}\"`))
  }
  assert.match(crmPage, /submitError instanceof CrmMutationOutcomeUnknownError[\s\S]{0,100}setReloadToken/u)
  assert.match(crmPage, /cause instanceof CrmMutationOutcomeUnknownError[\s\S]{0,100}refreshOwnershipRequests/u)
})
