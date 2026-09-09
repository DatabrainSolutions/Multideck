import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

const applicationApi = readFileSync(new URL("../src/lib/application-data-api.ts", import.meta.url), "utf8")
const customsApi = readFileSync(new URL("../src/lib/customs-drafts-api.ts", import.meta.url), "utf8")
const warehouseApi = readFileSync(new URL("../src/lib/warehouse.ts", import.meta.url), "utf8")
const warehouseOperations = readFileSync(new URL("../src/components/multideck/warehouse-operations-components.tsx", import.meta.url), "utf8")
const customerApi = readFileSync(new URL("../src/lib/customer-api.ts", import.meta.url), "utf8")
const contactCardStore = readFileSync(new URL("../src/lib/contact-card-store.ts", import.meta.url), "utf8")
const driveApi = readFileSync(new URL("../src/lib/drive-api.ts", import.meta.url), "utf8")
const leadApi = readFileSync(new URL("../src/lib/lead-api.ts", import.meta.url), "utf8")
const dealApi = readFileSync(new URL("../src/lib/deal-api.ts", import.meta.url), "utf8")
const dexterApi = readFileSync(new URL("../src/lib/dexter-api.ts", import.meta.url), "utf8")
const teamApi = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8")
const warehouseOrdersEdge = readFileSync(new URL("../../supabase/functions/warehouse/routes/orders.ts", import.meta.url), "utf8")
const warehousePortalEdge = readFileSync(new URL("../../supabase/functions/warehouse/routes/portal-users.ts", import.meta.url), "utf8")

function clientSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return clientSourceFiles(path)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

function uncappedBrowserSelects(source) {
  const findings = []
  let at = 0
  while ((at = source.indexOf(".from(", at)) >= 0) {
    const semicolon = source.indexOf(";", at)
    const nextFrom = source.indexOf(".from(", at + 6)
    const end = nextFrom >= 0 && (semicolon < 0 || nextFrom < semicolon) ? nextFrom : semicolon
    if (end < 0) break
    const query = source.slice(at, Math.min(end + 1, at + 1_800))
    if (query.includes(".select(") && !/\.(?:limit|range|single|maybeSingle)\(/.test(query)) {
      findings.push(query.replace(/\s+/g, " ").slice(0, 180))
    }
    at += 6
  }
  return findings
}

test("retired full-register helpers cannot be called back into active product paths", () => {
  for (const helper of [
    "listLiveReports",
    "listLiveReportTemplates",
    "loadLiveCrm",
    "listLiveDexterContext",
  ]) {
    assert.doesNotMatch(applicationApi, new RegExp(`export async function ${helper}\\b`))
  }

  assert.doesNotMatch(customsApi, /export async function listCustomsDeclarationDrafts\b/)
  assert.doesNotMatch(customsApi, /listStandaloneDeclarationDrafts|listJobRelatedDeclarationDrafts/)
  assert.match(customsApi, /export async function listCustomsDeclarationDraftsPage/)
})

test("warehouse code cannot call retired whole-register readers", () => {
  for (const helper of [
    "listWarehouseFacilities",
    "listWarehouseItems",
    "listWarehouseLocations",
    "listWarehouseInventory",
    "listWarehouseInventoryMovements",
    "listWarehouseHandlingUnits",
    "listWarehouseInventoryExceptions",
    "listOperationalWarehouseOrders",
    "listWarehousePurchaseOrders",
  ]) {
    assert.doesNotMatch(warehouseApi, new RegExp(`export function ${helper}\\b`))
  }
  assert.doesNotMatch(warehouseOperations, /export function WarehouseInventoryView\b/)
  assert.doesNotMatch(warehouseApi, /facility-wide transfer|whole-register compatibility/)
  assert.doesNotMatch(warehouseOrdersEdge, /orderContext|loadOrders|\.limit\(500\)/)
  assert.doesNotMatch(warehousePortalEdge, /Org_Master|WMS_Items|WMS_Locations/)
  const orderSelectors = warehouseApi.slice(
    warehouseApi.indexOf("export function getWarehouseOrderReference"),
    warehouseApi.indexOf("export function createOperationalWarehouseOrder"),
  )
  assert.doesNotMatch(orderSelectors, /normalizeWarehouseSelectorPage|if \("facilities" in result\)/)
  const purchaseOrderSelectors = warehouseApi.slice(
    warehouseApi.indexOf("export function getWarehousePurchaseOrderReference"),
    warehouseApi.indexOf("export function getNextWarehousePurchaseOrderNumber"),
  )
  assert.doesNotMatch(purchaseOrderSelectors, /normalizeWarehouseSelectorPage|if \("facilities" in result\)/)
})

test("CRM cannot reactivate whole-account or whole-contact compatibility reads", () => {
  assert.doesNotMatch(customerApi, /export async function listCustomers\b/)
  assert.doesNotMatch(customerApi, /export async function listContacts\b/)
  assert.doesNotMatch(customerApi, /legacyAccountRegisterPage|legacyContactRegisterPage/)
  assert.doesNotMatch(customerApi, /customerRequest<ApiCustomer\[]>\(""|customerRequest<ApiContact\[]>\("\/contacts"/)
})

test("CRM feature registers cannot fall back to whole-workspace browser reads", () => {
  assert.doesNotMatch(leadApi, /leadRegisterFallback\(await|multideck_crm_list_leads_essential|multideck_crm_list_transfer_users/)
  assert.doesNotMatch(dealApi, /dealRegisterFallback\(await|multideck_crm_list_deals_essential/)
  assert.doesNotMatch(contactCardStore, /legacyWorkspacePage\(await callRpc/)
  assert.doesNotMatch(driveApi, /return pageFromRows|from\(foldersTable\)\.select\(folderColumns\)[\s\S]*fallback/)
  assert.doesNotMatch(dexterApi, /legacyRows\.slice\(offset, offset \+ limit\)/)
})

test("Settings Users cannot fall back to a complete team or auth-directory response", () => {
  assert.doesNotMatch(teamApi, /export async function getApiTeamUsers\b/)
  assert.doesNotMatch(teamApi, /const legacy = await getApiTeamUsers|getApiAuthorizationState\(accessToken\)/)
  assert.match(teamApi, /Workspace user paging is still being prepared/)
})

test("Dexter and Documents clients require paged server responses", () => {
  assert.doesNotMatch(dexterApi, /compatibilityMode: true|legacyRows\.slice|const usage = await getDexterUsage\(\)/)
  const documentApi = readFileSync(new URL("../src/lib/document-builder-api.ts", import.meta.url), "utf8")
  assert.doesNotMatch(documentApi, /legacyGeneratedDocumentPage\(data, options\)|return legacyGeneratedDocumentPage\(workspace, options\)/)
})

test("every direct browser Supabase table read has an explicit row bound", () => {
  const sourceRoot = fileURLToPath(new URL("../src", import.meta.url))
  const findings = clientSourceFiles(sourceRoot).flatMap((file) => (
    uncappedBrowserSelects(readFileSync(file, "utf8")).map((query) => `${file}: ${query}`)
  ))
  assert.deepEqual(findings, [])
})
