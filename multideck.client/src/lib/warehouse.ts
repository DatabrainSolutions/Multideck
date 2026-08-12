import { AlarmClock, ArrowDownToLine, ArrowUpFromLine, Boxes, Clock3, PackageCheck, ShieldAlert, type LucideIcon } from "@/components/icons/hugeicons"
import type { StatusTone } from "@/data/multideck-data"
import type {
  WarehouseCalendarCustomer,
  WarehouseCalendarEvent,
  WarehouseMetric,
  WarehouseMovement,
  WarehouseOrder,
} from "@/components/multideck/warehouse-components"
import { getSupabaseSession, supabaseFunctionsUrl, supabasePublicApiKey } from "@/lib/supabase"
import { invalidateWarehouseResources, readCachedWarehouseResource } from "@/lib/warehouse-read-cache"

export type WarehouseHeaderAction = {
  label: string
  value: string
  icon: LucideIcon
  tone: StatusTone
  /** Where the chip takes the operator. Undefined leaves it a plain readout. */
  route?: string
}

/** The screen that answers each header figure, so a chip is a shortcut rather than a label. */
const warehouseMetricRoutes: Record<string, string | undefined> = {
  "Ready to receive": "/warehouse/goods-in",
  "Ready to dispatch": "/warehouse/goods-out",
  "Stock holds": "/warehouse/inventory",
}

export type WarehouseWorkspaceData = {
  dashboard: {
    metrics: WarehouseMetric[]
    headerActions: WarehouseHeaderAction[]
    orders: WarehouseOrder[]
    movements: WarehouseMovement[]
  }
  calendar: {
    customers: WarehouseCalendarCustomer[]
    events: WarehouseCalendarEvent[]
  }
}

// ---------------------------------------------------------------------------
// Facilities and Items management
//
// These talk directly to the tenant's Warehouse Supabase Edge Function. There
// There is no mock or alternate API fallback: the screens show live, scoped records.
// ---------------------------------------------------------------------------

/** Field-aware API error so forms can surface FluentValidation messages next to inputs. */
export class WarehouseApiError extends Error {
  fieldErrors: Record<string, string[]>

  constructor(message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = "WarehouseApiError"
    this.fieldErrors = fieldErrors
  }
}

