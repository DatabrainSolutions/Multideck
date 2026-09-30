import type { SupabaseClient } from "@supabase/supabase-js"
import type { WorkspaceConfiguration } from "@/auth/workspace"

export class WarehouseMobileError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = "WarehouseMobileError"
  }
}

export type WarehouseFacility = {
  id: string
  code: string
  name: string
  isActive: boolean
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
  zoneName: string | null
  aisle: string | null
  bay: string | null
  level: string | null
  position: string | null
  allowsMultiSku: boolean
  allowsBondedStock: boolean
  isActive: boolean
}

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
  lotNumber: string | null
  batchNumber: string | null
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
}

export type WarehouseItem = {
  id: string
  customerOrgName: string | null
  facilityId: string | null
  facilityName: string | null
  sku: string
  description: string
  baseUomCode: string
  isDangerousGoods: boolean
  isBondedEligible: boolean
  requiresLot: boolean
  requiresSerial: boolean
  requiresExpiry: boolean
  isActive: boolean
}

export type WarehouseHandlingUnit = {
  id: string
  facilityId: string
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
  lifecycleStatusCode: string
  sealed: boolean
  contents: {
    balanceId: string
    sku: string
    description: string
    quantity: number
    uomCode: string
    statusCode: string
    lotNumber: string | null
  }[]
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
  raisedAt: string
  resolvedAt: string | null
}

export type WarehouseInventoryActionResult = {
  requestId: string
  movementGroupId: string
  exceptionId?: string
  status?: string
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
  instructions: string | null
}

export type WarehouseOrder = {
  id: string
  facilityId: string
  facilityCode: string
  facilityName: string
  customerOrgId: string
  customerName: string
  orderNumber: string
  typeCode: "inbound" | "outbound"
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
}

export type WarehouseTask = {
  id: string
  type: "putaway" | "pick"
  statusCode: string
  facilityId: string
  facilityName: string
  orderId: string | null
  orderNumber: string | null
  orderLineId: string | null
  itemId: string | null
  sku: string | null
  description: string | null
  customerOrgId: string | null
  customerName: string | null
  quantity: number
  completedQuantity: number
  uomCode: string
  sourceLocationId: string | null
  sourceLocationCode: string | null
  targetLocationId: string | null
  targetLocationCode: string | null
  lotId: string | null
  lotNumber: string | null
  createdAt: string
}

export type WarehousePage<T> = {
  rows: T[]
  total: number
  limit: number
  offset: number
}

function query(values: Record<string, string | number | boolean | undefined>) {
  const result = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== false) result.set(key, String(value))
  })
  const encoded = result.toString()
  return encoded ? `?${encoded}` : ""
}

const listLimit = 50

