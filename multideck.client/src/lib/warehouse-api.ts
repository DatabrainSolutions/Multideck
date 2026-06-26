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
    readApiJson<WarehouseOverviewResponse>("/api/warehouse/overview", accessToken),
    readApiJson<WarehouseProduct[]>("/api/warehouse/products", accessToken),
    readApiJson<WarehouseStockRow[]>("/api/warehouse/stock", accessToken),
    readApiJson<WarehouseOrder[]>("/api/warehouse/orders", accessToken),
    readApiJson<WarehouseMovement[]>("/api/warehouse/movements", accessToken),
    readApiJson<WarehouseWorkItemsResponse>("/api/warehouse/work-items", accessToken),
    readApiJson<WarehouseCalendarResponse>("/api/warehouse/calendar", accessToken),
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

  await writeApi("/api/warehouse/work-items/reorder", session.access_token, {
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
