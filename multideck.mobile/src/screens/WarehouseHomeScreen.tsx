import { useCallback, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { useFocusEffect } from "@react-navigation/native"
import { ActionTile, DataCard, QueueTile, ScanField, SectionLabel, WarehouseButton, WarehouseScreen } from "@/components/WarehouseUI"
import { colors, spacing, type } from "@/theme/tokens"
import type { WarehouseFacility, WarehouseHandlingUnit, WarehouseLocation, WarehouseMobileApi, WarehouseOrder } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"
import { useScanStep } from "@/warehouse/scanner"

export type WarehouseRouteParams = {
  Receive: { orderId?: string } | undefined
  Putaway: { filter?: string } | undefined
  Pick: { filter?: string } | undefined
  Ship: { orderId?: string } | undefined
  LocationCheck: { scan?: string } | undefined
  StockEnquiry: { search?: string } | undefined
  StockItems: undefined
  Pallets: { search?: string } | undefined
  PalletMove: { palletCode?: string } | undefined
  Consolidation: undefined
  Exceptions: undefined
}
export type WarehouseRouteName = keyof WarehouseRouteParams
export type OpenWarehouseRoute = <Route extends WarehouseRouteName>(route: Route, params?: WarehouseRouteParams[Route]) => void

type Counts = Partial<Record<"receive" | "putaway" | "pick" | "ship" | "exceptions", number | "many">>
type ScanMatch = { location: WarehouseLocation | null; pallet: WarehouseHandlingUnit | null; order: WarehouseOrder | null; stockLines: number; scan: string }

const hasRemainingReceipt = (order: WarehouseOrder) => order.lines.some((line) => Number(line.remainingQuantity) > 0)
const hasPickedStock = (order: WarehouseOrder) => order.lines.some((line) => Number(line.pickedQuantity) > Number(line.dispatchedQuantity))

function countLabel(value: number | "many" | undefined) {
  return value === undefined ? "–" : value === "many" ? "50+" : String(value)
}

export function WarehouseHomeScreen({ api, facility, onOpen }: { api: WarehouseMobileApi; facility: WarehouseFacility; onOpen: OpenWarehouseRoute }) {
  const [counts, setCounts] = useState<Counts>({})
  const [refreshing, setRefreshing] = useState(false)

  const loadCounts = useCallback(async () => {
    setRefreshing(true)
    // Each queue is counted independently so one slow or failing read never blanks the others.
    const capped = (rows: number, total: number): number | "many" => total > rows && rows >= 50 ? "many" : rows
    await Promise.allSettled([
      api.listOrders({ facilityId: facility.id, typeCode: "inbound", openOnly: true, limit: 50, offset: 0 }).then((page) => setCounts((current) => ({ ...current, receive: capped(page.rows.filter(hasRemainingReceipt).length, page.total) }))),
      api.countOpenTasks(facility.id, "putaway").then((total) => setCounts((current) => ({ ...current, putaway: total }))),
      api.countOpenTasks(facility.id, "pick").then((total) => setCounts((current) => ({ ...current, pick: total }))),
      api.listOrders({ facilityId: facility.id, typeCode: "outbound", openOnly: true, limit: 50, offset: 0 }).then((page) => setCounts((current) => ({ ...current, ship: capped(page.rows.filter(hasPickedStock).length, page.total) }))),
      api.listExceptions({ facilityId: facility.id }).then((rows) => setCounts((current) => ({ ...current, exceptions: rows.length >= 50 ? "many" : rows.length }))),
    ])
    setRefreshing(false)
  }, [api, facility.id])

  useFocusEffect(useCallback(() => { void loadCounts() }, [loadCounts]))

  const lookup = useScanStep<ScanMatch>(async (scan) => {
    const [location, pallet, order, stock] = await Promise.all([
      api.findLocation(facility.id, scan),
      api.findHandlingUnit(facility.id, scan),
      api.findOrderByNumber(scan).then((found) => found && found.facilityId === facility.id ? found : null),
      api.listInventory({ facilityId: facility.id, search: scan }),
    ])
    if (!location && !pallet && !order && !stock.length) return { ok: false, message: wt("nothingMatchesScan") }
    return { ok: true, value: { location, pallet, order, stockLines: stock.length, scan } }
  })
  const match = lookup.result

  return (
    <WarehouseScreen onRefresh={() => void loadCounts()} refreshing={refreshing}>
      <ScanField ref={lookup.ref} label={wt("scanAnything")} value={lookup.value} onChangeText={lookup.change} onSubmit={(text) => void lookup.submit(text)} status={lookup.status === "matched" ? "idle" : lookup.status} message={lookup.message} placeholder={wt("scanAnythingPlaceholder")} autoFocus />

      {match ? <View style={styles.results}>
        {match.pallet ? <DataCard title={match.pallet.code} meta={[wt("pallet"), match.pallet.locationCode ? `${wt("at")} ${match.pallet.locationCode}` : null, match.pallet.customerName].filter(Boolean).join(" · ")} status={match.pallet.inventoryStatusName}>
          <Text style={styles.detail}>{match.pallet.contents.map((content) => `${content.sku} × ${content.quantity}`).join(" · ") || wt("emptyPallet")}</Text>
          <View style={styles.resultActions}>
            <WarehouseButton compact label={wt("movePallet")} onPress={() => onOpen("PalletMove", { palletCode: match.pallet?.code })} />
            <WarehouseButton compact tone="secondary" label={wt("viewPallet")} onPress={() => onOpen("Pallets", { search: match.pallet?.code })} />
          </View>
        </DataCard> : null}
        {match.location ? <DataCard title={match.location.code} meta={[wt("location"), match.location.typeName || match.location.typeCode, match.location.zoneName].filter(Boolean).join(" · ")} status={match.location.statusName || match.location.statusCode}>
          <View style={styles.resultActions}>
            <WarehouseButton compact label={wt("checkLocation")} onPress={() => onOpen("LocationCheck", { scan: match.location?.code })} />
            <WarehouseButton compact tone="secondary" label={wt("putAwayHere")} onPress={() => onOpen("Putaway", { filter: match.location?.code })} />
          </View>
        </DataCard> : null}
        {match.order ? <DataCard title={match.order.orderNumber} meta={[match.order.typeCode === "inbound" ? wt("goodsIn") : wt("goodsOut"), match.order.customerName, match.order.customerReference].filter(Boolean).join(" · ")} status={match.order.statusName || match.order.statusCode}>
          <View style={styles.resultActions}>
            {match.order.typeCode === "inbound" && hasRemainingReceipt(match.order) ? <WarehouseButton compact label={wt("receive")} onPress={() => onOpen("Receive", { orderId: match.order?.id })} /> : null}
            {match.order.typeCode === "outbound" ? <WarehouseButton compact label={wt("pick")} onPress={() => onOpen("Pick", { filter: match.order?.orderNumber })} /> : null}
            {match.order.typeCode === "outbound" && hasPickedStock(match.order) ? <WarehouseButton compact tone="secondary" label={wt("ship")} onPress={() => onOpen("Ship", { orderId: match.order?.id })} /> : null}
          </View>
        </DataCard> : null}
        {match.stockLines && !match.pallet && !match.location ? <DataCard title={match.scan} meta={`${match.stockLines >= 50 ? "50+" : match.stockLines} ${wt("stockLinesMatch")}`}>
          <View style={styles.resultActions}><WarehouseButton compact label={wt("stockEnquiry")} onPress={() => onOpen("StockEnquiry", { search: match.scan })} /></View>
        </DataCard> : null}
      </View> : null}

      <SectionLabel>{wt("workQueues")}</SectionLabel>
      <View style={styles.grid}>
        <QueueTile label={wt("receive")} count={countLabel(counts.receive)} detail={wt("receiveTileDetail")} onPress={() => onOpen("Receive")} />
        <QueueTile label={wt("putAway")} count={countLabel(counts.putaway)} detail={wt("putawayTileDetail")} onPress={() => onOpen("Putaway")} />
      </View>
      <View style={styles.grid}>
        <QueueTile label={wt("pick")} count={countLabel(counts.pick)} detail={wt("pickTileDetail")} onPress={() => onOpen("Pick")} />
        <QueueTile label={wt("ship")} count={countLabel(counts.ship)} detail={wt("shipTileDetail")} onPress={() => onOpen("Ship")} />
      </View>

      <SectionLabel>{wt("stockSection")}</SectionLabel>
      <ActionTile icon="⌕" label={wt("stockEnquiry")} detail={wt("stockEnquiryDetail")} onPress={() => onOpen("StockEnquiry")} />
      <ActionTile icon="⌖" label={wt("locationCheck")} detail={wt("locationCheckDetail")} onPress={() => onOpen("LocationCheck")} />
      <ActionTile icon="→" label={wt("moveOverride")} detail={wt("moveOverrideDetail")} onPress={() => onOpen("PalletMove")} />
      <ActionTile icon="⊕" label={wt("consolidation")} detail={wt("consolidationDetail")} onPress={() => onOpen("Consolidation")} />
      <ActionTile icon="□" label={wt("pallets")} detail={wt("palletsDetail")} onPress={() => onOpen("Pallets")} />
      <ActionTile icon="▦" label={wt("stockItems")} detail={wt("stockItemsDetail")} onPress={() => onOpen("StockItems")} />

      <SectionLabel>{wt("issuesSection")}</SectionLabel>
      <ActionTile icon="!" label={wt("exceptions")} detail={counts.exceptions ? `${countLabel(counts.exceptions)} ${wt("openExceptions")}` : wt("exceptionsDetail")} onPress={() => onOpen("Exceptions")} />
    </WarehouseScreen>
  )
}

const styles = StyleSheet.create({
  results: { marginBottom: spacing.sm },
  detail: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.sm, writingDirection: "ltr" },
  resultActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  grid: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
})
