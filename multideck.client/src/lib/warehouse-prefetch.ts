import {
  getWarehouseHandlingUnitReference,
  getWarehouseOrderReference,
  getWarehouseWorkspaceData,
  listOperationalWarehouseOrders,
  listWarehouseHandlingUnits,
  listWarehouseInventory,
  listWarehouseInventoryExceptions,
  listWarehouseInventoryMovements,
} from "@/lib/warehouse"

let prefetch: Promise<unknown> | null = null

/** Warms the operator's default warehouse registers after authentication. */
export function prefetchWarehouseCollections() {
  if (!prefetch) {
    prefetch = Promise.allSettled([
      getWarehouseWorkspaceData(),
      getWarehouseOrderReference(),
      listOperationalWarehouseOrders({ typeCode: "inbound", openOnly: true }),
      listOperationalWarehouseOrders({ typeCode: "outbound", openOnly: true }),
      listOperationalWarehouseOrders({ openOnly: true }),
      listWarehouseInventory(),
      listWarehouseHandlingUnits(),
      listWarehouseInventoryMovements({ take: 250 }),
      listWarehouseInventoryExceptions({ openOnly: true }),
      getWarehouseHandlingUnitReference(),
    ]).finally(() => {
      prefetch = null
    })
  }

  return prefetch
}