export type WarehouseFacility = {
  id: string
  code: string
  name: string
  typeCode: string
  typeName: string | null
  officeId: string | null
  officeName: string | null
  unlocode: string | null
  address1: string | null
  address2: string | null
  townCity: string | null
  countyState: string | null
  postZipCode: string | null
  countryCode: string | null
  timeZone: string
  isBonded: boolean
  defaultCustomsStatusCode: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type WarehouseFacilityReference = {
  types: { code: string; name: string; isBondedCandidate: boolean }[]
  customsStatuses: { code: string; name: string; isDutySuspended: boolean }[]
  offices: { id: string; name: string; address: string | null }[]
}

export type WarehouseFacilityInput = {
  code: string
  name: string
  typeCode: string
  officeId: string | null
  unlocode: string | null
  address1: string | null
  address2: string | null
  townCity: string | null
  countyState: string | null
  postZipCode: string | null
  countryCode: string | null
  timeZone: string | null
  isBonded: boolean
  defaultCustomsStatusCode: string | null
  isActive?: boolean
}

export type WarehouseItem = {
  id: string
  customerOrgId: string
  customerOrgName: string | null
  facilityId: string | null
  facilityName: string | null
  sku: string
  description: string
  commodityDescription: string | null
  hsCode: string | null
  countryOfOriginCode: string | null
  baseUomCode: string
  quantityBasisCode: "count" | "weight" | "volume"
  quantityScale: number
  minimumMovementQuantity: number
  allowsFractionalQuantity: boolean
  uoms: WarehouseItemUom[]
  lengthM: number | null
  widthM: number | null
  heightM: number | null
  netWeightKg: number | null
  grossWeightKg: number | null
  isDangerousGoods: boolean
  isExciseGoods: boolean
  isHighValue: boolean
  isBondedEligible: boolean
  requiresLot: boolean
  requiresSerial: boolean
  requiresExpiry: boolean
  temperatureMinC: number | null
  temperatureMaxC: number | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type WarehouseItemUom = {
  id?: string
  code: string
  quantityInBaseUom: number
  grossWeightKg: number | null
  purchasing: boolean
  stocking: boolean
  selling: boolean
}

export type WarehouseItemReference = {
  customers: { id: string; name: string }[]
  facilities: { id: string; code: string; name: string }[]
}

type WarehouseItemAttributes = {
  sku: string
  description: string
  commodityDescription: string | null
  hsCode: string | null
  countryOfOriginCode: string | null
  baseUomCode: string | null
  quantityBasisCode: "count" | "weight" | "volume"
  quantityScale: number
  minimumMovementQuantity: number
  allowsFractionalQuantity: boolean
  uoms: WarehouseItemUom[]
  lengthM: number | null
  widthM: number | null
  heightM: number | null
  netWeightKg: number | null
  grossWeightKg: number | null
  isDangerousGoods: boolean
  isExciseGoods: boolean
  isHighValue: boolean
  isBondedEligible: boolean
  requiresLot: boolean
  requiresSerial: boolean
  requiresExpiry: boolean
  temperatureMinC: number | null
  temperatureMaxC: number | null
}

export type CreateWarehouseItemInput = WarehouseItemAttributes & {
  customerOrgId: string
  facilityId: string
}

export type UpdateWarehouseItemInput = WarehouseItemAttributes & {
  facilityId: string
  isActive: boolean
}

async function requestWarehouse<T>(path: string, method: string, body?: unknown): Promise<T> {
  const session = await getSupabaseSession()
  if (!session?.access_token) {
    throw new WarehouseApiError("Sign in again to manage the warehouse.")
  }

  const scope = warehouseReadScope(session.user.id)
  const load = async () => {
    const headers = new Headers({
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey,
    })
    if (body !== undefined) headers.set("Content-Type", "application/json")

    const response = await fetch(warehouseEdgeUrl(path), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })

    if (!response.ok) {
      const fallback = `${response.status} ${response.statusText}`.trim()
      try {
        const problem = await response.json()
        const fieldErrors = (problem.errors ?? {}) as Record<string, string[]>
        throw new WarehouseApiError(problem.detail || problem.title || problem.message || fallback, fieldErrors)
      } catch (error) {
        if (error instanceof WarehouseApiError) throw error
        throw new WarehouseApiError(fallback)
      }
    }

    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  if (method === "GET") return readCachedWarehouseResource(scope, path, load)

  const result = await load()
  invalidateWarehouseResources(scope)
  return result
}

function warehouseEdgeUrl(functionPath: string) {
  if (!supabaseFunctionsUrl) throw new WarehouseApiError("Warehouse services are not configured for this workspace.")
  return `${supabaseFunctionsUrl}/warehouse${functionPath || "/"}`
}

function warehouseReadScope(userId: string) {
  return `${supabaseFunctionsUrl}:${userId}`
}

function toQuery(params: Record<string, string | boolean | undefined>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "" || value === false) continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ""
}

export function listWarehouseFacilities(options: { search?: string; includeInactive?: boolean } = {}) {
  return requestWarehouse<WarehouseFacility[]>(
    `/facilities${toQuery({ search: options.search, includeInactive: options.includeInactive })}`,
    "GET",
  )
}

export function getWarehouseFacilityReference() {
  return requestWarehouse<WarehouseFacilityReference>("/facilities/reference", "GET")
}

export function createWarehouseFacility(input: WarehouseFacilityInput) {
  return requestWarehouse<WarehouseFacility>("/facilities", "POST", input)
}

export function updateWarehouseFacility(id: string, input: WarehouseFacilityInput) {
  return requestWarehouse<WarehouseFacility>(`/facilities/${id}`, "PUT", input)
}

export function deleteWarehouseFacility(id: string) {
  return requestWarehouse<void>(`/facilities/${id}`, "DELETE")
}

export function listWarehouseItems(options: { facilityId?: string; search?: string; includeInactive?: boolean } = {}) {
  return requestWarehouse<WarehouseItem[]>(
    `/items${toQuery({ facilityId: options.facilityId, search: options.search, includeInactive: options.includeInactive })}`,
    "GET",
  )
}

export function getWarehouseItemReference() {
  return requestWarehouse<WarehouseItemReference>("/items/reference", "GET")
}

export function createWarehouseItem(input: CreateWarehouseItemInput) {
  return requestWarehouse<WarehouseItem>("/items", "POST", input)
}

export function updateWarehouseItem(id: string, input: UpdateWarehouseItemInput) {
  return requestWarehouse<WarehouseItem>(`/items/${id}`, "PUT", input)
}

export function deleteWarehouseItem(id: string) {
  return requestWarehouse<void>(`/items/${id}`, "DELETE")
}

export type ImportItemsResult = {
  created: number
  failed: number
  results: { row: number; sku: string | null; success: boolean; error: string | null }[]
}

/** Downloads the server-generated .xlsx import template in the browser. */
export async function downloadWarehouseItemsTemplate() {
  const session = await getSupabaseSession()
  if (!session?.access_token) {
    throw new WarehouseApiError("Sign in again to download the template.")
  }

  const response = await fetch(warehouseEdgeUrl("/items/import/template"), {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublicApiKey },
  })

  if (!response.ok) {
    throw new WarehouseApiError(`${response.status} ${response.statusText}`.trim())
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "multideck-items-template.xlsx"
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/** Uploads a filled-in spreadsheet; the API parses, validates, and creates the items. */
export async function importWarehouseItems(input: { customerOrgId: string; facilityId: string; file: File }): Promise<ImportItemsResult> {
  const session = await getSupabaseSession()
  if (!session?.access_token) {
    throw new WarehouseApiError("Sign in again to import items.")
  }

  const form = new FormData()
  form.set("customerOrgId", input.customerOrgId)
  form.set("facilityId", input.facilityId)
  form.set("file", input.file)

  const response = await fetch(warehouseEdgeUrl("/items/import"), {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublicApiKey },
    body: form,
  })

  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`.trim()
    try {
      const problem = await response.json()
      throw new WarehouseApiError(problem.detail || problem.title || problem.message || fallback, (problem.errors ?? {}) as Record<string, string[]>)
    } catch (error) {
      if (error instanceof WarehouseApiError) throw error
      throw new WarehouseApiError(fallback)
    }
  }

  const result = await response.json() as ImportItemsResult
  invalidateWarehouseResources(warehouseReadScope(session.user.id))
  return result
}

export type WarehouseLocation = {
  id: string
  facilityId: string
  code: string
  barcode: string | null
  typeCode: string
  typeName: string | null
  statusCode: string
  statusName: string | null
  zoneId: string | null
  zoneTypeCode: string | null
  zoneName: string | null
  aisle: string | null
  bay: string | null
  level: string | null
  position: string | null
  lengthM: number | null
  widthM: number | null
  heightM: number | null
  maxWeightKg: number | null
  maxVolumeCbm: number | null
  temperatureMinC: number | null
  temperatureMaxC: number | null
  allowsMultiSku: boolean
  allowsBondedStock: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type WarehouseLocationReference = {
  types: { code: string; name: string; isPickable: boolean }[]
  statuses: { code: string; name: string; isUsable: boolean }[]
  zones: { code: string; name: string; allowsStock: boolean }[]
}

export type WarehouseLocationInput = {
  code: string
  typeCode: string
  statusCode: string | null
  zoneTypeCode: string | null
  barcode: string | null
  aisle: string | null
  bay: string | null
  level: string | null
  position: string | null
  lengthM: number | null
  widthM: number | null
  heightM: number | null
  maxWeightKg: number | null
  maxVolumeCbm: number | null
  temperatureMinC: number | null
  temperatureMaxC: number | null
  allowsMultiSku: boolean
  allowsBondedStock: boolean
  isActive?: boolean
}

export function listWarehouseLocations(facilityId: string, options: { search?: string; includeInactive?: boolean } = {}) {
  return requestWarehouse<WarehouseLocation[]>(
    `/facilities/${facilityId}/locations${toQuery({ search: options.search, includeInactive: options.includeInactive })}`,
    "GET",
  )
}

export function getWarehouseLocationReference(facilityId: string) {
  return requestWarehouse<WarehouseLocationReference>(`/facilities/${facilityId}/locations/reference`, "GET")
}

export function createWarehouseLocation(facilityId: string, input: WarehouseLocationInput) {
  return requestWarehouse<WarehouseLocation>(`/facilities/${facilityId}/locations`, "POST", input)
}

export function updateWarehouseLocation(facilityId: string, locationId: string, input: WarehouseLocationInput) {
  return requestWarehouse<WarehouseLocation>(`/facilities/${facilityId}/locations/${locationId}`, "PUT", input)
}

export function deleteWarehouseLocation(facilityId: string, locationId: string) {
  return requestWarehouse<void>(`/facilities/${facilityId}/locations/${locationId}`, "DELETE")
}

// ---------------------------------------------------------------------------
// Operational inventory, inbound receiving, outbound dispatch, and orders
// ---------------------------------------------------------------------------

export type WarehouseInventoryBalance = {
  id: string
  facilityId: string
  facilityCode: string
  facilityName: string
  customerOrgId: string | null
  customerName: string | null
  itemId: string
  sku: string
  itemDescription: string
  locationId: string | null
  locationCode: string | null
  handlingUnitId: string | null
  handlingUnitCode: string | null
  handlingUnitTypeCode: string | null
  lotId: string | null
  lotNumber: string | null
  batchNumber: string | null
  manufactureDate: string | null
  expiryDate: string | null
  inventoryStatusCode: string
  inventoryStatusName: string | null
  customsStatusCode: string
  uomCode: string
  onHandQuantity: number
  reservedQuantity: number
  allocatedQuantity: number
  heldQuantity: number
  availableQuantity: number
  isBonded: boolean
  firstReceiptAt: string | null
  lastMovementAt: string | null
  updatedAt: string
}

export type WarehouseInventoryMovement = {
  id: string
  facilityId: string
  facilityName: string
  itemId: string
  sku: string
  itemDescription: string
  typeCode: string
  typeName: string | null
  quantity: number
  uomCode: string
  fromLocationCode: string | null
  toLocationCode: string | null
  lotNumber: string | null
  batchNumber: string | null
  reference: string | null
  notes: string | null
  handlingUnitId: string | null
  handlingUnitCode: string | null
  movementGroupId: string | null
  reasonCode: string | null
  metadata: Record<string, unknown>
  createdAt: string
}

export type WarehouseOrderLine = {
  id: string
  lineNumber: number
  itemId: string
  sku: string
  description: string
  statusCode: string
  orderedQuantity: number
  receivedQuantity: number
  pickedQuantity: number
  packedQuantity: number
  dispatchedQuantity: number
  remainingQuantity: number
  uomCode: string
  lotNumber: string | null
  expiryDate: string | null
  sourceLocationId: string | null
  sourceLocationCode: string | null
  targetLocationId: string | null
  targetLocationCode: string | null
  inventoryStatusCode: string
  customsStatusCode: string
  goodsValue: number | null
  currencyCode: string | null
  instructions: string | null
}

export type WarehouseOperationalOrder = {
  id: string
  facilityId: string
  facilityCode: string
  facilityName: string
  officeId: string | null
  officeName: string | null
  customerOrgId: string
  customerName: string
  orderNumber: string
  typeCode: "inbound" | "outbound"
  typeName: string | null
  statusCode: string
  statusName: string | null
  priorityCode: string
  customerReference: string | null
  requestedDate: string | null
  appointmentStartAt: string | null
  appointmentEndAt: string | null
  vehicleReg: string | null
  containerNumber: string | null
  sealNumber: string | null
  instructions: string | null
  createdAt: string
  updatedAt: string
  lines: WarehouseOrderLine[]
  receipts: { id: string; receiptNumber: string; statusCode: string; receivedAt: string | null; hasDiscrepancy: boolean; notes: string | null }[]
  dispatches: { id: string; dispatchNumber: string; statusCode: string; dispatchedAt: string | null; vehicleReg: string | null; containerNumber: string | null; sealNumber: string | null }[]
}

type WarehouseDashboardSnapshot = {
  orders: WarehouseOperationalOrder[]
  metrics: {
    onHandSkus: number
    availableSkus: number
    heldBalances: number
  }
  movements: WarehouseInventoryMovement[]
}

export type WarehouseOrderReference = {
  facilities: { id: string; officeId: string | null; code: string; name: string }[]
  customers: { id: string; name: string }[]
  items: { id: string; customerOrgId: string; facilityId: string | null; sku: string; description: string; uomCode: string; requiresLot: boolean; requiresExpiry: boolean }[]
  locations: { id: string; facilityId: string; code: string; zoneName: string | null }[]
  types: { code: string; name: string; directionCode: string | null }[]
  statuses: { code: string; name: string; isOpen: boolean; isFinal: boolean }[]
  customsStatuses: { code: string; name: string; isDutySuspended: boolean }[]
}

export type CreateWarehouseOrderInput = {
  facilityId: string
  customerOrgId: string
  typeCode: "inbound" | "outbound"
  priorityCode: string | null
  customerReference: string | null
  requestedDate: string | null
  appointmentStartAt: string | null
  appointmentEndAt: string | null
  vehicleReg: string | null
  containerNumber: string | null
  sealNumber: string | null
  instructions: string | null
  lines: {
    itemId: string
    quantity: number
    uomCode: string | null
    lotNumber: string | null
    expiryDate: string | null
    sourceLocationId: string | null
    targetLocationId: string | null
    customsStatusCode: string | null
    goodsValue: number | null
    currencyCode: string | null
    instructions: string | null
  }[]
}

export type ReceiveWarehouseOrderInput = {
  requestId: string
  receivingLocationId: string | null
  handlingUnitId: string | null
  newHandlingUnit: { typeCode: string; code: string | null; sscc: string | null; externalReference: string | null } | null
  notes: string | null
  lines: {
    orderLineId: string
    quantity: number
    damagedQuantity: number
    missingQuantity: number
    targetLocationId: string | null
    lotNumber: string | null
    batchNumber: string | null
    manufactureDate: string | null
    expiryDate: string | null
  }[]
}

export type WarehouseHandlingUnitContent = {
  balanceId: string
  itemId: string
  sku: string
  description: string
  quantity: number
  uomCode: string
  statusCode: string
  customsStatusCode: string
  lotNumber: string | null
  batchNumber: string | null
}

export type WarehouseHandlingUnit = {
  id: string
  facilityId: string
  parentHandlingUnitId: string | null
  typeCode: string
  typeName: string
  code: string
  sscc: string | null
  externalReference: string | null
  customerOrgId: string | null
  customerName: string | null
  locationId: string | null
  locationCode: string | null
  inventoryStatusCode: string
  inventoryStatusName: string
  customsStatusCode: string
  lifecycleStatusCode: string
  consumedIntoHandlingUnitId: string | null
  grossWeightKg: number | null
  netWeightKg: number | null
  volumeCbm: number | null
  sealed: boolean
  updatedAt: string
  contents: WarehouseHandlingUnitContent[]
  events: { id: string; typeCode: string; at: string; locationId: string | null; notes: string | null; metadata: Record<string, unknown> }[]
}

export type WarehouseHandlingUnitReference = {
  types: { code: string; name: string; isContainer: boolean }[]
  locations: { id: string; facilityId: string; code: string; statusCode: string; typeCode: string }[]
  statuses: { code: string; name: string; available: boolean }[]
}

export type WarehouseInventoryException = {
  id: string
  facilityId: string
  typeCode: string
  statusCode: string
  severityCode: string
  balanceId: string | null
  title: string
  description: string | null
  expectedLocationId: string | null
  expectedLocationCode: string | null
  actualLocationId: string | null
  actualLocationCode: string | null
  movementGroupId: string | null
  raisedAt: string
  resolvedAt: string | null
  metadata: Record<string, unknown>
}

export type WarehouseInventoryActionResult = {
  requestId: string
  movementGroupId: string
  transactionId?: string
  balanceId?: string
  handlingUnitId?: string
  targetHandlingUnitId?: string
  exceptionId?: string
  adjustmentId?: string
  status?: string
}

export type DispatchWarehouseOrderInput = {
  vehicleReg: string | null
  containerNumber: string | null
  sealNumber: string | null
  notes: string | null
  lines: { orderLineId: string; quantity: number; sourceLocationId: string | null; lotId: string | null }[]
}

export function listWarehouseInventory(options: { facilityId?: string; itemId?: string; search?: string; includeZero?: boolean } = {}) {
  return requestWarehouse<WarehouseInventoryBalance[]>(
    `/inventory${toQuery({ facilityId: options.facilityId, itemId: options.itemId, search: options.search, includeZero: options.includeZero })}`,
    "GET",
  )
}

export function listWarehouseInventoryMovements(options: { facilityId?: string; itemId?: string; search?: string; take?: number } = {}) {
  return requestWarehouse<WarehouseInventoryMovement[]>(
    `/inventory/movements${toQuery({ facilityId: options.facilityId, itemId: options.itemId, search: options.search, take: options.take === undefined ? undefined : String(options.take) })}`,
    "GET",
  )
}

export function listWarehouseHandlingUnits(options: { facilityId?: string; search?: string; includeConsumed?: boolean } = {}) {
  return requestWarehouse<WarehouseHandlingUnit[]>(`/handling-units${toQuery(options)}`, "GET")
}

export function getWarehouseHandlingUnitReference(facilityId?: string) {
  return requestWarehouse<WarehouseHandlingUnitReference>(`/handling-units/reference${toQuery({ facilityId })}`, "GET")
}

export function listWarehouseInventoryExceptions(options: { facilityId?: string; search?: string; openOnly?: boolean; statusCode?: string } = {}) {
  return requestWarehouse<WarehouseInventoryException[]>(`/inventory/exceptions${toQuery(options)}`, "GET")
}

function inventoryAction<T extends Record<string, unknown>>(action: string, input: T) {
  return requestWarehouse<WarehouseInventoryActionResult>(`/inventory/actions/${action}`, "POST", { requestId: crypto.randomUUID(), ...input })
}

export function createWarehouseHandlingUnit(input: { facilityId: string; customerOrgId: string | null; locationId: string | null; typeCode: string; code: string | null; sscc: string | null; externalReference: string | null; customsStatusCode?: string; notes?: string }) {
  return inventoryAction("create_hu", input)
}

export function moveWarehouseBalance(input: { facilityId: string; balanceId: string; quantity: number; targetLocationId: string; targetHandlingUnitId: string | null; actualSourceLocationId: string | null; reasonCode: string; overrideReason: string | null; notes: string | null }) {
  return inventoryAction("move_balance", input)
}

export function moveWarehouseHandlingUnit(input: { facilityId: string; handlingUnitId: string; targetLocationId: string; actualSourceLocationId: string | null; reasonCode: string; overrideReason: string | null; notes: string | null }) {
  return inventoryAction("move_hu", input)
}

export function consolidateWarehouseHandlingUnits(input: { facilityId: string; targetHandlingUnitId: string; sourceHandlingUnitIds: string[]; notes: string | null }) {
  return inventoryAction("consolidate", input)
}

export function changeWarehouseStockStatus(input: { facilityId: string; balanceId: string; quantity: number; targetStatusCode: string; reasonCode: string; notes: string | null }) {
  return inventoryAction("change_status", input)
}

export function recordWarehouseSample(input: { facilityId: string; balanceId: string; quantity: number; disposition: "onsite" | "removed"; targetStatusCode?: string; reasonCode: string; recipient: string | null; custodyReference: string | null; notes: string | null }) {
  return inventoryAction("sample", input)
}

export function reportWarehouseLocationEmpty(input: { facilityId: string; locationId: string; notes: string | null }) {
  return inventoryAction("report_empty", input)
}

export function resolveWarehouseLocationException(input: { facilityId: string; exceptionId: string; resolution: "found" | "data_error" | "request_loss" | "approve_loss"; actualLocationId: string | null; notes: string | null }) {
  return inventoryAction("resolve_location_exception", input)
}

export function listOperationalWarehouseOrders(options: { facilityId?: string; typeCode?: string; statusCode?: string; openOnly?: boolean; search?: string } = {}) {
  return requestWarehouse<WarehouseOperationalOrder[]>(
    `/orders${toQuery({ facilityId: options.facilityId, typeCode: options.typeCode, statusCode: options.statusCode, openOnly: options.openOnly, search: options.search })}`,
    "GET",
  )
}

function getWarehouseDashboardSnapshot() {
  return requestWarehouse<WarehouseDashboardSnapshot>("/dashboard", "GET")
}

export function getWarehouseOrderReference() {
  return requestWarehouse<WarehouseOrderReference>("/orders/reference", "GET")
}

export function createOperationalWarehouseOrder(input: CreateWarehouseOrderInput) {
  return requestWarehouse<WarehouseOperationalOrder>("/orders", "POST", input)
}

export function receiveOperationalWarehouseOrder(orderId: string, input: ReceiveWarehouseOrderInput) {
  return requestWarehouse<WarehouseOperationalOrder>(`/orders/${orderId}/receive`, "POST", input)
}

export function dispatchOperationalWarehouseOrder(orderId: string, input: DispatchWarehouseOrderInput) {
  return requestWarehouse<WarehouseOperationalOrder>(`/orders/${orderId}/dispatch`, "POST", input)
}

/**
 * Moves an order's booked slot. Only the appointment window changes — the date the
 * customer originally asked for is left alone, because the warehouse moving a slot
 * must not rewrite the request it was booked against.
 */
export function rescheduleOperationalWarehouseOrder(orderId: string, input: { appointmentStartAt: string; appointmentEndAt: string }) {
  return requestWarehouse<WarehouseOperationalOrder>(`/orders/${orderId}/reschedule`, "POST", input)
}

export function cancelOperationalWarehouseOrder(orderId: string) {
  return requestWarehouse<WarehouseOperationalOrder>(`/orders/${orderId}/cancel`, "POST")
}

export type WarehouseOrderDocument = {
  id: string
  orderId: string
  title: string
  documentTypeCode: string
  statusCode: string
  fileName: string | null
  mimeType: string | null
  fileSizeBytes: number | null
  createdAt: string
}

export function listWarehouseOrderDocuments(orderId: string) {
  return requestWarehouse<WarehouseOrderDocument[]>(`/orders/${orderId}/documents`, "GET")
}

export async function uploadWarehouseOrderDocument(orderId: string, file: File, documentType = "customer_document") {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new WarehouseApiError("Sign in again to upload a document.")

  const form = new FormData()
  form.set("documentTypeCode", documentType)
  form.set("file", file)
  const response = await fetch(warehouseEdgeUrl(`/orders/${orderId}/documents`), {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublicApiKey },
    body: form,
  })
  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`.trim()
    try {
      const problem = await response.json()
      throw new WarehouseApiError(problem.detail || problem.title || problem.message || fallback)
    } catch (error) {
      if (error instanceof WarehouseApiError) throw error
      throw new WarehouseApiError(fallback)
    }
  }
  const result = await response.json() as WarehouseOrderDocument
  invalidateWarehouseResources(warehouseReadScope(session.user.id))
  return result
}

