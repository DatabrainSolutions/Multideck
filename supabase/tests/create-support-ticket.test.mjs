import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { stripTypeScriptTypes } from "node:module"

const edgeFunction = readFileSync(
  new URL("../functions/create-support-ticket/index.ts", import.meta.url),
  "utf8",
)
const cloudContract = readFileSync(
  new URL("../functions/create-support-ticket/cloud-contract.ts", import.meta.url),
  "utf8",
)
const { cloudSupportHeaders } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(cloudContract)).toString("base64")}`)
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

test("signs intake with the deployed Ed25519 contract without transmitting the private key", async () => {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])
  const privateKey = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64")
  const body = JSON.stringify({ action: "finalize", draftId: "example" })
  const headers = await cloudSupportHeaders(privateKey, "support-test-key", "dev.multideck.app", body, 1788556491000, "unique-nonce")
  const digest = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))).toString("hex")
  const message = `${headers["x-multideck-timestamp"]}.unique-nonce.${digest}.dev.multideck.app.support-test-key`
  const signature = Buffer.from(headers["x-multideck-signature"], "base64")
  assert.equal(await crypto.subtle.verify("Ed25519", pair.publicKey, signature, new TextEncoder().encode(message)), true)
  for (const altered of [message.replace("dev.multideck.app", "another.multideck.app"), message.replace("support-test-key", "another-key"), message.replace("unique-nonce", "replayed-nonce"), message.replace(digest, "0".repeat(64))]) {
    assert.equal(await crypto.subtle.verify("Ed25519", pair.publicKey, signature, new TextEncoder().encode(altered)), false)
  }
  assert.equal(headers["x-multideck-key-id"], "support-test-key")
  assert.equal(headers["x-multideck-tenant-host"], "dev.multideck.app")
  assert.equal(JSON.stringify(headers).includes(privateKey), false)
  assert.equal("x-multideck-credential" in headers, false)
  assert.equal("x-multideck-tenant-id" in headers, false)
})

test("detects nested spoofed customer selectors", () => {
  assert.match(cloudContract, /FORBIDDEN_CUSTOMER_KEYS = new Set\(\["tenantid", "customerid"\]\)/)
  assert.match(cloudContract, /containsCustomerSelector\(nested, depth \+ 1\)/)
  assert.match(cloudContract, /key\.toLowerCase\(\)\.replaceAll/)
})

test("derives the reporter for every intake stage and rejects browser customer identity", () => {
  assert.match(edgeFunction, /containsCustomerSelector\(body\)/)
  assert.match(edgeFunction, /reporterUserId: reporter\.workspaceUser\.User_ID/)
  assert.match(edgeFunction, /\["create_draft", "prepare_attachment", "complete_attachment", "finalize", "list_tickets", "get_ticket", "add_comment"\]/)
  assert.match(edgeFunction, /cloudBody\.reporterName = reporter\.name/)
  assert.match(edgeFunction, /cloudBody\.reporterEmail = reporter\.email/)
})

test("defaults to the legacy Databrain path and only enables Cloud from a server-side flag", () => {
  assert.match(edgeFunction, /Deno\.env\.get\("MULTIDECK_CLOUD_SUPPORT_ENABLED"\).*=== "true"/)
  assert.match(edgeFunction, /cloudTicketingEnabled[\s\S]*handleCloudTicket[\s\S]*handleLegacyTicket/)
  assert.match(edgeFunction, /DATABRAIN_TICKET_WEBHOOK_URL/)
  assert.match(edgeFunction, /X-Databrain-Webhook-Secret/)
  assert.match(edgeFunction, /MULTIDECK_CLOUD_SUPPORT_SIGNING_PRIVATE_KEY/)
  assert.match(edgeFunction, /MULTIDECK_CLOUD_SUPPORT_KEY_ID/)
  assert.doesNotMatch(edgeFunction, /body\.MULTIDECK_CLOUD_SUPPORT_ENABLED|body\.cloudTicketingEnabled/)
})

test("keeps the legacy Settings form visible while the Cloud rollout flag is off", () => {
  assert.match(settingsPage, /supportTicketFeatureEnabled \? <SupportHubTab navigate=\{navigate\} \/> : <LegacySupportTab \/>/)
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
