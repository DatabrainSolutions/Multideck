import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import { stripTypeScriptTypes } from "node:module"
import ts from "../../multideck.client/node_modules/typescript/lib/typescript.js"

const pagingSource = await readFile(new URL("../functions/_shared/register-pagination.ts", import.meta.url), "utf8")
const { registerPagination } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(pagingSource)).toString("base64")}`)

const source = await readFile(new URL("../functions/finance-subledger/index.ts", import.meta.url), "utf8")
const ast = ts.createSourceFile("finance.ts", source, ts.ScriptTarget.Latest, true)
const names = ["documentWorkspace", "cashWorkspace", "entityIds", "viewPermission", "draftPermission", "clean"]
const functions = ast.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)).map((node) => node.getText(ast)).join("\n")
const script = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const current = { User_ID: "user-a", Company_ID: "company-a" }

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function runtime(permissions = ["Finance.Receivables.View", "Finance.Payables.View"]) {
  return vm.runInNewContext(`${script}\n({ documentWorkspace, cashWorkspace })`, {
    HttpError,
    requirePermission: async (_admin, userId, permission) => {
      assert.equal(userId, current.User_ID)
      if (!permissions.includes(permission)) throw new HttpError(403, "Permission denied")
    },
  })
}

function database() {
  const documents = Array.from({ length: 257 }, (_, i) => ({ FINDoc_ID: `doc-${String(i).padStart(3, "0")}`, FINDoc_LegalEntityID: "entity-a", FINDoc_TypeCode: "sl_invoice", FINDoc_StatusCode: "draft", FINDoc_UpdatedAt: "2026-09-03", FINDoc_MetadataJSON: { private: "not returned" } }))
  const cash = Array.from({ length: 257 }, (_, i) => ({ FINCash_ID: `cash-${String(i).padStart(3, "0")}`, FINCash_LegalEntityID: "entity-a", FINCash_TypeCode: "customer_receipt", FINCash_UpdatedAt: "2026-09-03" }))
  const tables = {
    cmp_LegalEntities: [{ LegalEntity_ID: "entity-a", Company_ID: "company-a" }, { LegalEntity_ID: "entity-b", Company_ID: "company-b" }],
    FIN_Documents: [...documents, { ...documents[0], FINDoc_ID: "foreign-doc", FINDoc_LegalEntityID: "entity-b" }],
    FIN_CashTransactions: [...cash, { ...cash[0], FINCash_ID: "foreign-cash", FINCash_LegalEntityID: "entity-b" }],
  }
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(table)
      const filters = []
      const orders = []
      let bounds = [0, Infinity]
      const query = {
        select() { return query },
        in(field, values) { filters.push((row) => values.includes(row[field])); return query },
        eq(field, value) { filters.push((row) => row[field] === value); return query },
        order(field, options) { orders.push([field, options.ascending]); return query },
        range(from, to) { bounds = [from, to]; return query },
        then(resolve) {
          const filtered = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row))).sort((a, b) => {
            for (const [field, ascending] of orders) { const result = String(a[field]).localeCompare(String(b[field])); if (result) return ascending ? result : -result }
            return 0
          })
          return Promise.resolve({ data: filtered.slice(bounds[0], bounds[1] + 1), count: filtered.length, error: null }).then(resolve)
        },
      }
      return query
    },
  }
}

test("request pagination is finite, integral and bounded", () => {
  assert.deepEqual(registerPagination(new URLSearchParams()), { offset: 0, limit: 250 })
  assert.deepEqual(registerPagination(new URLSearchParams("limit=5000&offset=250.8")), { offset: 250, limit: 250 })
  assert.deepEqual(registerPagination(new URLSearchParams("limit=NaN&offset=Infinity")), { offset: 0, limit: 250 })
  assert.deepEqual(registerPagination(new URLSearchParams("limit=-5&offset=-4")), { offset: 0, limit: 1 })
})

for (const kind of ["document", "cash"]) {
  test(`${kind}: reads the final page beyond 250 and excludes another company's records`, async () => {
    const api = runtime()
    const admin = database()
    const getPage = (offset) => kind === "document"
      ? api.documentWorkspace(admin, current, "receivables", false, { offset, limit: 250 })
      : api.cashWorkspace(admin, current, "receivables", { offset, limit: 250 })
    const key = kind === "document" ? "documents" : "cashTransactions"
    const id = kind === "document" ? "FINDoc_ID" : "FINCash_ID"
    const first = await getPage(0)
    const last = await getPage(250)
    assert.equal(first.total, 257)
    assert.equal(first[key].length, 250)
    assert.equal(first.hasMore, true)
    assert.equal(last[key].length, 7)
    assert.equal(last.hasMore, false)
    assert.equal(last.offset, 250)
    const ids = [...first[key], ...last[key]].map((row) => row[id])
    assert.equal(new Set(ids).size, 257)
    assert.ok(ids.every((value) => !value.startsWith("foreign")))
    if (kind === "document") assert.ok(first.documents.every((row) => !("FINDoc_MetadataJSON" in row)))
  })

  test(`${kind}: permission denial happens before any privileged query`, async () => {
    const api = runtime([])
    const admin = database()
    const request = kind === "document" ? api.documentWorkspace(admin, current, "receivables") : api.cashWorkspace(admin, current)
    await assert.rejects(request, (error) => error.status === 403)
    assert.deepEqual(admin.calls, [])
  })
}

test("a company without a legal entity receives an empty register, not another company's page", async () => {
  const api = runtime()
  const admin = database()
  const caller = { ...current, Company_ID: "unknown-company" }
  const documents = await api.documentWorkspace(admin, caller, "receivables")
  const cash = await api.cashWorkspace(admin, caller, "receivables")
  assert.equal(documents.documents.length, 0)
  assert.equal(cash.cashTransactions.length, 0)
  assert.equal(documents.total, 0)
  assert.equal(cash.total, 0)
  assert.equal(documents.hasMore, false)
  assert.equal(cash.hasMore, false)
})

test("paging reuses finance permissions and leaves real-record Dexter watch signals in place", async () => {
  assert.match(source, /registerPagination\(params\)/)
  assert.match(source, /browsing a page is not a business event/)
  const lifecycle = await readFile(new URL("../migrations/20260829143000_finance_ledger_lifecycle.sql", import.meta.url), "utf8")
  assert.match(lifecycle, /multideck_dexter_domain_finance/)
  assert.match(lifecycle, /TR_FIN_Documents_dexter_watch/)
  assert.match(lifecycle, /TR_FIN_CashTransactions_dexter_watch/)
})
