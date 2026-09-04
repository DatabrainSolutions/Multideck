import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { requiresExplicitActionApproval } from "../functions/agent-dexter/email-approval.mjs"

const migration = readFileSync(
  new URL("../migrations/20260828140000_cloud_support_ticket_dexter_parity.sql", import.meta.url),
  "utf8",
)
const callback = readFileSync(
  new URL("../functions/support-ticket-callback/index.ts", import.meta.url),
  "utf8",
)
const callbackContract = readFileSync(
  new URL("../functions/support-ticket-callback/contract.ts", import.meta.url),
  "utf8",
)
const dexter = readFileSync(
  new URL("../functions/agent-dexter/index.ts", import.meta.url),
  "utf8",
)
const tenantBaseline = readFileSync(
  new URL("../baseline/public-schema.sql", import.meta.url),
  "utf8",
)

test("stores minimal reporter-safe Cloud signals without ticket content", () => {
  assert.match(migration, /Support_CloudTicketSignals/)
  assert.match(migration, /CloudTicketSignal_ReporterUserID/)
  assert.match(migration, /signal\."CloudTicketSignal_ReporterUserID" = v_context\.user_id[\s\S]*private\.is_tenant_administrator/)
  assert.doesNotMatch(migration, /CloudTicketSignal_(Body|Description|Email|Attachment)/)
})

test("uses signed replay-safe callbacks and deterministic watch signals", () => {
  assert.match(callback, /crypto\.subtle\.verify\("Ed25519"/)
  assert.match(callback, /x-multideck-tenant-id/)
  assert.match(callback, /event\.tenantHost !== expectedTenantHost/)
  assert.match(callbackContract, /Math\.abs\(nowSeconds - Number\(value\)\) <= allowanceSeconds/)
  assert.match(migration, /Support_CloudTicketCallbackNonces/)
  assert.match(migration, /insert into public\."AI_DexterWatchSignals"/)
  assert.match(migration, /watch\."AIDexterWatch_StatusCode" = 'active'/)
})

test("refuses restricted and security ticket callbacks at both App boundaries", () => {
  assert.match(callbackContract, /ticketType: "bug" \| "feature_request" \| "question" \| "account_billing" \| "security_concern"/)
  assert.match(callbackContract, /restricted: boolean/)
  assert.match(callbackContract, /typeof event\.restricted !== "boolean"/)
  assert.match(callback, /event\.restricted \|\| event\.ticketType === "security_concern"/)
  assert.match(callback, /p_ticket_type: event\.ticketType/)
  assert.match(callback, /p_restricted: event\.restricted/)
  assert.match(migration, /coalesce\(p_restricted, true\)/)
  assert.match(migration, /p_ticket_type, ''\) not in \('bug','feature_request','question','account_billing'\)/)
  assert.match(migration, /CloudTicketSignal_TicketType/)
})

test("keeps support creation approval-only and tenant-derived", () => {
  assert.match(dexter, /requiresExplicitActionApproval\(action\.code, accessMode\)/)
  for (const mode of ["approve", "full", "read_only"]) {
    assert.equal(requiresExplicitActionApproval("create_support_ticket", mode), true)
  }
  assert.match(dexter, /Cloud will assign the customer from this tenant credential/)
  assert.match(dexter, /Never request or include a tenant or customer identifier/)
  assert.match(dexter, /allowedTypes = new Set\(\["bug", "feature_request", "question", "account_billing"\]\)/)
  assert.match(dexter, /Security concerns, screenshots, attachment changes, internal notes, assignment and other restricted support operations are not available to Dexter/)
})

test("does not introduce an idle LLM watch loop", () => {
  assert.doesNotMatch(migration, /cron|http_post|openai|mistral|llm/i)
  assert.match(migration, /exact_reporter_or_tenant_admin_ticket/)
  assert.match(migration, /Support ticket watches notify only; automatic ticket changes are not supported/)
})

test("keeps tenant and Dexter locale support English-only", () => {
  assert.match(tenantBaseline, /p_locale not in \('en-GB', 'en-US'\)/)
  assert.match(tenantBaseline, /ARRAY\['en-GB'::"text", 'en-US'::"text"\]/)
  assert.match(dexter, /type DexterLocale = "en-GB" \| "en-US"/)
  assert.match(dexter, /return value === "en-US" \? value : "en-GB"/)

  assert.match(dexter, /\$\{supportTicketCopy\(locale, "prompt"\)\}/)
  assert.match(dexter, /supportTicketCopy\(locale, "tool"\)/)
  assert.match(dexter, /supportTicketCopy\(locale, "prepared", cleanString\(args\.title, 180\)\)/)
  assert.match(dexter, /supportTicketCopy\(locale, "invalid"\)/)
  assert.match(dexter, /source: "dexter_approved_action",\s*locale,/)
  assert.match(dexter, /locale: input\.locale/)
  assert.match(dexter, /ticket_type: "Ticket type"/)
  assert.match(dexter, /account_billing: "Account & billing"/)
})