export async function downloadWarehouseOrderDocument(orderId: string, orderDocument: WarehouseOrderDocument) {
  const access = await requestWarehouse<{ url: string; expiresAt: string }>(`/orders/${orderId}/documents/${orderDocument.id}/url`, "GET")
  const link = document.createElement("a")
  link.href = access.url
  link.download = orderDocument.fileName || orderDocument.title
  link.rel = "noopener"
  window.document.body.appendChild(link)
  link.click()
  link.remove()
}

export function reviewWarehouseOrderDocument(orderId: string, documentId: string, statusCode: "accepted" | "rejected", notes: string | null = null) {
  return requestWarehouse<WarehouseOrderDocument>(`/orders/${orderId}/documents/${documentId}/review`, "POST", { statusCode, notes })
}

export type WarehousePortalReference = {
  roles: { code: string; name: string; description: string }[]
  facilities: { id: string; code: string; name: string }[]
}

export type WarehousePortalUser = {
  id: string
  displayName: string
  email: string
  status: string
  roleCode: string
  facilityIds: string[]
  lastLoginAt: string | null
}

export function getWarehousePortalReference() {
  return requestWarehouse<WarehousePortalReference>("/portal/reference", "GET")
}

export function listWarehousePortalUsers(customerOrgId: string) {
  return requestWarehouse<WarehousePortalUser[]>(`/portal/customers/${customerOrgId}/users`, "GET")
}

