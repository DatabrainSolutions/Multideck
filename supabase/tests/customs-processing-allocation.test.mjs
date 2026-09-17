import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
const require = createRequire(new URL("../../multideck.client/package.json", import.meta.url))
const { buildSync } = require("esbuild")
const built = buildSync({ entryPoints: [new URL("../functions/_shared/customs-processing-allocation.mts", import.meta.url).pathname], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text
const module = { exports: {} }; new Function("module", "exports", built)(module, module.exports)
const { allocateProcessingInputs: allocate } = module.exports
const lot = () => ({ id: "cloth", entryReference: "synthetic-entry", entryItemReference: "1", quantity: "300", unit: "MTR", originalCustomsValueGbp: "1000", previouslyDischargedQuantity: "60", evidence: "Synthetic retained entry and prior discharge" })
const use = (outputItemId, quantity) => ({ inputLotId: "cloth", outputItemId, quantity, unit: "MTR", yieldEvidence: "Synthetic reviewed consumption record" })
test("original values allocate exactly across outputs without becoming processed-product prices", () => {
  const lots = [lot()], consumption = [use("output-a", "100"), use("output-b", "140")]
  const before = structuredClone({ lots, consumption }), result = allocate(lots, consumption)
  assert.deepEqual(result.allocations[0].remaining, { numerator: "0", denominator: "1" })
  assert.deepEqual(result.allocations[0].allocations[0].originalCustomsValueGbp, { numerator: "1000", denominator: "3" })
  assert.deepEqual({ lots, consumption }, before)
  lots[0].quantity = "999"
  assert.equal(result.input.lots[0].quantity, "300")
  assert.equal(result.autoPopulationAllowed, false)
})
test("rejects overconsumption, duplicate links, missing evidence and incompatible units", () => {
  assert.throws(() => allocate([lot()], [use("a", "150"), use("b", "100")]), /overused/)
  assert.throws(() => allocate([lot()], [use("a", "1"), use("a", "1")]), /duplicate/)
  assert.throws(() => allocate([lot(), { ...lot(), id: "other-lot", entryReference: " SYNTHETIC-ENTRY ", entryItemReference: "01" }], [use("a", "1")]), /one retained balance/)
  for (const patch of [{ unit: "KGM" }, { inputLotId: "missing" }, { quantity: "0" }, { quantity: "-1" }, { yieldEvidence: "" }]) assert.throws(() => allocate([lot()], [{ ...use("a", "1"), ...patch }]))
  for (const patch of [{ quantity: "0" }, { previouslyDischargedQuantity: "301" }, { originalCustomsValueGbp: "-1" }, { evidence: "" }]) assert.throws(() => allocate([{ ...lot(), ...patch }], [use("a", "1")]))
})
