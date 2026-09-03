import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const sidebar = readFileSync(new URL("../src/components/multideck/app-sidebar.tsx", import.meta.url), "utf8")
const navigation = readFileSync(new URL("../src/data/navigation-data.ts", import.meta.url), "utf8")

test("static navigation has no decorative numeric pills, including legacy entries", () => {
  assert.doesNotMatch(navigation, /value:\s*["']\d[\d,.+]*["']/u)
  for (const label of ["Leads", "Deals", "Warehouse", "Customers", "CRM", "Exceptions"]) {
    const entries = navigation.split("\n").filter((line) => line.includes(`label: "${label}"`))
    assert.ok(entries.length > 0, `${label} remains in navigation`)
    for (const entry of entries) assert.doesNotMatch(entry, /\bvalue:/u)
  }
})

test("sidebar does not fetch record totals or inject them into shared navigation", () => {
  assert.doesNotMatch(sidebar, /listLeadsPage|listDealsPage|crmLeadCount|crmDealCount/u)
  const availableAreas = sidebar.slice(sidebar.indexOf("const availableAreas ="), sidebar.indexOf("const favouriteCandidates ="))
  assert.doesNotMatch(availableAreas, /\bvalue:/u)
  assert.match(availableAreas, /canReadPhoneCalls/u)
  assert.match(availableAreas, /canManageWarehouseUsers/u)
})

test("personal, shared, mailbox and folder unread counts remain available", () => {
  assert.doesNotMatch(sidebar, />\{folderRows\.length\}</u)
  assert.match(sidebar, /personalMailboxes\.reduce\(\(sum, mailbox\) => sum \+ mailbox\.unreadCount, 0\)/u)
  assert.match(sidebar, /sharedMailboxes\.reduce\(\(sum, mailbox\) => sum \+ mailbox\.unreadCount, 0\)/u)
  assert.match(sidebar, /const count = \(value: number\) => value > 0 \? String\(value\) : undefined/u)
  assert.match(sidebar, /value: count\(personalUnread\)/u)
  assert.match(sidebar, /value: count\(sharedUnread\)/u)
  assert.match(sidebar, /mailbox\.unreadCount > 0 \? \(/u)
  assert.match(sidebar, /folder\.unreadCount \? \(/u)
})

test("notification bell is still driven by unread state and keeps its controls", () => {
  assert.match(sidebar, /notifications\.filter\(\(notification\) => notification\.status === "unread"\)\.length/u)
  assert.match(sidebar, /\{unreadCount > 0 \? <motion\.span/u)
  assert.match(sidebar, /disabled=\{unreadCount === 0\} onClick=\{markAllRead\}/u)
  assert.match(sidebar, /aria-label=\{t\("Open notifications"\)\}/u)
})
