import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const edgeFunction = readFileSync(
  new URL("../functions/create-support-ticket/index.ts", import.meta.url),
  "utf8",
)
const cloudContract = readFileSync(
  new URL("../functions/create-support-ticket/cloud-contract.ts", import.meta.url),
  "utf8",
)
const client = readFileSync(
  new URL("../../multideck.client/src/lib/support-ticket.ts", import.meta.url),
  "utf8",
)
const settingsPage = readFileSync(
  new URL("../../multideck.client/src/pages/settings-page.tsx", import.meta.url),
  "utf8",
)
const legacyValidation = readFileSync(
  new URL("../functions/create-support-ticket/validation.ts", import.meta.url),
  "utf8",
)
const legacyContract = readFileSync(
  new URL("../functions/create-support-ticket/contract.ts", import.meta.url),
  "utf8",
)

test("signs intake without sending a browser customer or tenant selector", () => {
  assert.match(cloudContract, /crypto\.subtle\.sign\("Ed25519"/)
  assert.match(cloudContract, /`\$\{timestamp\}\.\$\{nonce\}\.\$\{bodyDigest\}\.\$\{tenantHost\}\.\$\{keyId\}`/)
  assert.match(cloudContract, /"x-multideck-key-id": keyId/)
  assert.match(cloudContract, /"x-multideck-tenant-host": tenantHost/)
  assert.doesNotMatch(cloudContract, /x-multideck-credential/i)
  assert.doesNotMatch(cloudContract, /x-multideck-tenant-id/i)
})

test("detects nested spoofed customer selectors", () => {
  assert.match(cloudContract, /FORBIDDEN_CUSTOMER_KEYS = new Set\(\["tenantid", "customerid"\]\)/)
  assert.match(cloudContract, /containsCustomerSelector\(nested, depth \+ 1\)/)
  assert.match(cloudContract, /key\.toLowerCase\(\)\.replaceAll/)
})

test("derives the reporter for every intake stage and rejects browser customer identity", () => {
  assert.match(edgeFunction, /containsCustomerSelector\(body\)/)
  assert.match(edgeFunction, /reporterUserId: reporter\.workspaceUser\.User_ID/)
  assert.match(edgeFunction, /\["create_draft", "prepare_attachment", "complete_attachment", "finalize"\]/)
})

test("defaults to the legacy Databrain path and only enables Cloud from a server-side flag", () => {
  assert.match(edgeFunction, /Deno\.env\.get\("MULTIDECK_CLOUD_SUPPORT_ENABLED"\).*=== "true"/)
  assert.match(edgeFunction, /cloudTicketingEnabled[\s\S]*handleCloudTicket[\s\S]*handleLegacyTicket/)
  assert.match(edgeFunction, /DATABRAIN_TICKET_WEBHOOK_URL/)
  assert.match(edgeFunction, /X-Databrain-Webhook-Secret/)
  assert.match(edgeFunction, /MULTIDECK_CLOUD_SUPPORT_SIGNING_PRIVATE_KEY/)
  assert.match(edgeFunction, /MULTIDECK_CLOUD_SUPPORT_KEY_ID/)
  assert.doesNotMatch(edgeFunction, /MULTIDECK_CLOUD_SUPPORT_CREDENTIAL/)
  assert.doesNotMatch(edgeFunction, /body\.MULTIDECK_CLOUD_SUPPORT_ENABLED|body\.cloudTicketingEnabled/)
})

test("keeps the legacy Settings form visible while the Cloud rollout flag is off", () => {
  assert.match(settingsPage, /supportTicketFeatureEnabled \? <SupportHubTab \/> : <LegacySupportTab \/>/)
  assert.match(settingsPage, /createLegacySupportTicket\(\{/)
  assert.match(settingsPage, /topic,[\s\S]*priority,[\s\S]*applicationUrl: window\.location\.href/)
})

test("normalises the established legacy request without accepting requester identity", () => {
  assert.match(legacyValidation, /export function validateSupportTicketRequest/)
  assert.match(legacyValidation, /priority === "normal" \|\| priority === "medium"/)
  assert.match(legacyValidation, /idempotencyKey,[\s\S]*topic,[\s\S]*title,[\s\S]*description,[\s\S]*priority: normalizedPriority,[\s\S]*applicationUrl/)
  assert.doesNotMatch(legacyValidation, /requester|customerId|tenantId/)
})

test("rejects unsafe legacy keys, values and application URLs", () => {
  assert.match(legacyValidation, /idempotencyKey\.length < 8 \|\| !\/\^\[A-Za-z0-9\._:-\]\+\$\//)
  assert.match(legacyValidation, /TOPICS\.has\(topic\)/)
  assert.match(legacyValidation, /description\.length < 20/)
  assert.match(legacyValidation, /parsed\.protocol === "https:" \|\| parsed\.protocol === "http:"/)
})

test("maps the authenticated requester into the legacy payload without credentials", () => {
  assert.match(legacyContract, /export function buildDatabrainTicketPayload/)
  assert.match(legacyContract, /requester: \{[\s\S]*name: requester\.name,[\s\S]*email: requester\.email/)
  assert.match(legacyContract, /clientName: requester\.companyName/)
  assert.doesNotMatch(legacyContract, /webhookSecret|authorization|cookie/i)
})

test("requires a confirmed legacy ticket and only accepts HTTPS status links", () => {
  assert.match(legacyValidation, /parsed\.protocol === "https:" \? parsed\.toString\(\) : null/)
  assert.match(legacyContract, /if \(!ticketNumber \|\| !createdAt\) return null/)
  assert.match(legacyContract, /status: duplicate \? 200 : 201/)
})

test("preserves legacy upstream failure semantics", () => {
  assert.match(legacyContract, /status === 400[\s\S]*code: "validation_error"/)
  assert.match(legacyContract, /status === 409[\s\S]*code: "idempotency_conflict"/)
  assert.match(legacyContract, /status === 413[\s\S]*code: "ticket_too_large"/)
  assert.match(legacyContract, /return \{[\s\S]*status: 503,[\s\S]*code: "support_service_unavailable"/)
})

test("completes uploads by server-owned attachment id only", () => {
  assert.match(client, /invoke\(\{ action: "complete_attachment", attachmentId: prepared\.attachment\.id \}, 30_000\)/)
  assert.doesNotMatch(client, /action: "complete_attachment"[^\n]+storagePath/)
})

test("does not send a public status token from the browser", () => {
  assert.match(client, /\{ action: "finalize", draftId: created\.draft\.id \}/)
  assert.doesNotMatch(client, /publicStatusToken|multideck-status:/)
  assert.doesNotMatch(edgeFunction, /publicStatusToken/)
})
