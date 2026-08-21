import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

const [core, workflow, api, page] = await Promise.all([
  read("supabase/functions/quotes-workflow/core.ts"),
  read("supabase/functions/quotes-workflow/index.ts"),
  read("multideck.client/src/lib/quote-workflow-api.ts"),
  read("multideck.client/src/pages/quotes-page.tsx"),
])

test("quote email refinement is an allowlisted, review-only action", () => {
  assert.match(core, /"issue-refine"/)
  assert.match(workflow, /if \(action === "issue-refine"\)/)
  assert.match(workflow, /reasoning: \{ effort: "low" \}/)
  assert.match(workflow, /The branded email template supplies the secure View quote button/)
  assert.match(api, /action: "issue-refine"/)
})

test("selection refinement cannot silently change text outside the selection", () => {
  assert.match(workflow, /bodyText\.slice\(0, start\).*replacement.*bodyText\.slice\(end\)/s)
  assert.match(workflow, /The final non-empty line must remain the supplied senderFirstName/)
  assert.match(page, /issueEmailBody\.slice\(selection\.start, selection\.end\) !== selection\.text/)
})

test("the quote modal separates the connected sender from the neutral recipient and confirms delivery in green", () => {
  assert.match(page, /MailProviderMark provider=\{mailbox\.provider\}/)
  assert.match(page, /\{t\("From"\)\}/)
  assert.match(page, /listMailboxes\(\)\.catch\(\(\) => \[\]\)/)
  assert.match(page, /<Mail className="size-4 shrink-0 text-\[var\(--md-subtle\)\]"/)
  assert.doesNotMatch(page, /recipient\.kind === "general" \? `\$\{t\("General"\)\}/)
  assert.doesNotMatch(page, /\{t\("This quote is ready to send\."\)\}/)
  assert.match(page, /if \(!result\.delivered\) throw new Error/)
  assert.match(page, /bg-\[var\(--md-status-green-bg\)\] text-\[var\(--md-status-green-ink\)\]/)
  assert.match(page, /issueDeliveryState === "sent" \? "Quote sent"/)
})

test("quote delivery uses the selected connected mailbox with trusted branded HTML", () => {
  assert.match(workflow, /const mailboxId = parseUuid\(body\.mailboxId, "Sending mailbox"\)/)
  assert.match(workflow, /sendConnectedMailbox\(admin, inboxActor/)
  assert.match(workflow, /bodyHtml: rendered\.html/)
  assert.match(api, /mailboxId, subject, bodyText, expiryPreset/)
})
