import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const accounts = await readFile(new URL("../src/pages/crm-accounts-page.tsx", import.meta.url), "utf8")
const leads = await readFile(new URL("../src/components/multideck/crm-components.tsx", import.meta.url), "utf8")
const api = await readFile(new URL("../src/lib/crm-engagement.ts", import.meta.url), "utf8")
const migration = await readFile(new URL("../../supabase/migrations/20260818225253_crm_engagement_temperature_signals.sql", import.meta.url), "utf8")

test("Accounts and Leads expose one activity-based Temperature column", () => {
  assert.match(accounts, /id: "temperature", label: "Temperature", kind: "status"/u)
  assert.match(leads, /id: "temperature",\s+label: "Temperature",\s+kind: "status"/u)
  assert.doesNotMatch(leads, /id: "qualification",\s+label: "Qualification"/u)
})

test("temperature pills share Cold, Warm and Hot semantic presentation", () => {
  assert.match(api, /export type CrmEngagementTemperature = "Cold" \| "Warm" \| "Hot"/u)
  assert.match(api, /temperature === "Hot"\) return "green"/u)
  assert.match(api, /temperature === "Warm"\) return "amber"/u)
  assert.match(api, /return "blue"/u)
  assert.match(accounts, /engagementTemperatureTone\(signal\.temperature\)/u)
  assert.match(leads, /engagementTemperatureTone\(signal\.temperature\)/u)
})

test("the server score combines recent CRM activity and connected email exchanges behind permission checks", () => {
  assert.match(migration, /'Customers\.Read'/u)
  assert.match(migration, /'CRM\.Read'/u)
  assert.match(migration, /'Email\.Read'/u)
  assert.match(migration, /activity_count_30d \* 10/u)
  assert.match(migration, /email_count_30d \* 5/u)
  assert.match(migration, /inbound_email_count_30d \* 5/u)
  assert.match(migration, /score >= 70 then 'Hot'.*score >= 30 then 'Warm'.*else 'Cold'/su)
  assert.match(migration, /revoke all on function public\.multideck_crm_engagement_signals\(uuid\[\], uuid\[\]\) from public, anon/u)
})