export function inviteWarehousePortalUser(input: { customerOrgId: string; email: string; displayName: string | null; roleCode: string; facilityIds: string[] }) {
  return requestWarehouse<{ user: WarehousePortalUser; invited: boolean }>("/portal/invitations", "POST", input)
}

export function updateWarehousePortalUser(customerOrgId: string, portalUserId: string, input: { roleCode: string; facilityIds: string[] }) {
  return requestWarehouse<WarehousePortalUser>(`/portal/customers/${customerOrgId}/users/${portalUserId}`, "PUT", input)
}

export function sendWarehousePortalAccessLink(customerOrgId: string, portalUserId: string) {
  return requestWarehouse<{ delivered: true }>(`/portal/customers/${customerOrgId}/users/${portalUserId}/access-link`, "POST")
}

export function revokeWarehousePortalUser(customerOrgId: string, portalUserId: string) {
  return requestWarehouse<void>(`/portal/customers/${customerOrgId}/users/${portalUserId}`, "DELETE")
}

const finalOrderStatuses = new Set(["complete", "cancelled"])
const calendarCustomerColors = [
  "var(--md-accent)",
  "var(--md-blue)",
  "var(--md-amber)",
  "var(--md-red)",
  "color-mix(in srgb, var(--md-amber) 54%, var(--md-blue))",
  "color-mix(in srgb, var(--md-blue) 65%, var(--md-accent))",
]

