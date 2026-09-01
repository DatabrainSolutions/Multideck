import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const migration = readFileSync(new URL("../migrations/20260813094151_developer_broadcasts.sql", import.meta.url), "utf8")
const edge = readFileSync(new URL("../functions/developer-broadcasts/index.ts", import.meta.url), "utf8")
const core = readFileSync(new URL("../functions/developer-broadcasts/core.ts", import.meta.url), "utf8")
const client = readFileSync(new URL("../../multideck.client/src/components/multideck/broadcast-settings.tsx", import.meta.url), "utf8")
const dexter = readFileSync(new URL("../functions/agent-dexter/index.ts", import.meta.url), "utf8")

test("departments are canonical company-scoped many-to-many membership", () => {
  assert.match(migration, /create table if not exists public\."cmp_Departments"/)
  assert.match(migration, /create table if not exists public\."cmp_Users_Departments"/)
  assert.match(migration, /primary key \("User_ID", "Department_ID"\)/)
  assert.match(migration, /"Company_ID", lower\(btrim\("Department_Name"\)\)/)
  assert.match(migration, /enable row level security/g)
})

test("broadcast persistence is tenant private and keeps immutable recipient evidence", () => {
  assert.match(migration, /create table if not exists public\."DEV_Broadcasts"/)
  assert.match(migration, /create table if not exists public\."DEV_BroadcastRecipients"/)
  assert.match(migration, /BroadcastRecipient_EmailSnapshot/)
  assert.match(migration, /BroadcastRecipient_DepartmentsJSON/)
  assert.match(migration, /unique \("Company_ID", "Broadcast_IdempotencyKey"\)/)
  assert.match(migration, /revoke all on table[\s\S]+from public, anon, authenticated/)
})

test("only developer administrators receive broadcast permissions", () => {
  assert.match(migration, /'Broadcasts\.Read'/)
  assert.match(migration, /'Broadcasts\.Manage'/)
  assert.match(migration, /'Broadcasts\.Send'/)
  assert.match(migration, /\('Administrator','Broadcasts\.Send'\)/)
  assert.match(migration, /\('System Admin','Broadcasts\.Send'\)/)
  assert.doesNotMatch(migration, /\('Operator','Broadcasts\./)
})

test("AI can draft only with the requested model and cannot send", () => {
  assert.match(edge, /model: "gpt-5\.6-luna"/)
  assert.match(edge, /Do not invent dates, incidents, promises, recipients, links or completed actions/)
  assert.match(edge, /administrator must review and explicitly send it later/i)
  assert.match(edge, /requirePermission\(admin, current\.User_ID, "Broadcasts\.Manage"\)/)
  assert.match(edge, /requirePermission\(admin, current\.User_ID, "Broadcasts\.Send"\)/)
})

test("dispatch uses Resend only and double-send protection is server-side", () => {
  assert.match(edge, /fetch\("https:\/\/api\.resend\.com\/emails"/)
  assert.match(edge, /Deno\.env\.get\("RESEND_API_KEY"\)/)
  assert.match(edge, /from: MULTIDECK_EMAIL_FROM, reply_to: MULTIDECK_EMAIL_REPLY_TO/)
  assert.match(edge, /\.eq\("Broadcast_StatusCode", "draft"\)\.eq\("Broadcast_IdempotencyKey", key\)/)
  assert.match(edge, /"Idempotency-Key": idempotencyKey/)
  assert.match(edge, /"dispatch_completed"/)
  assert.doesNotMatch(edge, /safeDeliveryMode|mock_dispatch_completed|StatusCode: "mocked"/)
  assert.doesNotMatch(client, /broadcastQa|Confirm mock dispatch|Mock delivery|mocked dispatch/)
})

test("recipient exclusions and review evidence are visible", () => {
  assert.match(core, /Access is not active/)
  assert.match(core, /Invitation has not been accepted/)
  assert.match(core, /Email address is unavailable/)
  assert.match(client, /Excluded recipients/)
  assert.match(client, /WizardDialog/)
  assert.match(client, /New broadcast/)
  assert.match(client, /submitLabel="Send broadcast"/)
  assert.match(client, /ServerEmailPreview/)
  assert.match(edge, /emailPreview: rendered \? \{ html: rendered\.html, text: rendered\.text \}/)
  assert.match(edge, /renderedMessage\(locked\.Broadcast_Subject, locked\.Broadcast_Body, await readConfiguredTenantBrand\(admin, current\.Company_ID\)\)/)
  assert.doesNotMatch(edge, /This administrative message was sent to active users/)
})

test("history owns the full page width and adapts without a delivery sidebar", () => {
  assert.match(client, /function BroadcastHistory/)
  assert.match(client, /sm:hidden/)
  assert.match(client, /className="hidden sm:block/)
  assert.match(client, /minimumWidth=\{760\}/)
  assert.match(client, /deliveredCount/)
  assert.match(client, /failedCount/)
  assert.doesNotMatch(client, /Resend delivery|xl:grid-cols-\[minmax\(0,1fr\)_320px\]/)
})

test("broadcast heading keeps its helper copy beneath the title", () => {
  assert.match(client, /descriptionPlacement="under-title"/)
  assert.match(client, /New broadcast/)
})

test("Dexter reads and watches broadcasts without broadening authorization", () => {
  assert.match(migration, /multideck_dexter_domain_broadcasts/)
  assert.match(migration, /permission\."sys_Permission_Value"='Broadcasts\.Read'/)
  assert.match(migration, /_multideck_broadcast_watch_guard/)
  assert.match(migration, /_multideck_broadcast_watch_signal/)
  assert.match(migration, /AI_DexterWatchSignals/)
  assert.match(dexter, /Developer broadcast history is available to Dexter as permission-gated read evidence/)
  assert.match(dexter, /Never claim to draft, edit or send a broadcast from chat/)
})
