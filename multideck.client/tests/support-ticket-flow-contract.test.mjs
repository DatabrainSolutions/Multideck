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
const imageLightbox = readFileSync(
  new URL("../src/components/multideck/image-lightbox.tsx", import.meta.url),
  "utf8",
)

test("support ticket rollout fails closed in production", () => {
  assert.equal(resolveSupportTicketFeatureEnabled(true, undefined), true)
  assert.equal(resolveSupportTicketFeatureEnabled(false, undefined, "dev.multideck.app"), true)
  assert.equal(resolveSupportTicketFeatureEnabled(false, "false", "DEV.MULTIDECK.APP"), true)
  assert.equal(resolveSupportTicketFeatureEnabled(false, "true"), true)
  assert.equal(resolveSupportTicketFeatureEnabled(false, undefined), false)
  assert.equal(resolveSupportTicketFeatureEnabled(false, undefined, "jenkar.multideck.app"), false)
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

test("bug tickets ask what happened without retaining an expected-behaviour field", () => {
  assert.doesNotMatch(dialog, /Expected behaviour/)
  assert.doesNotMatch(dialog, /support-ticket-expected/)
  assert.match(dialog, /expectedBehaviour: null, actualBehaviour:/)
  assert.match(dialog, /delete cleaned\.expectedBehaviour/)
  assert.match(dialog, /<Field label=\{t\("What happened"\)\} htmlFor="support-ticket-actual"/)
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
  assert.match(dialog, /const maximumAttachmentCount = 5/)
  assert.match(dialog, /const maximumAttachmentBytes = 10 \* 1024 \* 1024/)
  assert.match(dialog, /const maximumAttachmentTotalBytes = 25 \* 1024 \* 1024/)
  assert.match(dialog, /accept="image\/png,image\/jpeg,image\/webp"/)
})

test("ticket attachments use square icon-only previews and a keyboard-safe shared-image lightbox", () => {
  assert.match(dialog, /role="list" aria-label=\{t\("Attached screenshots"\)\}/)
  assert.match(dialog, /className="size-20 overflow-hidden rounded-\[var\(--md-radius-lg\)\]/)
  assert.doesNotMatch(dialog, /Math\.max\(1, Math\.round\(file\.size \/ 1024\)\)/)
  assert.match(dialog, /aria-label=\{t\("Edit screenshot"\)\}[\s\S]*?<Pencil/)
  assert.match(dialog, /aria-label=\{t\("Remove screenshot"\)\}[\s\S]*?<Trash2/)
  assert.match(dialog, /<ImageLightbox[\s\S]*?items=\{lightboxItems\}/)
  assert.match(dialog, /layoutId=\{imageLightbox\.layoutIdFor\(key\)\}/)
  assert.match(imageLightbox, /type ImageLightboxPhase = "closed" \| "opening" \| "open" \| "closing"/)
  assert.match(imageLightbox, /event\.key === "ArrowLeft"[\s\S]*?move\(-1\)[\s\S]*?event\.key === "ArrowRight"[\s\S]*?move\(1\)/)
  assert.match(imageLightbox, /onCloseAutoFocus=\{\(event\) => \{ event\.preventDefault\(\); returnFocus\(\) \}\}/)
  assert.match(imageLightbox, /setPhase\(reducedMotion \? "open" : "opening"\)/)
  assert.match(imageLightbox, /phase === "closing" \? 0\.2 : 0\.28/)
})

test("the ticket form uses a compact desktop dialog and reflows dense choices on narrow screens", () => {
  assert.match(dialog, /sm:max-w-\[680px\]/)
  assert.doesNotMatch(dialog, /className="h-\[min\(90vh,860px\)\] max-w-\[760px\]/)
  assert.match(dialog, /<ToggleGroup type="single" value=\{draft.ticketType\}/)
  assert.match(dialog, /grid-cols-1 min-\[480px\]:grid-cols-3/)
  assert.match(dialog, /sm:\[&>button\]:w-auto/)
  assert.match(dialog, /closeLabel=\{t\("Close"\)\}/)
})

test("impact choices use severity pills with an animated selected icon", () => {
  assert.match(dialog, /const impactOptions: SupportTicketImpact\[\] = \["no_immediate_blocker", "slowed_down", "blocked"\]/)
  assert.match(dialog, /blocked: \{ background: "--md-status-red-bg", ink: "--md-status-red-ink", indicator: "--md-red" \}/)
  assert.match(dialog, /slowed_down: \{ background: "--md-status-amber-bg", ink: "--md-status-amber-ink", indicator: "--md-amber" \}/)
  assert.match(dialog, /no_immediate_blocker: \{ background: "--md-status-green-bg", ink: "--md-status-green-ink", indicator: "--md-green" \}/)
  assert.match(dialog, /role="radiogroup"[\s\S]*?rounded-full[\s\S]*?<AnimatePresence initial=\{false\}>/)
  assert.match(dialog, /opacity: 0, y: 2/)
  assert.match(dialog, /reduceMotion\(Boolean\(shouldReduceMotion\), mdMotion\.micro\)/)
  assert.match(dialog, /useReducedMotion\(\)/)
})

test("closing a started ticket uses the branded draft confirmation", () => {
  assert.doesNotMatch(dialog, /window\.confirm\(t\("Close this ticket/)
  assert.match(dialog, /Close this ticket request\?/)
  assert.match(dialog, /Your written draft will be here next time\. Screenshots are kept only for this session\./)
  assert.match(dialog, /Close request/)
  assert.match(dialog, /Keep editing/)
  assert.match(dialog, /if \(submitting\) return/)
})