function warehouseOrderTone(order: WarehouseOperationalOrder): StatusTone {
  const status = order.statusCode.toLowerCase()
  if (status === "cancelled" || status.includes("hold") || status.includes("blocked")) return "red"
  if (status === "complete") return "green"
  if (status.includes("part")) return "amber"
  if (order.priorityCode.toLowerCase() === "urgent") return "red"
  return order.typeCode === "inbound" ? "teal" : "blue"
}

function titleCaseCode(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function parseWarehouseDate(value: string) {
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  return new Date(value)
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function timeKey(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

function formatOrderValue(order: WarehouseOperationalOrder, locale: string) {
  const valuedLines = order.lines.filter((line) => line.goodsValue !== null && line.currencyCode)
  if (!valuedLines.length) return "—"

  const currencies = new Set(valuedLines.map((line) => line.currencyCode!))
  if (currencies.size !== 1) return "—"

  const currency = valuedLines[0].currencyCode!
  const value = valuedLines.reduce((total, line) => total + (line.goodsValue ?? 0), 0)
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value)
  } catch {
    return `${currency} ${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)}`
  }
}

function formatOrderWindow(order: WarehouseOperationalOrder, locale: string) {
  if (!order.appointmentStartAt) return "Not scheduled"
  const start = parseWarehouseDate(order.appointmentStartAt)
  const end = order.appointmentEndAt ? parseWarehouseDate(order.appointmentEndAt) : null
  const formatter = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" })
  return end ? `${formatter.format(start)}–${formatter.format(end)}` : formatter.format(start)
}

function dashboardOrder(order: WarehouseOperationalOrder, locale: string): WarehouseOrder {
  const scheduledDate = order.appointmentStartAt ?? order.requestedDate
  return {
    id: order.orderNumber,
    customer: order.customerName,
    route: order.facilityName,
    type: order.typeName ?? titleCaseCode(order.typeCode),
    lines: order.lines.length,
    value: formatOrderValue(order, locale),
    due: scheduledDate
      ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(parseWarehouseDate(scheduledDate))
      : "Not scheduled",
    window: formatOrderWindow(order, locale),
    status: order.statusName ?? titleCaseCode(order.statusCode),
    tone: warehouseOrderTone(order),
  }
}

function dashboardMovement(movement: WarehouseInventoryMovement, locale: string): WarehouseMovement {
  const isInbound = movement.typeCode.toLowerCase() === "receipt"
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 })
  const createdAt = parseWarehouseDate(movement.createdAt)

  return {
    id: movement.reference ?? movement.id.slice(0, 8).toUpperCase(),
    direction: isInbound ? "In" : "Out",
    product: `${movement.sku} · ${movement.itemDescription}`,
    reference: movement.reference ?? movement.typeName ?? titleCaseCode(movement.typeCode),
    quantity: `${number.format(movement.quantity)} ${movement.uomCode}`,
    dock: (isInbound ? movement.toLocationCode : movement.fromLocationCode) ?? "—",
    time: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(createdAt),
    status: movement.typeName ?? titleCaseCode(movement.typeCode),
    tone: isInbound ? "teal" : "blue",
  }
}

