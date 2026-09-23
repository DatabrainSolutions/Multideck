import assert from "node:assert/strict"
import test from "node:test"
import { notificationPreviewText } from "../src/lib/notification-preview.ts"

test("task previews retain readable labels without Markdown or link destinations", () => {
  const body = '## Update prepared\n\n- Found [Demo Organisation 037, account code CUS0007](/customers/customer-37 "Demo Organisation 037").\n- Change `hello@example.test` to **new@example.test**. No change has been made yet.'
  assert.equal(notificationPreviewText(body), "Update prepared Found Demo Organisation 037, account code CUS0007. Change hello@example.test to new@example.test. No change has been made yet.")
})

test("links with nested parentheses and reference links keep only their labels", () => {
  assert.equal(notificationPreviewText('[**Job (review)**](/jobs/job(1)) and [the account][account].\n\n[account]: /customers/1 "Account"'), "Job (review) and the account.")
})

test("plain operational identifiers, punctuation and empty messages are preserved", () => {
  for (const body of ["", "JE0991133 · GBP 16.18", "Account customer_37: 2 * 3 = 6; < 10 pallets.", "Email hello@example.test — no change made."]) {
    assert.equal(notificationPreviewText(body), body)
  }
})

test("block formatting is flattened without displaying HTML or image URLs", () => {
  assert.equal(notificationPreviewText('> Review **this**\n\n1. First\n2. Second\n\n![Invoice](/private/image.png) <img src="/track">'), "Review this First Second Invoice")
})