export function sameScan(first: string | null | undefined, second: string) {
  return Boolean(first && second.trim() && first.trim().toLowerCase() === second.trim().toLowerCase())
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createWarehouseMobileApi(client: SupabaseClient, workspace: WorkspaceConfiguration) {
  const baseUrl = `${workspace.supabase.url.replace(/\/$/, "")}/functions/v1/warehouse`

  async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
    const { data, error: sessionError } = await client.auth.getSession()
    if (sessionError || !data.session?.access_token) throw new WarehouseMobileError("Sign in again to use warehouse operations.")

    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${data.session.access_token}`,
          apikey: workspace.supabase.publishableKey,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new WarehouseMobileError("The warehouse service could not be reached. Check the connection and try again.")
    }

    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`.trim()
      try {
        const problem = await response.json() as { detail?: string; title?: string; message?: string }
        message = problem.detail || problem.title || problem.message || message
      } catch {
        // Keep the HTTP fallback when the function did not return a problem document.
      }
      throw new WarehouseMobileError(message, response.status)
    }

    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  async function page<T>(path: string): Promise<T[]> {
    const result = await request<unknown>(path)
    if (!result || typeof result !== "object" || !Array.isArray((result as { rows?: unknown }).rows)) {
      throw new WarehouseMobileError("Warehouse data is still being prepared. Try again shortly.")
    }
    return (result as WarehousePage<T>).rows
  }

  const listLocations = (facilityId: string, search = "") => page<WarehouseLocation>(`/facilities/${facilityId}/locations${query({ search: search.trim(), limit: listLimit })}`)
  const listHandlingUnits = (options: { facilityId: string; search?: string }) => page<WarehouseHandlingUnit>(`/handling-units${query({ facilityId: options.facilityId, search: options.search?.trim(), limit: listLimit })}`)

  return {
    listFacilities: () => page<WarehouseFacility>(`/facilities${query({ limit: listLimit })}`),
    listLocations,
    /** Resolves a scanned location code or barcode to exactly one location in the warehouse. */
    findLocation: async (facilityId: string, scan: string) => {
      if (!scan.trim()) return null
      return (await listLocations(facilityId, scan)).find((location) => sameScan(location.code, scan) || sameScan(location.barcode, scan)) ?? null
    },
    listInventory: (options: { facilityId: string; search?: string; itemId?: string }) => page<WarehouseInventoryBalance>(`/inventory${query({ facilityId: options.facilityId, itemId: options.itemId, search: options.search?.trim(), limit: listLimit })}`),
    listItems: (options: { facilityId: string; search?: string }) => page<WarehouseItem>(`/items${query({ facilityId: options.facilityId, search: options.search?.trim(), limit: listLimit })}`),
    listHandlingUnits,
    /** Resolves a scanned pallet code or SSCC to exactly one open pallet in the warehouse. */
    findHandlingUnit: async (facilityId: string, scan: string) => {
      if (!scan.trim()) return null
      return (await listHandlingUnits({ facilityId, search: scan })).find((unit) => sameScan(unit.code, scan) || sameScan(unit.sscc, scan)) ?? null
    },
    listExceptions: (options: { facilityId: string; search?: string }) => page<WarehouseInventoryException>(`/inventory/exceptions${query({ facilityId: options.facilityId, search: options.search?.trim(), openOnly: true, limit: listLimit })}`),
    reportLocationEmpty: (input: { facilityId: string; locationId: string; notes: string }) => request<WarehouseInventoryActionResult>("/inventory/actions/report_empty", "POST", { requestId: requestId(), ...input }),
    resolveLocationDataError: (input: { facilityId: string; exceptionId: string; notes: string }) => request<WarehouseInventoryActionResult>("/inventory/actions/resolve_location_exception", "POST", { requestId: requestId(), resolution: "data_error", actualLocationId: null, ...input }),
    moveHandlingUnit: (input: { facilityId: string; handlingUnitId: string; targetLocationId: string; actualSourceLocationId: string | null; overrideReason: string | null; notes: string | null }) => request<WarehouseInventoryActionResult>("/inventory/actions/move_hu", "POST", { requestId: requestId(), reasonCode: "mobile_relocation", ...input }),
    consolidateHandlingUnits: (input: { facilityId: string; targetHandlingUnitId: string; sourceHandlingUnitIds: string[]; notes: string | null }) => request<WarehouseInventoryActionResult>("/inventory/actions/consolidate", "POST", { requestId: requestId(), ...input }),
    listOrders: (options: { facilityId: string; typeCode: "inbound" | "outbound"; openOnly?: boolean; search?: string; limit?: number; offset?: number }) => request<WarehousePage<WarehouseOrder>>(`/orders${query(options)}`),
    getOrder: (orderId: string) => request<WarehouseOrder>(`/orders/${orderId}`),
    /** Exact order-number lookup; returns null when the scan is not an order in this workspace. */
    findOrderByNumber: async (orderNumber: string) => {
      if (!orderNumber.trim()) return null
      try {
        return await request<WarehouseOrder>(`/orders/detail${query({ number: orderNumber.trim() })}`)
      } catch (error) {
        if (error instanceof WarehouseMobileError && error.status === 404) return null
        throw error
      }
    },
    receiveOrder: (orderId: string, input: {
      receivingLocationId: string
      notes: string | null
      lines: {
        orderLineId: string
        quantity: number
        damagedQuantity: number
        missingQuantity: number
        targetLocationId: string
        lotNumber: string | null
        batchNumber: string | null
        manufactureDate: string | null
        expiryDate: string | null
      }[]
    }) => request<WarehouseOrder>(`/orders/${orderId}/receive`, "POST", {
      requestId: requestId(),
      handlingUnitId: null,
      newHandlingUnit: null,
      ...input,
    }),
    countOpenTasks: async (facilityId: string, type: "putaway" | "pick") => (await request<WarehousePage<WarehouseTask>>(`/tasks${query({ facilityId, type, status: "open", limit: 1, offset: 0 })}`)).total,
    listTasks: (options: { facilityId: string; type: "putaway" | "pick"; status?: "open"; limit?: number; offset?: number }) => request<WarehousePage<WarehouseTask>>(`/tasks${query(options)}`),
    getTask: (taskId: string) => request<WarehouseTask>(`/tasks/${taskId}`),
    confirmTask: (taskId: string, input: {
      quantity: number
      targetLocationId?: string
      scannedSourceLocationCode?: string
      scannedTargetLocationCode?: string
      scannedItemCode?: string
      notes?: string | null
    }) => request<WarehouseTask>(`/tasks/${taskId}/confirm`, "POST", { requestId: requestId(), ...input }),
    dispatchOrder: (orderId: string, input: {
      vehicleReg: string | null
      containerNumber: string | null
      sealNumber: string | null
      notes: string | null
      lines: { orderLineId: string; quantity: number }[]
    }) => request<WarehouseOrder>(`/orders/${orderId}/dispatch`, "POST", { requestId: requestId(), ...input }),
  }
}

export type WarehouseMobileApi = ReturnType<typeof createWarehouseMobileApi>