function calendarData(orders: WarehouseOperationalOrder[]): WarehouseWorkspaceData["calendar"] {
  const scheduledOrders = orders.filter((order) => order.statusCode !== "cancelled" && (order.appointmentStartAt || order.requestedDate))
  const customerIds = [...new Set(scheduledOrders.map((order) => order.customerOrgId))]
  const customers = customerIds.map<WarehouseCalendarCustomer>((customerId, index) => {
    const name = scheduledOrders.find((order) => order.customerOrgId === customerId)?.customerName ?? "Warehouse customer"
    return {
      id: customerId,
      name,
      shortName: name.split(/\s+/).slice(0, 2).join(" "),
      color: calendarCustomerColors[index % calendarCustomerColors.length],
    }
  })

  const events = scheduledOrders.map<WarehouseCalendarEvent>((order) => {
    const start = order.appointmentStartAt
      ? parseWarehouseDate(order.appointmentStartAt)
      : parseWarehouseDate(`${order.requestedDate}T09:00:00`)
    const suppliedEnd = order.appointmentEndAt ? parseWarehouseDate(order.appointmentEndAt) : null
    const end = suppliedEnd && suppliedEnd > start ? suppliedEnd : new Date(start.getTime() + 60 * 60 * 1000)

    return {
      id: order.id,
      date: dateKey(start),
      time: timeKey(start),
      endTime: timeKey(end),
      title: order.customerReference ?? order.orderNumber,
      type: order.typeName ?? titleCaseCode(order.typeCode),
      direction: order.typeCode,
      customerId: order.customerOrgId,
      tone: warehouseOrderTone(order),
      reference: order.orderNumber,
      location: order.facilityName,
    }
  })

  return { customers, events }
}

