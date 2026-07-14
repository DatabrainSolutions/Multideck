import { Boxes, CheckCircle2, Clock3, Gauge, PackageCheck, type LucideIcon } from "lucide-react"
import {
  warehouseGoodsInKanbanColumns,
  warehouseGoodsOutKanbanColumns,
  type StatusTone,
  type WarehouseCalendarEvent,
} from "@/data/multideck-data"
import type {
  WarehouseCalendarCustomer,
  WarehouseKanbanCardData,
  WarehouseKanbanColumnSource,
  WarehouseMetric,
  WarehouseMovement,
  WarehouseOrder,
  WarehouseProduct,
  WarehouseStockRow,
} from "@/components/multideck/warehouse-components"
import { apiFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

type WarehouseMetricResponse = Omit<WarehouseMetric, "tone" | "icon"> & {
  tone: StatusTone
  icon: string
}

export type WarehouseHeaderAction = {
  label: string
  value: string
  icon: LucideIcon
  tone: StatusTone
}

type WarehouseHeaderActionResponse = Omit<WarehouseHeaderAction, "tone" | "icon"> & {
  tone: StatusTone
  icon: string
}

type WarehouseOverviewResponse = {
  metrics: WarehouseMetricResponse[]
  headerActions: WarehouseHeaderActionResponse[]
}

type WarehouseWorkItemsResponse = {
  goodsIn: readonly WarehouseKanbanColumnSource[]
  goodsOut: readonly WarehouseKanbanColumnSource[]
}

type WarehouseCalendarResponse = {
  customers: WarehouseCalendarCustomer[]
  events: WarehouseCalendarEvent[]
}

export type WarehouseLiveData = {
  overview: {
    metrics: WarehouseMetric[]
    headerActions: WarehouseHeaderAction[]
  }
  products: WarehouseProduct[]
  stock: WarehouseStockRow[]
  orders: WarehouseOrder[]
  movements: WarehouseMovement[]
  workItems: WarehouseWorkItemsResponse
  calendar: WarehouseCalendarResponse
}

const iconByName: Record<string, LucideIcon> = {
  Boxes,
  CheckCircle2,
  Clock3,
  Gauge,
  PackageCheck,
}

function iconFor(name: string) {
  return iconByName[name] ?? PackageCheck
}

async function readApiJson<T>(path: string, accessToken: string): Promise<T> {
  const response = await apiFetch(path, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`.trim()

    try {
      const body = await response.json()
      throw new Error(body.detail || body.title || body.message || fallback)
    } catch (error) {
      if (error instanceof Error && error.message !== fallback) throw error
      throw new Error(fallback)
    }
  }

  return response.json() as Promise<T>
}

async function writeApi(path: string, accessToken: string, init: RequestInit) {
  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${accessToken}`)
  headers.set("Content-Type", "application/json")

  const response = await apiFetch(path, {
    ...init,
    headers,
  })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`.trim())
  }
}

export async function getWarehouseLiveData(): Promise<WarehouseLiveData> {
  const session = await getSupabaseSession()

  if (!session?.access_token) {
    throw new Error("No Supabase session is available for warehouse data.")
  }

  const accessToken = session.access_token
  const [overview, products, stock, orders, movements, workItems, calendar] = await Promise.all([
    readApiJson<WarehouseOverviewResponse>("/api/v1/warehouse/overview", accessToken),
    readApiJson<WarehouseProduct[]>("/api/v1/warehouse/products", accessToken),
    readApiJson<WarehouseStockRow[]>("/api/v1/warehouse/stock", accessToken),
    readApiJson<WarehouseOrder[]>("/api/v1/warehouse/orders", accessToken),
    readApiJson<WarehouseMovement[]>("/api/v1/warehouse/movements", accessToken),
    readApiJson<WarehouseWorkItemsResponse>("/api/v1/warehouse/work-items", accessToken),
    readApiJson<WarehouseCalendarResponse>("/api/v1/warehouse/calendar", accessToken),
  ])

  return {
    overview: {
      metrics: overview.metrics.map((metric) => ({ ...metric, icon: iconFor(metric.icon) })),
      headerActions: overview.headerActions.map((action) => ({ ...action, icon: iconFor(action.icon) })),
    },
    products,
    stock,
    orders,
    movements,
    workItems: {
      goodsIn: workItems.goodsIn.length ? workItems.goodsIn : warehouseGoodsInKanbanColumns,
      goodsOut: workItems.goodsOut.length ? workItems.goodsOut : warehouseGoodsOutKanbanColumns,
    },
    calendar,
  }
}

export async function persistWarehouseWorkItemOrder(board: "goods-in" | "goods-out", columns: readonly WarehouseKanbanColumnSource[]) {
  const session = await getSupabaseSession()
  if (!session?.access_token) return

  await writeApi("/api/v1/warehouse/work-items/reorder", session.access_token, {
    method: "PATCH",
    body: JSON.stringify({
      board,
      columns: columns.map((column) => ({
        id: column.id,
        title: column.title,
        meta: column.meta,
        cards: column.cards.map((card: WarehouseKanbanCardData) => ({ id: card.id })),
      })),
    }),
  })
}

// ---------------------------------------------------------------------------
// Facilities and Items management
//
// These talk to the real Warehouse module controllers
// (/api/v1/warehouse/facilities and /api/v1/warehouse/items). Unlike the
// dashboard data above, there is no mock fallback: the screens show live,
// company-scoped records and support create, update, and delete.
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

  const headers = new Headers({ Authorization: `Bearer ${session.access_token}` })
  if (body !== undefined) headers.set("Content-Type", "application/json")

  const response = await apiFetch(path, {
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
    `/api/v1/warehouse/facilities${toQuery({ search: options.search, includeInactive: options.includeInactive })}`,
    "GET",
  )
}

export function getWarehouseFacilityReference() {
  return requestWarehouse<WarehouseFacilityReference>("/api/v1/warehouse/facilities/reference", "GET")
}

export function createWarehouseFacility(input: WarehouseFacilityInput) {
  return requestWarehouse<WarehouseFacility>("/api/v1/warehouse/facilities", "POST", input)
}

export function updateWarehouseFacility(id: string, input: WarehouseFacilityInput) {
  return requestWarehouse<WarehouseFacility>(`/api/v1/warehouse/facilities/${id}`, "PUT", input)
}

export function deleteWarehouseFacility(id: string) {
  return requestWarehouse<void>(`/api/v1/warehouse/facilities/${id}`, "DELETE")
}

export function listWarehouseItems(options: { facilityId?: string; search?: string; includeInactive?: boolean } = {}) {
  return requestWarehouse<WarehouseItem[]>(
    `/api/v1/warehouse/items${toQuery({ facilityId: options.facilityId, search: options.search, includeInactive: options.includeInactive })}`,
    "GET",
  )
}

export function getWarehouseItemReference() {
  return requestWarehouse<WarehouseItemReference>("/api/v1/warehouse/items/reference", "GET")
}

export function createWarehouseItem(input: CreateWarehouseItemInput) {
  return requestWarehouse<WarehouseItem>("/api/v1/warehouse/items", "POST", input)
}

export function updateWarehouseItem(id: string, input: UpdateWarehouseItemInput) {
  return requestWarehouse<WarehouseItem>(`/api/v1/warehouse/items/${id}`, "PUT", input)
}

export function deleteWarehouseItem(id: string) {
  return requestWarehouse<void>(`/api/v1/warehouse/items/${id}`, "DELETE")
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

  const response = await apiFetch("/api/v1/warehouse/items/import/template", {
    headers: { Authorization: `Bearer ${session.access_token}` },
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

  const response = await apiFetch("/api/v1/warehouse/items/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}` },
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

  return response.json() as Promise<ImportItemsResult>
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
    `/api/v1/warehouse/facilities/${facilityId}/locations${toQuery({ search: options.search, includeInactive: options.includeInactive })}`,
    "GET",
  )
}

