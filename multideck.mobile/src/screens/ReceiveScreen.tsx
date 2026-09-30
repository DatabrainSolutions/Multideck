import { useCallback, useEffect, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Field } from "@/components/FormControls"
import { DataCard, EmptyState, ErrorState, LoadingState, MetricRow, QuantityField, ScanField, SuccessState, WarehouseButton, WarehouseScreen, WarningState } from "@/components/WarehouseUI"
import { formatQuantity, message, type ScreenProps } from "@/screens/screenSupport"
import { colors, radius, spacing, type } from "@/theme/tokens"
import { sameScan, type WarehouseLocation, type WarehouseOrder, type WarehouseOrderLine } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"
import { scanFeedback, useScanStep } from "@/warehouse/scanner"

const receivingLocationTypes = ["dock", "staging"]

type ReceiptRow = {
  line: WarehouseOrderLine
  quantity: string
  damagedQuantity: string
  missingQuantity: string
  lotNumber: string
  expiryDate: string
  expanded: boolean
}

const remainingOf = (order: WarehouseOrder) => order.lines.reduce((sum, line) => sum + Number(line.remainingQuantity), 0)
const openLines = (order: WarehouseOrder) => order.lines.filter((line) => Number(line.remainingQuantity) > 0)

function isReceivingLocation(location: WarehouseLocation) {
  return location.isActive && location.statusCode === "available" && receivingLocationTypes.includes(location.typeCode)
}