/** The day an order is expected, whether it was booked into a slot or only dated. */
function orderExpectedDate(order: WarehouseOperationalOrder) {
  const value = order.appointmentStartAt ?? order.requestedDate
  return value ? parseWarehouseDate(value) : null
}

export async function getWarehouseWorkspaceData(locale = "en-GB"): Promise<WarehouseWorkspaceData> {
  const { orders, metrics: snapshotMetrics, movements } = await getWarehouseDashboardSnapshot()

  const openOrders = orders.filter((order) => !finalOrderStatuses.has(order.statusCode))
  const inboundOrders = openOrders.filter((order) => order.typeCode === "inbound")
  const outboundOrders = openOrders.filter((order) => order.typeCode === "outbound")
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })

  const today = new Date()
  const todayKey = dateKey(today)
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const bookedToday = openOrders.filter((order) => {
    const expected = orderExpectedDate(order)
    return expected ? dateKey(expected) === todayKey : false
  })
  // An order whose expected day has already passed and is still open. This is the
  // one figure on the band an operator is meant to act on before anything else.
  const pastDue = openOrders.filter((order) => {
    const expected = orderExpectedDate(order)
    return expected ? expected < startOfToday : false
  })

  // Seven distinct figures, deliberately: the earlier row repeated the inbound and
  // outbound order counts under two names each, which spent two tiles restating a
  // number the operator had already read.
  const metrics: WarehouseMetric[] = [
    { label: "Ready to receive", value: number.format(inboundOrders.length), detail: "Inbound orders with lines still to book in.", tone: inboundOrders.length ? "amber" : "neutral", icon: ArrowDownToLine },
    { label: "Ready to dispatch", value: number.format(outboundOrders.length), detail: "Outbound orders with lines still to pick and load.", tone: outboundOrders.length ? "blue" : "neutral", icon: ArrowUpFromLine },
    { label: "Stock holds", value: number.format(snapshotMetrics.heldBalances), detail: "Stock lines held in quarantine, damage or investigation.", tone: snapshotMetrics.heldBalances ? "red" : "teal", icon: ShieldAlert },
    { label: "Past due", value: number.format(pastDue.length), detail: "Open orders whose expected day has already passed.", tone: pastDue.length ? "red" : "green", icon: AlarmClock },
    { label: "Booked today", value: number.format(bookedToday.length), detail: "Orders expected on the dock today.", tone: "teal", icon: Clock3 },
    { label: "SKUs on hand", value: number.format(snapshotMetrics.onHandSkus), detail: "Distinct items with physical stock in the warehouse.", tone: "neutral", icon: Boxes },
    { label: "Available SKUs", value: number.format(snapshotMetrics.availableSkus), detail: "Distinct items free to allocate to an order.", tone: "green", icon: PackageCheck },
  ]

  return {
    dashboard: {
      metrics,
      // The first three of the band, repeated as chips for the screens that have
      // no room for the full row. One source, so a chip and a tile can never
      // disagree about the same figure.
      headerActions: metrics.slice(0, 3).map((metric) => ({
        label: metric.label,
        value: metric.value,
        icon: metric.icon,
        tone: metric.tone,
        route: warehouseMetricRoutes[metric.label],
      })),
      orders: openOrders
        .sort((first, second) => (first.appointmentStartAt ?? first.requestedDate ?? "9999").localeCompare(second.appointmentStartAt ?? second.requestedDate ?? "9999"))
        .map((order) => dashboardOrder(order, locale)),
      movements: movements.map((movement) => dashboardMovement(movement, locale)),
    },
    calendar: calendarData(orders),
  }
}

