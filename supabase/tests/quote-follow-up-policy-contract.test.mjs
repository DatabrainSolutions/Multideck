import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8")
const [migration, mailboxIndexMigration, mailboxBindingMigration, worker, workflow, workflowCore, api, adminPage, accountPage] = await Promise.all([
  read("supabase/migrations/20260904145000_quote_follow_up_policy.sql"),
  read("supabase/migrations/20260904145100_quote_follow_up_mailbox_index.sql"),
  read("supabase/migrations/20260904145200_quote_follow_up_mailbox_binding.sql"),
  read("supabase/functions/email-watch-worker/index.ts"),
  read("supabase/functions/quotes-workflow/index.ts"),
  read("supabase/functions/quotes-workflow/core.ts"),
  read("multideck.client/src/lib/quote-workflow-api.ts"),
  read("multideck.client/src/pages/admin-page.tsx"),
  read("multideck.client/src/pages/crm-account-detail-page.tsx"),
])

test("company administrators can configure one automatic quote reminder", () => {
  assert.match(migration, /quote_follow_up_enabled boolean not null default true/u)
  assert.match(migration, /quote_follow_up_delay_days smallint not null default 3/u)
  assert.match(migration, /quote_follow_up_send_time time without time zone not null default time '09:00'/u)
  assert.match(migration, /quote_follow_up_timezone text not null default 'Europe\/London'/u)
  assert.match(migration, /Only tenant administrators can change quote follow-up policy/u)
  assert.match(migration, /pg_catalog\.pg_timezone_names/u)
  assert.match(api, /export type QuoteFollowUpSettings/u)
  assert.match(api, /action: "follow-up-settings"/u)
  assert.match(api, /action: "save-follow-up-settings"/u)
  assert.match(workflowCore, /"follow-up-settings"/u)
  assert.match(workflowCore, /"save-follow-up-settings"/u)
  assert.match(workflow, /quote_workflow_get_follow_up_settings/u)
  assert.match(workflow, /quote_workflow_save_follow_up_settings/u)
  assert.match(adminPage, /Quote follow-up/u)
  assert.match(adminPage, /Wait after sending/u)
  assert.match(adminPage, /Send one polite reminder/u)
})

test("customer policy can override timing or suppress reminders", () => {
  assert.match(accountPage, /Quote follow-up delay/u)
  assert.match(accountPage, /Leave blank to use the company policy/u)
  assert.match(accountPage, /followUpDays/u)
  assert.match(migration, /quoteTerms,followUpDays/u)
  assert.match(migration, /CRMCustEngPref_AllowFollowupMessages/u)
  assert.match(migration, /CRMCustEngPref_MinHoursBetweenNonUrgentMessages/u)
  assert.match(migration, /Customer follow-up messages are disabled/u)
  assert.doesNotMatch(migration, /update quote_api\.customer_response_links[\s\S]{0,300}where follow_up_status_code = 'not_scheduled'/u)
})

test("submitted quotes schedule only their latest unanswered issue", () => {
  assert.match(workflow, /quote_workflow_bind_customer_response_mailbox/u)
  assert.match(workflow, /requested_mailbox_id: mailboxId/u)
  assert.doesNotMatch(workflow, /admin\.schema\("quote_api"\)/u)
  assert.match(mailboxBindingMigration, /CommMailboxAccess_CanSend/u)
  assert.match(mailboxBindingMigration, /link\.created_by = requested_user_id/u)
  assert.match(migration, /quote_workflow_finalize_customer_response_pre_fu_20260904/u)
  assert.match(migration, /quote_api\.schedule_customer_follow_up\(requested_response_link_id\)/u)
  assert.match(migration, /quote\."CusQuoteHeader_LifecycleCode" = 'sent'/u)
  assert.match(migration, /not exists \(select 1 from quote_api\.customer_responses/u)
  assert.match(migration, /select 1 from quote_api\.customer_response_links newer/u)
  assert.match(migration, /newer\.created_at > link\.created_at/u)
  assert.match(migration, /follow_up_attempt_count between 0 and 3/u)
  assert.match(mailboxIndexMigration, /customer_response_links_delivery_mailbox_idx/u)
})

test("the existing email worker sends deterministic, audited and retry-safe reminders", () => {
  assert.match(worker, /processQuoteFollowUps\(admin, 2\)/u)
  assert.match(worker, /mode: "reply"/u)
  assert.match(worker, /sourceMessageId/u)
  assert.match(worker, /quote-follow-up:\$\{responseLinkId\}:\$\{attemptNumber\}/u)
  assert.match(worker, /previouslySentQuoteFollowUp/u)
  assert.match(worker, /CommMessage_IdempotencyKey/u)
  assert.match(worker, /trackOpens: false/u)
  assert.doesNotMatch(worker, /governedModelFetch|openai|anthropic/iu)
  assert.match(migration, /follow_up_status_code in \('pending','retryable','processing'\)/u)
  assert.match(migration, /interval '15 minutes'/u)
  assert.match(migration, /interval '1 hour'/u)
  assert.match(migration, /customer_follow_up_sent/u)
  assert.match(migration, /customer_follow_up_failed/u)
})

test("Dexter can read and propose policy changes without autonomous mutation", () => {
  assert.match(migration, /multideck_dexter_domain_quote_follow_up_policy/u)
  assert.match(migration, /update_quote_follow_up_policy/u)
  assert.match(migration, /Propose an administrator-reviewed change/u)
  assert.match(migration, /'canonical', true/u)
  assert.match(migration, /Ordinary due-time checks are deterministic and do not call an LLM/u)
  assert.match(migration, /'followUpDelivery'/u)
  assert.match(migration, /new\.follow_up_status_code = 'processing'[\s\S]{0,240}return new/u)
})
