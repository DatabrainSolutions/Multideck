import assert from "node:assert/strict"
import test from "node:test"
import { createStandaloneImportDraft, createStandaloneExportDraft, validateStandaloneExportDraft } from "../src/lib/customs-declaration.ts"
import { applyTenantDeclarantDefault } from "../src/lib/customs-declarant.ts"

test("new imports default to the tenant, with its identifier separate from its name", () => {
  const result = applyTenantDeclarantDefault(createStandaloneImportDraft(), { name: "Tenant company", eori: "GB123456789000" })
  assert.equal(result.declarant, "Tenant company")
  assert.equal(result.declarantName, "Tenant company")
  assert.equal(result.declarantEori, "GB123456789000")
  assert.equal(result.declarantAddressLine, "")
  assert.equal(applyTenantDeclarantDefault(JSON.parse(JSON.stringify(result)), { name: "Changed tenant" }).declarantEori, "GB123456789000")
})

test("a user selection or partial manual entry wins over delayed tenant defaults", () => {
  for (const patch of [{ declarant: "Other company" }, { declarantName: "Manual name" }, { declarantAddressLine: "Manual address" }, { declarantEori: "" }]) {
    const draft = { ...createStandaloneImportDraft(), ...patch }
    assert.equal(applyTenantDeclarantDefault(draft, { name: "Tenant company" }), draft)
  }
  const exported = createStandaloneExportDraft()
  assert.equal(applyTenantDeclarantDefault(exported, { name: "Tenant company" }), exported)
})

test("missing configuration does not invent a customs identifier", () => {
  const result = applyTenantDeclarantDefault(createStandaloneImportDraft(), { name: "Tenant company" })
  assert.equal(result.declarantEori, "")
  assert.ok(validateStandaloneExportDraft(result).some(issue => issue.field === "declarantEori"))
})
