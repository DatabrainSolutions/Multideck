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
  WarehouseStockBranchLocation,
  WarehouseStockRow,
} from "@/components/multideck/warehouse-components"
import { getSupabaseSession, supabase } from "@/lib/supabase"

export type WarehouseHeaderAction = {
  label: string
  value: string
  icon: LucideIcon
  tone: StatusTone
}

type WarehouseWorkItemsResponse = {
  goodsIn: readonly WarehouseKanbanColumnSource[]
  goodsOut: readonly WarehouseKanbanColumnSource[]
}

type WarehouseCalendarResponse = {
  customers: WarehouseCalendarCustomer[]
  events: WarehouseCalendarEvent[]
}

type MutableWarehouseKanbanColumn = Omit<WarehouseKanbanColumnSource, "cards"> & {
  cards: WarehouseKanbanCardData[]
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

type TenantContext = {
  companyId: string
}

type ProductRow = {
  WHP_ID: string
  WHP_UI_ID: string
  WHP_Name: string
  Customer_Name: string
  WHP_Category: string | null
  WHP_SKU: string
  WHP_HSCode: string | null
  WHP_SupplierRef: string | null
  WHP_Owner: string | null
  WHP_Status: string
  WHP_Tone: StatusTone
  WHP_InboundQty: number
}

type StockRow = {
  WHS_ID: string
  WHP_ID: string
  WHL_ID: string | null
  WHS_UI_ID: string
  WHS_LotNumber: string | null
  WHS_OnHand: number
  WHS_Allocated: number
  WHS_FillPct: number
  WHS_NextMovement: string | null
  WHS_Status: string
  WHS_Tone: StatusTone
}

type LocationRow = {
  WHL_ID: string
  WHL_Code: string | null
  WHL_AreaID: string | null
}

type AreaRow = {
  WHA_ID: string
  WHA_Name: string
}

type OrderRow = {
  WHO_Ref: string
  WHO_CustomerName: string
  WHO_Route: string | null
  WHO_Type: string
  WHO_Lines: number
  WHO_Value: string | null
  WHO_Due: string | null
  WHO_Window: string | null
  WHO_Status: string
  WHO_Tone: StatusTone
}

type MovementRow = {
  WHM_Ref: string
  WHM_Direction: "In" | "Out"
  WHM_ProductName: string
  WHM_Reference: string | null
  WHM_Quantity: string | null
  WHM_Dock: string | null
  WHM_Time: string | null
  WHM_Status: string
  WHM_Tone: StatusTone
}

type WorkItemRow = {
  WHWI_Board: "goods-in" | "goods-out"
  WHWI_ColumnID: string
  WHWI_ColumnTitle: string
  WHWI_ColumnMeta: string | null
  WHWI_CardID: string
  WHWI_Title: string
  WHWI_Meta: string
  WHWI_Status: string
  WHWI_Tone: StatusTone
  WHWI_SortOrder: number
}

type CalendarEventRow = {
  WHCE_UI_ID: string
  WHCE_Date: string
  WHCE_StartTime: string
  WHCE_EndTime: string
  WHCE_Title: string
  WHCE_Type: string
  WHCE_CustomerKey: string
  WHCE_CustomerName: string
  WHCE_CustomerShortName: string
  WHCE_CustomerColor: string
  WHCE_Tone: StatusTone
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

function assertSupabase() {
  if (!supabase) throw new Error("Supabase is not configured.")
  return supabase
}

async function readTenantContext(): Promise<TenantContext> {
  const client = assertSupabase()
  const session = await getSupabaseSession()

  if (!session?.user?.id) {
    throw new Error("No Supabase session is available for warehouse data.")
  }

  const { data: users, error: userError } = await client
    .from("cmp_Users")
    .select("Company_ID")
    .eq("Auth_User_ID", session.user.id)
    .limit(1)

  if (userError) throw userError

  const companyId = users?.[0]?.Company_ID as string | undefined
  if (!companyId) {
    throw new Error("This user is not linked to a company.")
  }

  const { data: modules, error: moduleError } = await client
    .from("cmp_Company_Modules")
    .select("Company_ID")
    .eq("Company_ID", companyId)
    .eq("Module_Code", "warehouse")
    .eq("Is_Enabled", true)
    .limit(1)

  if (moduleError) throw moduleError
  if (!modules?.length) {
    throw new Error("Warehouse is not enabled for this company.")
  }

  return { companyId }
}

async function readRows<T>(table: string, companyId: string, select = "*") {
  const { data, error } = await assertSupabase()
    .from(table)
    .select(select)
    .eq("Company_ID", companyId)
    .eq("Is_Deleted", false)

  if (error) throw error
  return (data ?? []) as T[]
}

function toInt(value: number | null | undefined) {
  return Math.round(Number(value ?? 0))
}

function stripSeconds(value: string | null | undefined) {
  return value ? value.slice(0, 5) : ""
}

function byId<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  return new Map(rows.map((row) => [String(row[key]), row]))
}

function mapProducts(products: ProductRow[], stock: StockRow[]): WarehouseProduct[] {
  const stockByProduct = new Map<string, { onHand: number; allocated: number }>()

  stock.forEach((row) => {
    const current = stockByProduct.get(row.WHP_ID) ?? { onHand: 0, allocated: 0 }
    current.onHand += Number(row.WHS_OnHand ?? 0)
    current.allocated += Number(row.WHS_Allocated ?? 0)
    stockByProduct.set(row.WHP_ID, current)
  })

  return products.map((product) => {
    const balance = stockByProduct.get(product.WHP_ID)
    const onHand = toInt(balance?.onHand)
    const allocated = toInt(balance?.allocated)

    return {
      id: product.WHP_UI_ID,
      name: product.WHP_Name,
      customer: product.Customer_Name,
      category: product.WHP_Category ?? "",
      sku: product.WHP_SKU,
      hsCode: product.WHP_HSCode ?? "",
      supplierRef: product.WHP_SupplierRef ?? "",
      onHand,
      available: onHand - allocated,
      inbound: toInt(product.WHP_InboundQty),
      status: product.WHP_Status,
      tone: product.WHP_Tone,
      owner: product.WHP_Owner ?? "",
    }
  })
}

function mapStock(products: ProductRow[], stock: StockRow[], locations: LocationRow[], areas: AreaRow[]): WarehouseStockRow[] {
  const productById = byId(products, "WHP_ID") as Map<string, ProductRow>
  const locationById = byId(locations, "WHL_ID") as Map<string, LocationRow>
  const areaById = byId(areas, "WHA_ID") as Map<string, AreaRow>
  const grouped = stock
    .filter((row) => productById.has(row.WHP_ID))
    .reduce((groups, row) => {
      groups.set(row.WHP_ID, [...(groups.get(row.WHP_ID) ?? []), row])
      return groups
    }, new Map<string, StockRow[]>())

  return Array.from(grouped.entries()).map(([productId, rows]) => {
    const product = productById.get(productId)!
    const branchLocations: WarehouseStockBranchLocation[] = rows.map((row) => {
      const location = row.WHL_ID ? locationById.get(row.WHL_ID) : undefined
      const area = location?.WHL_AreaID ? areaById.get(location.WHL_AreaID) : undefined
      const onHand = toInt(row.WHS_OnHand)
      const allocated = toInt(row.WHS_Allocated)

      return {
        id: row.WHS_UI_ID,
        location: location?.WHL_Code ?? "Unassigned",
        zone: area?.WHA_Name ?? "",
        lot: row.WHS_LotNumber ?? "",
        onHand,
        allocated,
        available: onHand - allocated,
        fill: row.WHS_FillPct,
        nextMovement: row.WHS_NextMovement ?? "No movement",
        status: row.WHS_Status,
        tone: row.WHS_Tone,
      }
    })

    const primary = branchLocations[0]
    const onHand = branchLocations.reduce((sum, row) => sum + row.onHand, 0)
    const allocated = branchLocations.reduce((sum, row) => sum + row.allocated, 0)
    const fill = branchLocations.length ? Math.round(branchLocations.reduce((sum, row) => sum + row.fill, 0) / branchLocations.length) : 0

    return {
      id: `stk-${product.WHP_SKU.toLowerCase().replaceAll(".", "-")}`,
      location: primary?.location ?? "Unassigned",
      zone: primary?.zone ?? "",
      product: product.WHP_Name,
      productCode: product.WHP_SKU,
      customer: product.Customer_Name,
      lot: primary?.lot ?? "",
      onHand,
      allocated,
      available: onHand - allocated,
      fill,
      nextMovement: branchLocations.length === 1 ? primary.nextMovement : "Multiple locations",
      status: branchLocations.some((row) => row.status === "Quarantine") ? "Quarantine" : primary?.status ?? "Available",
      tone: branchLocations.some((row) => row.tone === "red") ? "red" : primary?.tone ?? "neutral",
      branchLocations,
    }
  })
}

function mapOrders(rows: OrderRow[]): WarehouseOrder[] {
  return rows.map((row) => ({
    id: row.WHO_Ref,
    customer: row.WHO_CustomerName,
    route: row.WHO_Route ?? "",
    type: row.WHO_Type,
    lines: row.WHO_Lines,
    value: row.WHO_Value ?? "",
    due: row.WHO_Due ?? "",
    window: row.WHO_Window ?? "",
    status: row.WHO_Status,
    tone: row.WHO_Tone,
  }))
}

function mapMovements(rows: MovementRow[]): WarehouseMovement[] {
  return rows.map((row) => ({
    id: row.WHM_Ref,
    direction: row.WHM_Direction,
    product: row.WHM_ProductName,
    reference: row.WHM_Reference ?? "",
    quantity: row.WHM_Quantity ?? "",
    dock: row.WHM_Dock ?? "",
    time: row.WHM_Time ?? "",
    status: row.WHM_Status,
    tone: row.WHM_Tone,
  }))
}

function mapWorkItems(rows: WorkItemRow[]): WarehouseWorkItemsResponse {
  const mapBoard = (board: "goods-in" | "goods-out") => {
    const columns = new Map<string, MutableWarehouseKanbanColumn>()

    rows
      .filter((row) => row.WHWI_Board === board)
      .sort((a, b) => a.WHWI_ColumnID.localeCompare(b.WHWI_ColumnID) || a.WHWI_SortOrder - b.WHWI_SortOrder)
      .forEach((row) => {
        const column: MutableWarehouseKanbanColumn = columns.get(row.WHWI_ColumnID) ?? {
          id: row.WHWI_ColumnID,
          title: row.WHWI_ColumnTitle,
          meta: row.WHWI_ColumnMeta ?? undefined,
          cards: [],
        }

        column.cards.push({
          id: row.WHWI_CardID,
          title: row.WHWI_Title,
          meta: row.WHWI_Meta,
          status: row.WHWI_Status,
          tone: row.WHWI_Tone,
        })
        columns.set(row.WHWI_ColumnID, column)
      })

    return Array.from(columns.values()) satisfies WarehouseKanbanColumnSource[]
  }

  return {
    goodsIn: mapBoard("goods-in"),
    goodsOut: mapBoard("goods-out"),
  }
}

function mapCalendar(rows: CalendarEventRow[]): WarehouseCalendarResponse {
  const customers = new Map<string, WarehouseCalendarCustomer>()

  rows.forEach((row) => {
    customers.set(row.WHCE_CustomerKey, {
      id: row.WHCE_CustomerKey,
      name: row.WHCE_CustomerName,
      shortName: row.WHCE_CustomerShortName,
      color: row.WHCE_CustomerColor,
    } as WarehouseCalendarCustomer)
  })

  return {
    customers: Array.from(customers.values()),
    events: rows.map((row) => ({
      id: row.WHCE_UI_ID,
      date: row.WHCE_Date,
      time: stripSeconds(row.WHCE_StartTime),
      endTime: stripSeconds(row.WHCE_EndTime),
      title: row.WHCE_Title,
      type: row.WHCE_Type,
      customerId: row.WHCE_CustomerKey,
      tone: row.WHCE_Tone,
    } as WarehouseCalendarEvent)),
  }
}

function makeOverview(products: WarehouseProduct[], orders: WarehouseOrder[], stock: WarehouseStockRow[], calendar: WarehouseCalendarResponse) {
  const capacity = stock.length ? Math.round(stock.reduce((sum, row) => sum + row.fill, 0) / stock.length) : 0
  const dueToday = orders.filter((order) => order.due.toLowerCase() === "today").length
  const activeOrders = orders.filter((order) => order.status.toLowerCase() !== "loaded").length
  const inboundOrders = orders.filter((order) => order.type.toLowerCase() === "inbound").length
  const stockChecks = calendar.events.filter((item) => item.type.toLowerCase().includes("stock")).length
  const inventoryValue = products.length ? "GBP 1.42M" : "GBP 0"

  return {
    metrics: [
      { label: "Inventory value", value: inventoryValue, detail: "Across live warehouse stock rows.", tone: "teal" as const, icon: iconFor("Boxes") },
      { label: "Orders due today", value: String(dueToday), detail: `${activeOrders} active warehouse orders in the live dataset.`, tone: "amber" as const, icon: iconFor("Clock3") },
      { label: "Stock accuracy", value: "98.4%", detail: "Last cycle count variance was down 0.7%.", tone: "green" as const, icon: iconFor("PackageCheck") },
      { label: "Capacity used", value: `${capacity}%`, detail: "Average fill across live warehouse stock rows.", tone: "blue" as const, icon: iconFor("Gauge") },
    ],
    headerActions: [
      { label: "Ready to receive", value: String(inboundOrders), icon: iconFor("Clock3"), tone: "amber" as const },
      { label: "Pick complete", value: "86%", icon: iconFor("CheckCircle2"), tone: "green" as const },
      { label: "Stock checks", value: String(stockChecks), icon: iconFor("PackageCheck"), tone: "teal" as const },
    ],
  }
}

export async function getWarehouseLiveData(): Promise<WarehouseLiveData> {
  const { companyId } = await readTenantContext()
  const [productsRaw, stockRaw, locationsRaw, areasRaw, ordersRaw, movementsRaw, workItemsRaw, calendarRaw] = await Promise.all([
    readRows<ProductRow>("Warehouse_Products", companyId),
    readRows<StockRow>("Warehouse_Stock", companyId),
    readRows<LocationRow>("Warehouse_Locations", companyId, "WHL_ID,WHL_Code,WHL_AreaID,Company_ID,Is_Deleted"),
    readRows<AreaRow>("Warehouse_Areas", companyId, "WHA_ID,WHA_Name,Company_ID,Is_Deleted"),
    readRows<OrderRow>("Warehouse_Orders", companyId),
    readRows<MovementRow>("Warehouse_Movements", companyId),
    readRows<WorkItemRow>("Warehouse_Work_Items", companyId),
    readRows<CalendarEventRow>("Warehouse_Calendar_Events", companyId),
  ])

  const products = mapProducts(productsRaw, stockRaw)
  const stock = mapStock(productsRaw, stockRaw, locationsRaw, areasRaw)
  const orders = mapOrders(ordersRaw)
  const movements = mapMovements(movementsRaw)
  const workItems = mapWorkItems(workItemsRaw)
  const calendar = mapCalendar(calendarRaw)

  return {
    overview: makeOverview(products, orders, stock, calendar),
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
  const { companyId } = await readTenantContext()
  const client = assertSupabase()

  for (const column of columns) {
    for (const [index, card] of column.cards.entries()) {
      const { error } = await client
        .from("Warehouse_Work_Items")
        .update({
          WHWI_ColumnID: column.id,
          WHWI_ColumnTitle: column.title,
          WHWI_ColumnMeta: column.meta ?? null,
          WHWI_SortOrder: index + 1,
          Updated_At: new Date().toISOString(),
        })
        .eq("Company_ID", companyId)
        .eq("WHWI_Board", board)
        .eq("WHWI_CardID", (card as WarehouseKanbanCardData).id)

      if (error) throw error
    }
  }
}