export function ReceiveScreen({ api, facility, initialOrderId, onBack }: ScreenProps & { initialOrderId?: string }) {
  const [orders, setOrders] = useState<WarehouseOrder[]>([])
  const [docks, setDocks] = useState<WarehouseLocation[]>([])
  const [selected, setSelected] = useState<WarehouseOrder | null>(null)
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [filter, setFilter] = useState("")
  const [counting, setCounting] = useState(false)
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const location = useScanStep<WarehouseLocation>(async (scan) => {
    const found = await api.findLocation(facility.id, scan)
    if (!found || !isReceivingLocation(found)) return { ok: false, message: wt("receivingLocationNotFound") }
    return { ok: true, value: found, note: `${found.code} · ${found.typeName || found.typeCode}` }
  })
  const countScan = useScanStep<ReceiptRow>((scan) => {
    const row = rows.find((candidate) => sameScan(candidate.line.sku, scan))
    return row ? { ok: true, value: row } : { ok: false, message: wt("itemNotOnOrder") }
  })

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [orderPage, locationRows] = await Promise.all([
        api.listOrders({ facilityId: facility.id, typeCode: "inbound", openOnly: true, limit: 50, offset: 0 }),
        api.listLocations(facility.id),
      ])
      setOrders(orderPage.rows.filter((order) => openLines(order).length > 0))
      // First page only: quick picks. Any other dock or staging bay can still be scanned.
      setDocks(locationRows.filter(isReceivingLocation).slice(0, 6))
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }, [api, facility.id])

  useEffect(() => { void load().then(() => { if (initialOrderId) void openOrder(initialOrderId) }) }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  async function openOrder(orderId: string) {
    setLoading(true); setError(null); setSuccess(null)
    try {
      const detail = await api.getOrder(orderId)
      setSelected(detail); setNotes(""); setCounting(false)
      setRows(openLines(detail).map((line) => ({
        line,
        quantity: formatQuantity(Number(line.remainingQuantity)),
        damagedQuantity: "0",
        missingQuantity: "0",
        lotNumber: line.lotNumber ?? "",
        expiryDate: line.expiryDate ?? "",
        expanded: Boolean(line.lotNumber || line.expiryDate),
      })))
      location.reset(); countScan.reset(); location.focus()
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }

  function submitFilter(text: string) {
    const scan = text.trim()
    if (!scan) return
    const found = orders.filter((order) => [order.orderNumber, order.customerReference, order.containerNumber, order.vehicleReg].some((value) => sameScan(value, scan)))
    if (found.length === 1 && found[0]) { setFilter(""); scanFeedback("ok"); void openOrder(found[0].id); return }
    // Orders outside the first page are still reachable by their exact number.
    void api.findOrderByNumber(scan).then((order) => {
      if (order && order.typeCode === "inbound" && order.facilityId === facility.id) { setFilter(""); scanFeedback("ok"); void openOrder(order.id) }
      else if (!found.length) { scanFeedback("error"); setError(wt("noOrderForScan")) }
    }).catch((lookupError) => setError(message(lookupError)))
  }

  async function chooseLocation(text: string) {
    if (!await location.submit(text)) return
    // Never leave focus on a completed step: the next trigger pull would overwrite it.
    if (counting) countScan.focus()
    else location.ref.current?.blur()
  }

  function patchRow(orderLineId: string, patch: Partial<ReceiptRow>) {
    setRows((current) => current.map((row) => row.line.id === orderLineId ? { ...row, ...patch } : row))
  }

  function startCounting() {
    setCounting(true)
    setRows((current) => current.map((row) => ({ ...row, quantity: "0" })))
    countScan.reset(); countScan.focus()
  }

  async function submitCount(text: string) {
    const row = await countScan.submit(text)
    if (!row) return
    const current = rows.find((candidate) => candidate.line.id === row.line.id)
    if (current && (Number(current.quantity) || 0) + 1 > Number(current.line.remainingQuantity)) {
      scanFeedback("error"); setError(`${row.line.sku}: ${wt("overExpected")}`)
      countScan.reset(); countScan.focus()
      return
    }
    setError(null)
    setRows((current) => current.map((candidate) => candidate.line.id === row.line.id ? { ...candidate, quantity: formatQuantity((Number(candidate.quantity) || 0) + 1) } : candidate))
    countScan.reset(); countScan.focus()
  }

  async function receive() {
    if (!selected) return
    setError(null)
    const target = location.result ?? await location.submit()
    if (!target) return setError(wt("receivingLocationNotFound"))
    const posted = rows.map((row) => ({ row, quantity: Number(row.quantity), damaged: Number(row.damagedQuantity), missing: Number(row.missingQuantity), remaining: Number(row.line.remainingQuantity) }))
    const invalid = posted.some(({ quantity, damaged, missing, remaining }) => ![quantity, damaged, missing].every(Number.isFinite) || quantity < 0 || damaged < 0 || damaged > quantity || missing < 0 || (missing > 0 && quantity <= 0) || quantity + missing > remaining)
    if (invalid || !posted.some(({ quantity }) => quantity > 0)) return setError(wt("checkReceiptQuantities"))

    setBusy(true)
    try {
      await api.receiveOrder(selected.id, {
        receivingLocationId: target.id,
        notes: notes.trim() || null,
        lines: posted.filter(({ quantity }) => quantity > 0).map(({ row, quantity, damaged, missing }) => ({
          orderLineId: row.line.id,
          quantity,
          damagedQuantity: damaged,
          missingQuantity: missing,
          targetLocationId: target.id,
          lotNumber: row.lotNumber.trim() || null,
          batchNumber: row.lotNumber.trim() || null,
          manufactureDate: null,
          expiryDate: row.expiryDate.trim() || null,
        })),
      })
      scanFeedback("ok")
      setSelected(null); setRows([])
      setSuccess(`${selected.orderNumber}: ${wt("receiptComplete")}`)
      await load()
    } catch (actionError) {
      scanFeedback("error")
      setError(message(actionError))
    } finally {
      setBusy(false)
    }
  }

  const totalReceiving = rows.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0)
  const linesReceiving = rows.filter((row) => Number(row.quantity) > 0).length
  const visibleOrders = filter.trim() ? orders.filter((order) => [order.orderNumber, order.customerName, order.customerReference, order.containerNumber, order.vehicleReg].some((value) => value?.toLowerCase().includes(filter.trim().toLowerCase()))) : orders

  if (!selected) {
    return <WarehouseScreen title={wt("receive")} subtitle={wt("receiveQueueDetail")} onBack={onBack} onRefresh={() => void load()} refreshing={loading && orders.length > 0}>
      {success ? <SuccessState message={success} /> : null}
      <ScanField label={wt("findOrder")} value={filter} onChangeText={(value) => { setFilter(value); setError(null) }} onSubmit={submitFilter} placeholder={wt("findOrderPlaceholder")} autoFocus />
      {error && orders.length ? <WarningState message={error} /> : null}
      {loading && !orders.length ? <LoadingState /> : error && !orders.length ? <ErrorState message={error} onRetry={() => void load()} /> : visibleOrders.length ? visibleOrders.map((order) => <DataCard key={order.id} title={order.orderNumber} meta={[order.customerName, order.customerReference].filter(Boolean).join(" · ")} status={order.statusName || order.statusCode} onPress={() => void openOrder(order.id)}>
        {order.appointmentStartAt || order.vehicleReg || order.containerNumber ? <Text style={styles.detail}>{[order.appointmentStartAt ? new Date(order.appointmentStartAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : null, order.vehicleReg, order.containerNumber].filter(Boolean).join(" · ")}</Text> : null}
        <MetricRow values={[{ label: wt("lines"), value: String(openLines(order).length) }, { label: wt("remaining"), value: formatQuantity(remainingOf(order)) }]} />
      </DataCard>) : <EmptyState message={filter.trim() ? wt("noResults") : wt("nothingToReceive")} />}
    </WarehouseScreen>
  }

  return <WarehouseScreen title={selected.orderNumber} onBack={() => { setSelected(null); setError(null) }}>
    {loading ? <LoadingState /> : null}
    <Text style={styles.orderMeta}>{[selected.customerName, selected.customerReference, selected.containerNumber, selected.vehicleReg].filter(Boolean).join(" · ")}</Text>
    {selected.instructions ? <WarningState message={selected.instructions} /> : null}

    <ScanField ref={location.ref} label={`1 · ${wt("receivingLocation")}`} value={location.value} onChangeText={location.change} onSubmit={(text) => void chooseLocation(text)} status={location.status} message={location.message} placeholder={wt("scanLocationPlaceholder")} autoFocus />
    {docks.length ? <View style={styles.chips}>
      {docks.map((dock) => {
        const chosen = location.result?.id === dock.id
        return <Pressable key={dock.id} accessibilityRole="button" accessibilityState={{ selected: chosen }} onPress={() => { location.setValue(dock.code); void chooseLocation(dock.code) }} style={({ pressed }) => [styles.chip, chosen && styles.chipSelected, pressed && styles.chipPressed]}><Text style={[styles.chipText, chosen && styles.chipTextSelected]}>{dock.code}</Text></Pressable>
      })}
    </View> : null}

    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{`2 · ${wt("whatArrived")}`}</Text>
      {!counting ? <Pressable accessibilityRole="button" hitSlop={8} onPress={startCounting}><Text style={styles.link}>{wt("countByScan")}</Text></Pressable> : <Pressable accessibilityRole="button" hitSlop={8} onPress={() => { setCounting(false); setRows((current) => current.map((row) => ({ ...row, quantity: formatQuantity(Number(row.line.remainingQuantity)) }))) }}><Text style={styles.link}>{wt("allArrived")}</Text></Pressable>}
    </View>
    {counting ? <ScanField ref={countScan.ref} label={wt("scanEachItem")} value={countScan.value} onChangeText={countScan.change} onSubmit={(text) => void submitCount(text)} status={countScan.status === "matched" ? "idle" : countScan.status} message={countScan.message} placeholder={wt("scanItemPlaceholder")} /> : null}

    {rows.map((row) => {
      const remaining = Number(row.line.remainingQuantity)
      const short = remaining - (Number(row.quantity) || 0)
      return <DataCard key={row.line.id} title={row.line.sku} meta={row.line.description} status={`${formatQuantity(remaining)} ${row.line.uomCode} ${wt("expected").toLowerCase()}`}>
        <QuantityField label={wt("receivedQuantity")} value={row.quantity} onChangeText={(value) => patchRow(row.line.id, { quantity: value })} max={remaining} uomCode={row.line.uomCode} />
        {short > 0 && !row.expanded ? <Text style={styles.shortNote}>{`${formatQuantity(short)} ${row.line.uomCode} ${wt("shortOfExpected")}`}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: row.expanded }} hitSlop={8} onPress={() => patchRow(row.line.id, { expanded: !row.expanded })} style={styles.detailsToggle}>
          <Text style={styles.link}>{row.expanded ? wt("hideDetails") : wt("damagedMissingLot")}</Text>
        </Pressable>
        {row.expanded ? <>
          <Field label={wt("damagedQuantity")} value={row.damagedQuantity} onChangeText={(value) => patchRow(row.line.id, { damagedQuantity: value })} keyboardType="decimal-pad" suffix={row.line.uomCode} />
          <Field label={wt("missingQuantity")} value={row.missingQuantity} onChangeText={(value) => patchRow(row.line.id, { missingQuantity: value })} keyboardType="decimal-pad" suffix={row.line.uomCode} />
          <Field label={wt("lotNumber")} value={row.lotNumber} onChangeText={(value) => patchRow(row.line.id, { lotNumber: value })} autoCapitalize="characters" />
          <Field label={wt("expiryDate")} value={row.expiryDate} onChangeText={(value) => patchRow(row.line.id, { expiryDate: value })} placeholder="YYYY-MM-DD" />
        </> : null}
        {row.line.instructions ? <Text style={styles.detail}>{row.line.instructions}</Text> : null}
      </DataCard>
    })}

    <Field label={wt("notesOptional")} value={notes} onChangeText={setNotes} multiline style={styles.notes} />
    {error ? <WarningState message={error} /> : null}
    <WarehouseButton label={linesReceiving ? `${wt("confirmReceipt")} · ${formatQuantity(totalReceiving)} ${wt("units")}` : wt("confirmReceipt")} busy={busy} disabled={!location.value.trim() || !linesReceiving} onPress={() => void receive()} />
  </WarehouseScreen>
}

const styles = StyleSheet.create({
  orderMeta: { color: colors.text, fontSize: type.label, lineHeight: 18, marginBottom: spacing.xs, writingDirection: "ltr" },
  detail: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.sm, writingDirection: "ltr" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  chip: { backgroundColor: colors.surface, borderColor: colors.hairline, borderRadius: radius.lg, borderWidth: 1, minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg },
  chipPressed: { opacity: 0.7 },
  chipSelected: { backgroundColor: colors.successSurface, borderColor: colors.success },
  chipTextSelected: { color: colors.success },
  chipText: { color: colors.inkSoft, fontSize: type.body, fontWeight: "500" },
  sectionRow: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm, marginTop: spacing.lg },
  sectionTitle: { color: colors.ink, fontSize: type.label, fontWeight: "500" },
  link: { color: colors.accent, fontSize: type.label, fontWeight: "500" },
  shortNote: { color: colors.warning, fontSize: type.meta, marginTop: -spacing.xs },
  detailsToggle: { alignSelf: "flex-start", paddingVertical: spacing.sm },
  notes: { minHeight: 90, textAlignVertical: "top" },
})
