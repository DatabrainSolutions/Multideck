import assert from "node:assert/strict"
import test from "node:test"
import { readableWatchEvent, readableWatchSummary } from "../src/lib/dexter-watch-copy.ts"

const t = (text: string) => text

test("turns email watch rule syntax into an operator-facing description", () => {
  assert.equal(readableWatchSummary({
    title: "Invoice email from hazphillips@outlook.com",
    summary: "Detect an email from hazphillips@outlook.com containing invoice.",
    capability: "email",
    rule: { field: "searchText", operator: "contains_all", value: "hazphillips@outlook.com invoice" },
  }, t), "Emails from hazphillips@outlook.com that mention “invoice”.")
})

test("turns a technical record event into the change an operator needs to know", () => {
  assert.equal(readableWatchEvent({
    title: "Horizon robotics expansion becomes qualified",
    summary: "Watch this deal.",
    capability: "deals",
    targetLabel: "Horizon robotics expansion",
    rule: { field: "stage", operator: "eq", value: "Qualified" },
    latestEvent: {
      body: "Horizon robotics expansion: stage changed from New enquiry to Qualified.",
      changed: { field: "stage", before: "New enquiry", after: "Qualified" },
    },
  }, t), "Horizon robotics expansion moved from New enquiry to Qualified.")
})

test("makes a matching email update direct and readable", () => {
  assert.equal(readableWatchEvent({
    title: "Invoice email",
    summary: "Watch invoice emails.",
    capability: "email",
    rule: { field: "searchText", operator: "contains_all", value: "invoice" },
    latestEvent: {
      body: "New matching email from Harry Phillips: Fw: Update on booking ref 123.",
      changed: { senderName: "Harry Phillips", subject: "Fw: Update on booking ref 123" },
    },
  }, t), "Email from Harry Phillips: Fw: Update on booking ref 123")
})
