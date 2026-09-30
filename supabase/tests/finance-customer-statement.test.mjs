import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import ts from "../../multideck.client/node_modules/typescript/lib/typescript.js"

const source = await readFile(new URL("../functions/finance-operations/index.ts", import.meta.url), "utf8")
const ast = ts.createSourceFile("finance-operations.ts", source, ts.ScriptTarget.Latest, true)
const names = new Set(["uuid", "clean", "money", "fail", "entity", "rows", "names", "statementCustomers", "statement"])
const selected = ast.statements.filter((node) => (ts.isFunctionDeclaration(node) || ts.isVariableStatement(node)) && (ts.isFunctionDeclaration(node) ? names.has(node.name?.text) : node.declarationList.declarations.some((item) => names.has(item.name.getText(ast))))).map((node) => node.getText(ast)).join("\n")
const script = ts.transpileModule(selected, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const id = (value) => `00000000-0000-0000-0000-${String(value).padStart(12, "0")}`
const current = { User_ID: id(1), Company_ID: id(10) }
const entityId = id(20)
const customerId = id(30)
const settledId = id(31)

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

function runtime(allowed = true) {
  return vm.runInNewContext(`${script}\n({ statement, statementCustomers })`, {
    HttpError,
    requirePermission: async (_admin, user, permission) => {
      assert.equal(user, current.User_ID)
      assert.equal(permission, "Finance.Receivables.View")
      if (!allowed) throw new HttpError(403, "Permission denied")
    },
  })
}

const document = (recordId, party, gross, outstanding, currency = "GBP") => ({
  FINDoc_ID: id(recordId), FINDoc_Number: `SI-${recordId}`, FINDoc_TypeCode: gross < 0 ? "credit_note" : "sl_invoice",
  FINDoc_StatusCode: "approved", FINDoc_LegalEntityID: entityId, FINDoc_PartyOrgID: party,
  FINDoc_DocumentDate: "2026-09-01", FINDoc_DueDate: "2026-09-30", FINDoc_CurrencyCodeSnapshot: currency,
  FINDoc_GrossAmount: gross, FINDoc_OutstandingAmount: outstanding, FINDoc_UpdatedAt: "2026-09-01",
})
const cash = (recordId, party, amount, unallocated, currency = "GBP") => ({
  FINCash_ID: id(recordId), FINCash_Number: `RCPT-${recordId}`, FINCash_TypeCode: "customer_receipt",
  FINCash_StatusCode: "approved", FINCash_LegalEntityID: entityId, FINCash_PartyOrgID: party,
  FINCash_TransactionDate: "2026-09-02", FINCash_CurrencyCodeSnapshot: currency,
  FINCash_Amount: amount, FINCash_UnallocatedAmount: unallocated, FINCash_UpdatedAt: "2026-09-02",
})

function database() {
  const tables = {
    cmp_LegalEntities: [{ LegalEntity_ID: entityId, Company_ID: current.Company_ID, LegalEntity_IsActive: true, LegalEntity_Name: "Test entity" }],
    CRM_AccountProfiles: [customerId, settledId, id(32)].map((party) => ({ CRMAccount_OrgID: party, CRMAccount_CompanyID: current.Company_ID, CRMAccount_IsDeleted: false })),
    Org_Types: [{ OrgType_ID: id(60), OrgType_Name: "Customer" }],
    Org_Master_Type: [customerId, settledId].map((party) => ({ Org_ID: party, OrgType_ID: id(60) })),
    Org_Master: [{ Org_id: customerId, Org_Name: "Open customer" }, { Org_id: settledId, Org_Name: "Settled customer" }, { Org_id: id(32), Org_Name: "Supplier only" }],
    FIN_Documents: [document(40, customerId, 100, 60), document(41, customerId, -20, -20), document(42, customerId, 100, 0), document(43, settledId, 50, 0), document(44, customerId, 10, 6, "EUR"), { ...document(45, customerId, 999, 999), FINDoc_LegalEntityID: id(21) }],
    FIN_CashTransactions: [cash(50, customerId, 40, 0), cash(51, customerId, 100, 0), cash(52, customerId, 5, 5), cash(53, settledId, 50, 0), cash(54, customerId, 4, 0, "EUR"), { ...cash(55, customerId, 999, 999), FINCash_LegalEntityID: id(21) }],
  }
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(table)
      const filters = []
      const orders = []
      let bounds = [0, Infinity]
      let columns = "*"
      const result = () => {
        const matching = (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row))).sort((a, b) => {
          for (const field of orders) { const difference = String(a[field]).localeCompare(String(b[field])); if (difference) return difference }
          return 0
        }).slice(bounds[0], bounds[1] + 1)
        return matching.map((row) => columns === "*" ? row : Object.fromEntries(columns.split(",").map((field) => [field, row[field]])))
      }
      const query = {
        select(value) { columns = value; return query },
        eq(field, value) { filters.push((row) => row[field] === value); return query },
        ilike(field, value) { filters.push((row) => String(row[field]).toLowerCase() === value.toLowerCase()); return query },
        in(field, values) { filters.push((row) => values.includes(row[field])); return query },
        neq(field, value) { filters.push((row) => row[field] !== value); return query },
        gt(field, value) { filters.push((row) => row[field] > value); return query },
        order(field) { orders.push(field); return query },
        range(start, end) { bounds = [start, end]; return query },
        maybeSingle() { return Promise.resolve({ data: result()[0] ?? null, error: null }) },
        then(resolve) { return Promise.resolve({ data: result(), error: null }).then(resolve) },
      }
      return query
    },
  }
}