export function getWarehouseLocationReference(facilityId: string) {
  return requestWarehouse<WarehouseLocationReference>(`/api/v1/warehouse/facilities/${facilityId}/locations/reference`, "GET")
}

export function createWarehouseLocation(facilityId: string, input: WarehouseLocationInput) {
  return requestWarehouse<WarehouseLocation>(`/api/v1/warehouse/facilities/${facilityId}/locations`, "POST", input)
}

export function updateWarehouseLocation(facilityId: string, locationId: string, input: WarehouseLocationInput) {
  return requestWarehouse<WarehouseLocation>(`/api/v1/warehouse/facilities/${facilityId}/locations/${locationId}`, "PUT", input)
}

export function deleteWarehouseLocation(facilityId: string, locationId: string) {
  return requestWarehouse<void>(`/api/v1/warehouse/facilities/${facilityId}/locations/${locationId}`, "DELETE")
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
  receivingLocationId: string | null
  notes: string | null
  lines: {
    orderLineId: string
    quantity: number
    damagedQuantity: number
    targetLocationId: string | null
    lotNumber: string | null
    batchNumber: string | null
    manufactureDate: string | null
    expiryDate: string | null
  }[]
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
    `/api/v1/warehouse/inventory${toQuery({ facilityId: options.facilityId, itemId: options.itemId, search: options.search, includeZero: options.includeZero })}`,
    "GET",
  )
}

export function listWarehouseInventoryMovements(options: { facilityId?: string; itemId?: string; take?: number } = {}) {
  return requestWarehouse<WarehouseInventoryMovement[]>(
    `/api/v1/warehouse/inventory/movements${toQuery({ facilityId: options.facilityId, itemId: options.itemId, take: options.take === undefined ? undefined : String(options.take) })}`,
    "GET",
  )
}

export function listOperationalWarehouseOrders(options: { facilityId?: string; typeCode?: string; statusCode?: string; search?: string } = {}) {
  return requestWarehouse<WarehouseOperationalOrder[]>(
    `/api/v1/warehouse/orders${toQuery({ facilityId: options.facilityId, typeCode: options.typeCode, statusCode: options.statusCode, search: options.search })}`,
    "GET",
  )
}

export function getWarehouseOrderReference() {
  return requestWarehouse<WarehouseOrderReference>("/api/v1/warehouse/orders/reference", "GET")
}

export function createOperationalWarehouseOrder(input: CreateWarehouseOrderInput) {
  return requestWarehouse<WarehouseOperationalOrder>("/api/v1/warehouse/orders", "POST", input)
}

export function receiveOperationalWarehouseOrder(orderId: string, input: ReceiveWarehouseOrderInput) {
  return requestWarehouse<WarehouseOperationalOrder>(`/api/v1/warehouse/orders/${orderId}/receive`, "POST", input)
}

export function dispatchOperationalWarehouseOrder(orderId: string, input: DispatchWarehouseOrderInput) {
  return requestWarehouse<WarehouseOperationalOrder>(`/api/v1/warehouse/orders/${orderId}/dispatch`, "POST", input)
}

export function cancelOperationalWarehouseOrder(orderId: string) {
  return requestWarehouse<WarehouseOperationalOrder>(`/api/v1/warehouse/orders/${orderId}/cancel`, "POST")
}
