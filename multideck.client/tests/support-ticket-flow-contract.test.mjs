import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { resolveSupportTicketFeatureEnabled } from "../src/lib/support-ticket-feature.ts"
import {
  isSecureSupportStatusUrl,
  normalizeSupportTicketConditionalFields,
} from "../src/lib/support-ticket-submission.ts"

const dialog = readFileSync(
  new URL("../src/components/multideck/support-ticket-dialog.tsx", import.meta.url),
  "utf8",
)
const client = readFileSync(
  new URL("../src/lib/support-ticket.ts", import.meta.url),
  "utf8",
)

test("support ticket rollout fails closed in production", () => {
  assert.equal(resolveSupportTicketFeatureEnabled(true, undefined), true)
  assert.equal(resolveSupportTicketFeatureEnabled(false, "true"), true)
  assert.equal(resolveSupportTicketFeatureEnabled(false, undefined), false)
  assert.equal(resolveSupportTicketFeatureEnabled(false, "false"), false)
  assert.equal(resolveSupportTicketFeatureEnabled(false, "TRUE"), false)
})

test("conditional fields and screenshots cannot leak after the ticket type changes", () => {
  const screenshot = { name: "stale.png" }
  assert.deepEqual(
    normalizeSupportTicketConditionalFields("question", {
      expectedBehaviour: "Hidden bug expectation",
      actualBehaviour: "Hidden bug outcome",
      desiredOutcome: "Hidden feature outcome",
      attachments: [screenshot],
    }),
    { expectedBehaviour: null, actualBehaviour: null, desiredOutcome: null, attachments: [] },
  )
  assert.deepEqual(
    normalizeSupportTicketConditionalFields("feature_request", {
      expectedBehaviour: "Hidden bug expectation",
      actualBehaviour: "Hidden bug outcome",
      desiredOutcome: "Keep the feature outcome",
      attachments: [screenshot],
    }),
    { expectedBehaviour: null, actualBehaviour: null, desiredOutcome: "Keep the feature outcome", attachments: [] },
  )
  assert.match(dialog, /Changing the ticket type will remove attached screenshots\. Continue\?/)
  assert.match(client, /normalizeSupportTicketConditionalFields\(request\.ticketType, request\)/)
})

test("a persisted ticket is not presented as success without a valid secure status URL", () => {
  assert.equal(isSecureSupportStatusUrl("https://support.multideck.app/ticket/token"), true)
  assert.equal(isSecureSupportStatusUrl("http://support.multideck.app/ticket/token"), false)
  assert.equal(isSecureSupportStatusUrl("https://"), false)
  assert.equal(isSecureSupportStatusUrl("https://user:secret@support.multideck.app/ticket/token"), false)
  assert.equal(isSecureSupportStatusUrl(null), false)
  assert.match(client, /support_status_link_unavailable/)
})

test("the screenshot surface discloses and enforces the exact attachment constraints", () => {
  assert.match(dialog, /maximumAttachmentCount = 5/)
  assert.match(dialog, /maximumAttachmentBytes = 10 \* 1024 \* 1024/)
  assert.match(dialog, /maximumAttachmentTotalBytes = 25 \* 1024 \* 1024/)
  assert.match(dialog, /Up to five PNG, JPEG, or WebP images; 10 MB each and 25 MB total\./)
  assert.match(dialog, /accept="image\/png,image\/jpeg,image\/webp"/)
})

test("the ticket form uses the wide desktop dialog and reflows dense choices on narrow screens", () => {
  assert.match(dialog, /sm:max-w-\[760px\]/)
  assert.doesNotMatch(dialog, /className="h-\[min\(90vh,860px\)\] max-w-\[760px\]/)
  assert.match(dialog, /col-span-2 sm:col-span-1/)
  assert.match(dialog, /grid-cols-1 min-\[480px\]:grid-cols-3/)
  assert.match(dialog, /sm:\[&>button\]:w-auto/)
  assert.match(dialog, /closeLabel=\{t\("Close"\)\}/)
})
