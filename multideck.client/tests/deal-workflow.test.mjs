import assert from "node:assert/strict"
import test from "node:test"
import { dealLocalDateTime, isLostDealStage, isOpenDealStage, formatDealDate, validateDealLoss, validateDealNextAction } from "../src/lib/deal-workflow.ts"

const action = { title: "Confirm weekly volumes", ownerId: "maya", dueAt: "2026-09-23T10:30" }

test("a next action needs a usable commitment, a person and a real date", () => {
  assert.equal(validateDealNextAction(action), null)
  assert.match(validateDealNextAction({ ...action, title: "  " }), /Describe/)
  assert.match(validateDealNextAction({ ...action, title: "a".repeat(241) }), /240/)
  assert.match(validateDealNextAction({ ...action, ownerId: "" }), /Choose who/)
  assert.match(validateDealNextAction({ ...action, dueAt: "not a date" }), /date and time/)
  // Overdue actions must remain editable; the interface should not erase reality.
  assert.equal(validateDealNextAction({ ...action, dueAt: "2020-01-01T10:00" }), null)
})

test("datetime editor preserves local wall time including dates that cross UTC midnight", () => {
  const local = new Date(2026, 8, 23, 0, 15)
  const draft = dealLocalDateTime(local.toISOString())
  assert.equal(draft, "2026-09-23T00:15")
  assert.equal(new Date(draft).getTime(), local.getTime())
  assert.equal(dealLocalDateTime("invalid"), "")
})

test("loss capture requires a recognised reason and context for Other", () => {
  assert.equal(validateDealLoss({ reasonCode: "price", details: "", revisitDate: "" }), null)
  assert.match(validateDealLoss({ reasonCode: "", details: "", revisitDate: "" }), /Choose/)
  assert.match(validateDealLoss({ reasonCode: "made_up", details: "", revisitDate: "" }), /Choose/)
  assert.match(validateDealLoss({ reasonCode: "other", details: "  ", revisitDate: "" }), /explanation/)
  assert.equal(validateDealLoss({ reasonCode: "other", details: "Supplier closed", revisitDate: "2026-12-01" }), null)
  assert.match(validateDealLoss({ reasonCode: "timing", details: "", revisitDate: "later" }), /valid revisit/)
  assert.match(validateDealLoss({ reasonCode: "timing", details: "", revisitDate: "2026-02-31" }), /valid revisit/)
})

test("only deliberate Lost destinations trigger structured loss capture", () => {
  for (const name of ["Lost", " Closed lost ", "CLOSED_LOST", "Closed-lost"]) assert.equal(isLostDealStage({ name }), true)
  for (const name of ["At risk", "Lost contact", "Won", "Negotiation"]) assert.equal(isLostDealStage({ name }), false)
})


test("reopening offers only genuinely open pipeline stages", () => {
  assert.equal(isOpenDealStage({ name: "Negotiation", isConversion: false }), true)
  for (const name of ["Won", "Closed won", "Lost", "Closed_lost"]) assert.equal(isOpenDealStage({ name, isConversion: false }), false)
  assert.equal(isOpenDealStage({ name: "Customer activated", isConversion: true }), false)
})


test("legacy lost outcomes never invent a date or crash when no date was captured", () => {
  for (const locale of ["en-GB", "en-US"]) {
    assert.equal(formatDealDate(null, locale), "Not recorded")
    assert.equal(formatDealDate(undefined, locale), "Not recorded")
    assert.equal(formatDealDate("invalid", locale), "Not recorded")
    assert.match(formatDealDate("2026-09-22T12:00:00Z", locale), /2026/)
  }
})
