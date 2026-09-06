import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const source = await readFile(new URL("../functions/_shared/model-gateway.ts", import.meta.url), "utf8")
const code = stripTypeScriptTypes(source, { mode: "strip" }).replace(/^export /gm, "")
const { reserveModelEgress } = new Function("Deno", `${code}\nreturn { reserveModelEgress };`)({ env: { get: () => undefined } })

for (const [message, dbCode, expected] of [
  ["ocr_concurrency_limit", "P0001", "ocr_concurrency_limit"],
  ["usage_allowance_reached", "P0001", "usage_allowance_reached"],
  ["operator_unavailable", "42501", "model_allowance_unavailable"],
]) {
  test(`model gateway preserves the safe ${expected} denial`, async () => {
    const events = []
    const admin = {
      rpc: async () => ({ data: null, error: { code: dbCode, message } }),
      from: () => ({ insert: async (event) => { events.push(event); return { error: null } } }),
    }
    await assert.rejects(reserveModelEgress({ admin, companyId: "company-a", userId: "user-a" }, {
      provider: "mistral", model: "test-ocr", purpose: "document_ocr", dataCategories: ["document_content"],
    }), { message: expected })
    assert.equal(events[0].AIDexterSecurityEvent_Kind, expected)
  })
}
