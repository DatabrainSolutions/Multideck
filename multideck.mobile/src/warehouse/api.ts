import type { SupabaseClient } from "@supabase/supabase-js"
import type { WorkspaceConfiguration } from "@/auth/workspace"

export class WarehouseMobileError extends Error {
  constructor(message: string) {
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
  customerName: string | null
  sku: string
  itemDescription: string
  locationId: string | null
  locationCode: string | null
  handlingUnitId: string | null
  handlingUnitCode: string | null
  lotNumber: string | null
  batchNumber: string | null
  inventoryStatusCode: string
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

export type WarehouseHandlingUnitReference = {
  locations: { id: string; facilityId: string; code: string; statusCode: string; typeCode: string }[]
}

export type WarehouseInventoryException = {
  id: string
  facilityId: string
  typeCode: string
  statusCode: string
  severityCode: string
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

function query(values: Record<string, string | boolean | undefined>) {
  const result = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== false) result.set(key, String(value))
  })
  const encoded = result.toString()
  return encoded ? `?${encoded}` : ""
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
      throw new WarehouseMobileError(message)
    }

    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  return {
    listFacilities: () => request<WarehouseFacility[]>("/facilities"),
    listLocations: (facilityId: string, search = "") => request<WarehouseLocation[]>(`/facilities/${facilityId}/locations${query({ search })}`),
    listInventory: (options: { facilityId?: string; search?: string } = {}) => request<WarehouseInventoryBalance[]>(`/inventory${query(options)}`),
    listItems: (options: { facilityId?: string; search?: string } = {}) => request<WarehouseItem[]>(`/items${query(options)}`),
    listHandlingUnits: (options: { facilityId?: string; search?: string } = {}) => request<WarehouseHandlingUnit[]>(`/handling-units${query(options)}`),
    getHandlingUnitReference: (facilityId?: string) => request<WarehouseHandlingUnitReference>(`/handling-units/reference${query({ facilityId })}`),
    listExceptions: (options: { facilityId?: string; search?: string } = {}) => request<WarehouseInventoryException[]>(`/inventory/exceptions${query({ ...options, openOnly: true })}`),
    reportLocationEmpty: (input: { facilityId: string; locationId: string; notes: string }) => request<WarehouseInventoryActionResult>("/inventory/actions/report_empty", "POST", { requestId: requestId(), ...input }),
    resolveLocationDataError: (input: { facilityId: string; exceptionId: string; notes: string }) => request<WarehouseInventoryActionResult>("/inventory/actions/resolve_location_exception", "POST", { requestId: requestId(), resolution: "data_error", actualLocationId: null, ...input }),
    moveHandlingUnit: (input: { facilityId: string; handlingUnitId: string; targetLocationId: string; actualSourceLocationId: string | null; overrideReason: string | null; notes: string | null }) => request<WarehouseInventoryActionResult>("/inventory/actions/move_hu", "POST", { requestId: requestId(), reasonCode: "mobile_relocation", ...input }),
    consolidateHandlingUnits: (input: { facilityId: string; targetHandlingUnitId: string; sourceHandlingUnitIds: string[]; notes: string | null }) => request<WarehouseInventoryActionResult>("/inventory/actions/consolidate", "POST", { requestId: requestId(), ...input }),
  }
}

export type WarehouseMobileApi = ReturnType<typeof createWarehouseMobileApi>
