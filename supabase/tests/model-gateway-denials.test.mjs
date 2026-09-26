import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const source = await readFile(new URL("../functions/_shared/model-gateway.ts", import.meta.url), "utf8")
const code = stripTypeScriptTypes(source, { mode: "strip" }).replace(/^export /gm, "")
const { reserveModelEgress, settleModelEgress } = new Function("Deno", `${code}\nreturn { reserveModelEgress, settleModelEgress };`)({ env: { get: () => undefined } })

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


test("Responses settlement retains cache usage and tenant scope; legacy settlement stays compatible", async () => {
  const calls = []
  const context = { companyId: "company-a", userId: "user-a", admin: {
    rpc: async (name, args) => { calls.push({ name, args }); return { error: null } },
  } }
  const usage = { input_tokens: 100, output_tokens: 10, input_tokens_details: { cached_tokens: 80, cache_write_tokens: 5 } }
  await settleModelEgress(context, { reservationId: "reservation", outcome: "succeeded", responseUsage: usage })
  assert.equal(calls[0].name, "multideck_dexter_settle_responses_egress")
  assert.deepEqual(calls[0].args.p_usage, usage)
  assert.equal(calls[0].args.p_company_id, "company-a")
  assert.equal(calls[0].args.p_user_id, "user-a")
  await settleModelEgress(context, { reservationId: "legacy", outcome: "succeeded", inputUnits: 2, outputUnits: 0 })
  assert.equal(calls[1].name, "multideck_dexter_settle_model_egress")
  assert.equal(calls[1].args.p_input_units, 2)
})
