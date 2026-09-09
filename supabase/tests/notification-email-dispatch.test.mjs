import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import vm from "node:vm"
import ts from "../../multideck.client/node_modules/typescript/lib/typescript.js"

const source = readFileSync(new URL("../functions/send-notification-email/index.ts", import.meta.url), "utf8").replace(/^import .*\n/gm, "")
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
function harness({ metadata = { event_type: "product_updates" }, preferenceError = false, user = false, receiptError = false } = {}) {
  let handler, rendered, sends = []
  const notification = { CommNotif_ID: "notification-1", CommNotif_UserID: "recipient", CommNotif_Title: "Record changed", CommNotif_Body: "A real record changed.", CommNotif_MetadataJSON: metadata, CommNotif_TargetTable: null, CommNotif_TargetID: null }
  const client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: "auth-user" } : null }, error: null }) },
    rpc: async () => ({ data: "webhook-secret", error: null }),
    from(table) {
      let update
      const result = () => table === "Comm_Notifications"
        ? update ? { data: null, error: receiptError ? Error("db down") : null } : { data: notification, error: null }
        : table === "cmp_Users" ? { data: { User_ID: "recipient", User_Email: "operator@example.invalid", Company_ID: "company" }, error: null }
        : { data: { CommNotifPref_IsEnabled: true }, error: preferenceError ? Error("db down") : null }
      const query = {
        select() { return query }, eq() {
          if (update && !receiptError) notification.CommNotif_MetadataJSON = update.CommNotif_MetadataJSON
          return query
        }, update(value) { update = value; return query },
        single: async () => result(), maybeSingle: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject) },
      }
      return query
    },
  }
  vm.runInNewContext(code, {
    Deno: { env: { get: name => ({ SUPABASE_URL: "https://tenant.supabase.co", SUPABASE_ANON_KEY: "public-key", SUPABASE_SERVICE_ROLE_KEY: "service-key", RESEND_API_KEY: "test-key", APP_URL: "https://tenant.multideck.app" })[name] }, serve: value => { handler = value } },
    createClient: () => client, normaliseLocale: () => "en-GB",
    renderBrandedEmail: value => { rendered = value; return { html: "html", text: "text" } },
    readConfiguredTenantBrand: async () => ({}), MULTIDECK_EMAIL_FROM: "test@example.invalid", MULTIDECK_EMAIL_REPLY_TO: "reply@example.invalid",
    fetch: async (_url, options) => { sends.push(options); return new Response(JSON.stringify({ id: "provider-1" }), { status: 200 }) },
    Request, Response, URL, AbortSignal, console: { error() {} },
  })
  return { sends, rendered: () => rendered, dispatch: async () => handler(new Request("https://tenant.supabase.co/functions/v1/send-notification-email", { method: "POST", headers: { Authorization: `Bearer ${user ? "user-token" : "service-key"}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "dispatch", notificationId: "notification-1" }) })) }
}

test("dispatch uses a stable idempotency key and skips already accepted emails", async () => {
  const h = harness()
  assert.equal((await h.dispatch()).status, 200)
  assert.equal(h.sends[0].headers["Idempotency-Key"], "notification/notification-1")
  assert.equal((await h.dispatch()).status, 200)
  assert.equal(h.sends.length, 1)
})
test("preference lookup failures prevent sending", async () => {
  const h = harness({ preferenceError: true })
  assert.equal((await h.dispatch()).status, 500)
  assert.equal(h.sends.length, 0)
})
test("users cannot replay automatic notification email dispatch", async () => {
  const h = harness({ user: true })
  assert.equal((await h.dispatch()).status, 403)
  assert.equal(h.sends.length, 0)
})
test("Inbox email links resolve records and never cross tenant origins", async () => {
  const h = harness({ metadata: { suggestion_id: "suggestion-1", action_url: "https://other.multideck.app/private" } })
  assert.equal((await h.dispatch()).status, 200)
  assert.equal(h.rendered().buttonUrl, "https://tenant.multideck.app/inbox?view=suggested&suggestion=suggestion-1")
})
test("an unrecorded provider acceptance is returned as a retryable failure", async () => {
  const h = harness({ receiptError: true })
  assert.equal((await h.dispatch()).status, 500)
  assert.equal(h.sends.length, 1)
})
