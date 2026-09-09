import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const root = resolve(import.meta.dirname, "../..")
const service = readFileSync(
  resolve(root, "multideck.server/Modules/Inbox/Subscriptions/InboxProviderSubscriptionService.cs"),
  "utf8",
)
const worker = readFileSync(
  resolve(root, "multideck.server/Modules/Inbox/Subscriptions/InboxProviderSubscriptionWorker.cs"),
  "utf8",
)

test("provider leases are tenant-local, renewable, and Vault-backed", () => {
  assert.match(service, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/watch/)
  assert.match(service, /graph\.microsoft\.com\/v1\.0\/subscriptions/)
  assert.match(service, /comm_put_email_secret/)
  assert.match(service, /CommProviderSubscription_ClientStateSecretRef/)
  assert.match(service, /CommProviderSubscription_NextRenewalAt/)
  assert.match(service, /StatusCode" = 'renewing'/)
})

test("shared Graph mailboxes remain on the polling correctness path", () => {
  assert.match(service, /CommMailboxTypeCode == "personal"/)
  assert.match(service, /notifications are not supported/)
  assert.doesNotMatch(service, /CommMailboxTypeCode == "shared"/)
})

test("tenant worker runs bounded OAuth state cleanup", () => {
  assert.match(worker, /OAuthStatePurgeIntervalHours/)
  assert.match(worker, /PurgeExpiredOAuthStatesAsync/)
  assert.match(service, /comm_purge_expired_email_oauth_states/)
  assert.match(worker, /Math\.Clamp\(_options\.OAuthStatePurgeIntervalHours, 1, 24\)/)
})