test("Open shows current invoice, unused credit and receipt balances by currency", async () => {
  const preview = await runtime().statement(database(), current, entityId, customerId, "open")
  assert.equal(preview.mode, "open")
  assert.equal(preview.lines.length, 4)
  assert.equal(preview.totals.GBP, 35)
  assert.equal(preview.totals.EUR, 6)
  assert.equal(preview.lines.find((line) => line.type === "customer_receipt").originalAmount, -5)
})

test("All includes settled invoices and allocated receipts and reconciles to Open", async () => {
  const admin = database()
  const api = runtime()
  const open = await api.statement(admin, current, entityId, customerId, "open")
  const all = await api.statement(admin, current, entityId, customerId, "all")
  assert.equal(all.lines.length, 8)
  assert.equal(all.lines.filter((line) => line.type === "customer_receipt").length, 4)
  assert.deepEqual({ ...all.totals }, { ...open.totals })
  assert.deepEqual({ ...all.transactionTotals }, { ...all.totals })
  assert.ok(all.lines.some((line) => line.originalAmount === 100 && line.outstanding === 0))
  assert.ok(all.lines.every((line) => line.originalAmount !== 999))
})

test("a fully settled customer remains selectable and has an empty Open preview", async () => {
  const api = runtime()
  const customers = await api.statementCustomers(database(), current, entityId)
  assert.ok(customers.customers.some((customer) => customer.id === settledId))
  assert.ok(!customers.customers.some((customer) => customer.id === id(32)))
  const open = await api.statement(database(), current, entityId, settledId, "open")
  const all = await api.statement(database(), current, entityId, settledId, "all")
  assert.equal(open.lines.length, 0)
  assert.equal(all.lines.length, 2)
  assert.equal(all.totals.GBP, 0)
})

test("missing mode, denied permission and foreign company or customer fail closed", async () => {
  const api = runtime()
  await assert.rejects(api.statement(database(), current, entityId, customerId, ""), (error) => error.status === 400)
  const denied = database()
  await assert.rejects(runtime(false).statement(denied, current, entityId, customerId, "open"), (error) => error.status === 403)
  assert.deepEqual(denied.calls, [])
  await assert.rejects(api.statement(database(), { ...current, Company_ID: id(11) }, entityId, customerId, "open"), (error) => error.status === 404)
  await assert.rejects(api.statement(database(), current, entityId, id(32), "open"), (error) => error.status === 404)
})