export type WarehousePurchaseOrderLine = {
  id?: string
  lineNumber?: number
  itemId: string | null
  sku: string
  supplierItemCode: string | null
  description: string
  quantity: number
  receivedQuantity?: number
  uomCode: string
  unitPrice: number
  taxRate: number
  netAmount?: number
  taxAmount?: number
  totalAmount?: number
  requestedDeliveryDate: string | null
  metadata?: Record<string, unknown>
}

export type WarehousePurchaseOrderInput = {
  facilityId: string
  customerOrgId: string
  supplierOrgId: string | null
  number: string
  supplierName: string
  buyerReference: string | null
  supplierReference: string | null
  issueDate: string | null
  expectedDeliveryDate: string | null
  currencyCode: string
  deliveryTerms: string | null
  paymentTerms: string | null
  deliveryAddress: string | null
  notes: string | null
  sourceFileName?: string | null
  extractionMode?: string | null
  extractionModel?: string | null
  extractionMetadata?: Record<string, unknown>
  lines: WarehousePurchaseOrderLine[]
}

export type WarehousePurchaseOrder = WarehousePurchaseOrderInput & {
  id: string
  facilityCode: string
  facilityName: string
  customerName: string
  warehouseOrderId: string | null
  statusCode: "draft" | "issued" | "part_received" | "received" | "cancelled"
  netAmount: number
  taxAmount: number
  totalAmount: number
  version: number
  createdAt: string
  updatedAt: string
  events: Array<{
    id: string
    typeCode: string
    at: string
    fromStatusCode: string | null
    toStatusCode: string | null
    notes: string | null
    metadata: Record<string, unknown>
  }>
}

export type WarehousePurchaseOrderReference = {
  facilities: { id: string; code: string; name: string }[]
  organisations: { id: string; name: string }[]
  items: {
    id: string
    customerOrgId: string
    facilityId: string
    sku: string
    description: string
    uomCode: string
    quantityBasisCode: "count" | "weight" | "volume"
    allowsFractionalQuantity: boolean
  }[]
  currencies: string[]
}

export function getWarehousePurchaseOrderReference() {
  return requestWarehouse<WarehousePurchaseOrderReference>("/purchase-orders/reference", "GET")
}

export function getNextWarehousePurchaseOrderNumber(facilityId: string) {
  return requestWarehouse<{ number: string }>(`/purchase-orders/next-number${toQuery({ facilityId })}`, "GET")
}

export function listWarehousePurchaseOrders(options: { facilityId?: string; statusCode?: string; search?: string } = {}) {
  return requestWarehouse<WarehousePurchaseOrder[]>(`/purchase-orders${toQuery(options)}`, "GET")
}

export function getWarehousePurchaseOrder(id: string) {
  return requestWarehouse<WarehousePurchaseOrder>(`/purchase-orders/${id}`, "GET")
}

export function createWarehousePurchaseOrder(input: WarehousePurchaseOrderInput) {
  return requestWarehouse<WarehousePurchaseOrder>("/purchase-orders", "POST", input)
}

export function updateWarehousePurchaseOrder(id: string, input: WarehousePurchaseOrderInput) {
  return requestWarehouse<WarehousePurchaseOrder>(`/purchase-orders/${id}`, "PUT", input)
}

export function issueWarehousePurchaseOrder(id: string, notes?: string) {
  return requestWarehouse<WarehousePurchaseOrder>(`/purchase-orders/${id}/issue`, "POST", { notes: notes ?? null })
}

export function cancelWarehousePurchaseOrder(id: string, notes?: string) {
  return requestWarehouse<WarehousePurchaseOrder>(`/purchase-orders/${id}/cancel`, "POST", { notes: notes ?? null })
}

export function createInboundOrderFromPurchaseOrder(id: string) {
  return requestWarehouse<WarehousePurchaseOrder>(`/purchase-orders/${id}/create-inbound`, "POST", {})
}
