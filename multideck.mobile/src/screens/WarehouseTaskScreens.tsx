import { useCallback, useEffect, useMemo, useState } from "react"
import { StyleSheet, Text } from "react-native"
import { Field } from "@/components/FormControls"
import { DataCard, EmptyState, ErrorState, LoadingState, MetricRow, QuantityField, ScanField, SuccessState, WarehouseButton, WarehouseScreen, WarningState } from "@/components/WarehouseUI"
import { scanFeedback, useScanStep } from "@/warehouse/scanner"
import { colors, spacing, type } from "@/theme/tokens"
import { sameScan, type WarehouseFacility, type WarehouseLocation, type WarehouseMobileApi, type WarehouseOrder, type WarehouseTask } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"

function message(error: unknown) {
  return error instanceof Error ? error.message : wt("serviceError")
}

async function matchesTaskLocation(api: WarehouseMobileApi, facilityId: string, task: WarehouseTask, scan: string) {
  if (sameScan(task.sourceLocationCode, scan)) return true
  if (!task.sourceLocationId) return false
  // A scanned location barcode can differ from its printed code.
  return (await api.findLocation(facilityId, scan))?.id === task.sourceLocationId
}

const receivingLocationTypes = ["dock", "staging"]
const nonStorageLocationTypes = ["dock", "staging", "quarantine", "investigation"]

function remainingTaskQuantity(task: WarehouseTask) {
  return Math.max(0, Number(task.quantity) - Number(task.completedQuantity))
}

type ReceiptRow = {
  orderLineId: string
  remainingQuantity: number
  quantity: string
  damagedQuantity: string
  missingQuantity: string
  lotNumber: string
  expiryDate: string
}

export function ReceiveScreen({ api, facility, initialOrderId, onBack }: ScreenProps & { initialOrderId?: string }) {
  const [orders, setOrders] = useState<WarehouseOrder[]>([])
  const [selected, setSelected] = useState<WarehouseOrder | null>(null)
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [locationCode, setLocationCode] = useState("")
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [orderPage, locationRows] = await Promise.all([
        api.listOrders({ facilityId: facility.id, typeCode: "inbound", openOnly: true, limit: 50, offset: 0 }),
        api.listLocations(facility.id),
      ])
      setOrders(orderPage.rows.filter((order) => order.lines.some((line) => Number(line.remainingQuantity) > 0)))
      // First page only: these are quick picks. Any scanned location is resolved exactly on submit.
      setLocations(locationRows.filter((location) => location.isActive && location.statusCode === "available" && receivingLocationTypes.includes(location.typeCode)))
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }, [api, facility.id])

  useEffect(() => { void load().then(() => { if (initialOrderId) void chooseOrder({ id: initialOrderId }) }) }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  async function chooseOrder(order: Pick<WarehouseOrder, "id">) {
    setLoading(true); setError(null); setSuccess(null)
    try {
      const detail = await api.getOrder(order.id)
      setSelected(detail)
      setLocationCode("")
      setNotes("")
      setRows(detail.lines.filter((line) => Number(line.remainingQuantity) > 0).map((line) => ({
        orderLineId: line.id,
        remainingQuantity: Number(line.remainingQuantity),
        quantity: String(line.remainingQuantity),
        damagedQuantity: "0",
        missingQuantity: "0",
        lotNumber: line.lotNumber ?? "",
        expiryDate: line.expiryDate ?? "",
      })))
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }

  function patchRow(orderLineId: string, patch: Partial<ReceiptRow>) {
    setRows((current) => current.map((row) => row.orderLineId === orderLineId ? { ...row, ...patch } : row))
  }

  async function receive() {
    if (!selected) return
    setBusy(true); setError(null)
    let location: WarehouseLocation | null
    try { location = await api.findLocation(facility.id, locationCode) } catch (lookupError) { setBusy(false); return setError(message(lookupError)) }
    setBusy(false)
    if (!location || location.facilityId !== facility.id || !location.isActive || location.statusCode !== "available" || !receivingLocationTypes.includes(location.typeCode)) return setError(wt("receivingLocationNotFound"))
    const postedRows = rows.map((row) => ({ ...row, quantityNumber: Number(row.quantity), damagedNumber: Number(row.damagedQuantity), missingNumber: Number(row.missingQuantity) }))
    if (!postedRows.some((row) => row.quantityNumber > 0) || postedRows.some((row) => !Number.isFinite(row.quantityNumber) || row.quantityNumber < 0 || row.damagedNumber < 0 || row.damagedNumber > row.quantityNumber || row.missingNumber < 0 || (row.missingNumber > 0 && row.quantityNumber <= 0) || row.quantityNumber + row.missingNumber > row.remainingQuantity)) {
      return setError(wt("checkReceiptQuantities"))
    }

    setBusy(true); setError(null)
    try {
      await api.receiveOrder(selected.id, {
        receivingLocationId: location.id,
        notes: notes.trim() || null,
        lines: postedRows.filter((row) => row.quantityNumber > 0).map((row) => ({
          orderLineId: row.orderLineId,
          quantity: row.quantityNumber,
          damagedQuantity: row.damagedNumber,
          missingQuantity: row.missingNumber,
          targetLocationId: location.id,
          lotNumber: row.lotNumber.trim() || null,
          batchNumber: row.lotNumber.trim() || null,
          manufactureDate: null,
          expiryDate: row.expiryDate || null,
        })),
      })
      setSelected(null); setRows([]); setLocationCode(""); setNotes("")
      setSuccess(wt("receiptComplete"))
      await load()
    } catch (actionError) {
      setError(message(actionError))
    } finally {
      setBusy(false)
    }
  }

  return <WarehouseScreen title={wt("receive")} subtitle={selected ? wt("receiveOrderDetail") : wt("receiveQueueDetail")} onBack={selected ? () => { setSelected(null); setError(null) } : onBack} actions={<WarehouseButton compact label={wt("refresh")} tone="secondary" onPress={() => void load()} />}>
    {success ? <SuccessState message={success} /> : null}
    {loading ? <LoadingState /> : error && !selected ? <ErrorState message={error} onRetry={() => void load()} /> : !selected ? orders.length ? orders.map((order) => <DataCard key={order.id} title={order.orderNumber} meta={[order.customerName, order.customerReference].filter(Boolean).join(" · ")} status={order.statusName || order.statusCode} onPress={() => void chooseOrder(order)}>
      <MetricRow values={[{ label: wt("lines"), value: String(order.lines.filter((line) => Number(line.remainingQuantity) > 0).length) }, { label: wt("remaining"), value: String(order.lines.reduce((sum, line) => sum + Number(line.remainingQuantity), 0)) }]} />
    </DataCard>) : <EmptyState message={wt("nothingToReceive")} /> : <>
      <DataCard title={selected.orderNumber} meta={[selected.customerName, selected.customerReference].filter(Boolean).join(" · ")} status={selected.statusName || selected.statusCode} />
      <ScanField value={locationCode} onChangeText={setLocationCode} placeholder={wt("receivingLocation")} autoFocus />
      <Text style={styles.helper}>{wt("receivingLocationHelp")}</Text>
      {selected.lines.filter((line) => rows.some((row) => row.orderLineId === line.id)).map((line) => {
        const row = rows.find((candidate) => candidate.orderLineId === line.id)
        if (!row) return null
        return <DataCard key={line.id} title={line.sku} meta={line.description} status={`${line.remainingQuantity} ${line.uomCode} ${wt("remaining").toLowerCase()}`}>
          <Field label={wt("receivedQuantity")} value={row.quantity} onChangeText={(value) => patchRow(line.id, { quantity: value })} keyboardType="decimal-pad" suffix={line.uomCode} />
          <Field label={wt("damagedQuantity")} value={row.damagedQuantity} onChangeText={(value) => patchRow(line.id, { damagedQuantity: value })} keyboardType="decimal-pad" suffix={line.uomCode} />
          <Field label={wt("missingQuantity")} value={row.missingQuantity} onChangeText={(value) => patchRow(line.id, { missingQuantity: value })} keyboardType="decimal-pad" suffix={line.uomCode} />
          <Field label={wt("lotNumber")} value={row.lotNumber} onChangeText={(value) => patchRow(line.id, { lotNumber: value })} autoCapitalize="characters" />
          <Field label={wt("expiryDate")} value={row.expiryDate} onChangeText={(value) => patchRow(line.id, { expiryDate: value })} placeholder="YYYY-MM-DD" />
        </DataCard>
      })}
      <Field label={wt("notes")} value={notes} onChangeText={setNotes} multiline style={styles.notes} />
      {error ? <WarningState message={error} /> : null}
      <WarehouseButton label={wt("confirmReceipt")} busy={busy} disabled={!locationCode.trim()} onPress={() => void receive()} />
    </>}
  </WarehouseScreen>
}

function sortTasks(tasks: WarehouseTask[], typeCode: "putaway" | "pick") {
  // Picks follow the walk through the racking; putaways keep arrival order.
  if (typeCode === "putaway") return tasks
  return [...tasks].sort((first, second) => (first.sourceLocationCode ?? "").localeCompare(second.sourceLocationCode ?? "", undefined, { numeric: true }) || first.createdAt.localeCompare(second.createdAt))
}

function matchesTaskFilter(task: WarehouseTask, scan: string) {
  return [task.sourceLocationCode, task.targetLocationCode, task.sku, task.orderNumber, task.lotNumber].some((value) => sameScan(value, scan))
}

type ScreenProps = { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }

function WarehouseTaskQueueScreen({ api, facility, onBack, typeCode, initialFilter }: ScreenProps & { typeCode: "putaway" | "pick"; initialFilter?: string }) {
  const [tasks, setTasks] = useState<WarehouseTask[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<WarehouseTask | null>(null)
  const [filter, setFilter] = useState(initialFilter ?? "")
  const [quantity, setQuantity] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const isPutaway = typeCode === "putaway"

  const source = useScanStep<true>(async (scan) => {
    if (!selected) return { ok: false, message: wt("sourceScanMismatch") }
    return await matchesTaskLocation(api, facility.id, selected, scan)
      ? { ok: true, value: true }
      : { ok: false, message: `${wt("wrongLocation")} ${selected.sourceLocationCode ?? "—"}.` }
  })
  const target = useScanStep<WarehouseLocation>(async (scan) => {
    const location = await api.findLocation(facility.id, scan)
    if (!location) return { ok: false, message: wt("locationNotFound") }
    if (!location.isActive || location.statusCode !== "available" || nonStorageLocationTypes.includes(location.typeCode)) return { ok: false, message: wt("destinationNotStorage") }
    const suggested = selected?.targetLocationCode
    return { ok: true, value: location, note: suggested && !sameScan(suggested, location.code) ? `${location.code} · ${wt("differentFromSuggested")} ${suggested}` : `${location.code} · ${location.typeName || location.typeCode}` }
  })
  const item = useScanStep<true>((scan) => sameScan(selected?.sku, scan)
    ? { ok: true, value: true }
    : { ok: true, value: true, note: wt("barcodeCheckedOnConfirm"), warning: false })

  const load = useCallback(async (openNext = false, openMatching?: string) => {
    setLoading(true); setError(null)
    try {
      const page = await api.listTasks({ facilityId: facility.id, type: typeCode, status: "open", limit: 50, offset: 0 })
      const ordered = sortTasks(page.rows, typeCode)
      setTasks(ordered); setTotal(page.total)
      const matching = openMatching ? ordered.filter((task) => matchesTaskFilter(task, openMatching)) : []
      if (matching.length === 1 && matching[0]) { setFilter(""); openTask(matching[0]) }
      else if (openNext && ordered[0]) openTask(ordered[0])
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }, [api, facility.id, typeCode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(false, initialFilter) }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  function openTask(task: WarehouseTask) {
    setSelected(task)
    setQuantity(String(remainingTaskQuantity(task)))
    setNotes(""); setError(null)
    source.reset(); target.reset(); item.reset()
    source.focus()
  }

  function closeTask() {
    setSelected(null); setError(null); setSuccess(null)
  }

  function submitFilter(text = filter) {
    const scan = text.trim()
    if (!scan) return
    const found = tasks.filter((task) => matchesTaskFilter(task, scan))
    if (found.length === 1 && found[0]) { setFilter(""); setSuccess(null); openTask(found[0]); scanFeedback("ok") }
    else if (!found.length) { setError(wt("noTaskForScan")); scanFeedback("error") }
  }

  async function submitSource(text: string) {
    if (await source.submit(text)) (isPutaway ? target : item).focus()
  }

  async function confirm() {
    if (!selected) return
    const numericQuantity = Number(quantity)
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0 || numericQuantity > remainingTaskQuantity(selected)) return setError(wt("checkTaskQuantity"))
    setBusy(true); setError(null)
    try {
      const sourceOk = source.status === "matched" || await source.submit()
      if (!sourceOk) return setError(wt("sourceScanMismatch"))
      const location = isPutaway ? target.result ?? await target.submit() : null
      if (isPutaway && !location) return setError(wt("destinationNotFound"))
      if (!isPutaway && !item.value.trim()) return setError(wt("scanItemFirst"))
      await api.confirmTask(selected.id, {
        quantity: numericQuantity,
        ...(location ? { targetLocationId: location.id, scannedTargetLocationCode: target.value.trim() } : {}),
        scannedSourceLocationCode: source.value.trim(),
        ...(!isPutaway ? { scannedItemCode: item.value.trim() } : {}),
        notes: notes.trim() || null,
      })
      scanFeedback("ok")
      setSuccess(isPutaway ? wt("putawayComplete") : wt("pickComplete"))
      setSelected(null)
      await load(true)
    } catch (actionError) {
      scanFeedback("error")
      setError(message(actionError))
    } finally {
      setBusy(false)
    }
  }

  const title = isPutaway ? wt("putAway") : wt("pick")
  const visibleTasks = filter.trim() ? tasks.filter((task) => [task.sourceLocationCode, task.targetLocationCode, task.sku, task.orderNumber, task.lotNumber, task.customerName].some((value) => value?.toLowerCase().includes(filter.trim().toLowerCase()))) : tasks
  const position = selected ? tasks.findIndex((task) => task.id === selected.id) : -1

  return <WarehouseScreen title={title} subtitle={selected ? undefined : isPutaway ? wt("putawayQueueDetail") : wt("pickQueueDetail")} onBack={selected ? closeTask : onBack} onRefresh={selected ? undefined : () => void load()} refreshing={loading && tasks.length > 0} actions={selected ? (position >= 0 ? <Text style={styles.position}>{position + 1} / {total}</Text> : null) : <WarehouseButton compact label={wt("refresh")} tone="secondary" onPress={() => void load()} />}>
    {success ? <SuccessState message={success} /> : null}
    {!selected ? <>
      <ScanField label={wt("findTask")} value={filter} onChangeText={(value) => { setFilter(value); setError(null) }} onSubmit={submitFilter} placeholder={wt("findTaskPlaceholder")} autoFocus />
      {error && !loading ? <WarningState message={error} /> : null}
      {loading && !tasks.length ? <LoadingState /> : visibleTasks.length ? visibleTasks.map((task) => <DataCard key={task.id} title={`${task.sourceLocationCode || "—"} → ${isPutaway ? task.targetLocationCode || wt("chooseDestination") : wt("dispatchStage")}`} meta={[task.sku, task.description].filter(Boolean).join(" · ")} status={`${remainingTaskQuantity(task)} ${task.uomCode}`} onPress={() => { setSuccess(null); openTask(task) }}>
        <Text style={styles.detail}>{[task.orderNumber, task.customerName, task.lotNumber ? `${wt("lotNumber")} ${task.lotNumber}` : null].filter(Boolean).join(" · ")}</Text>
      </DataCard>) : !error ? <EmptyState message={isPutaway ? wt("nothingToPutAway") : wt("nothingToPick")} /> : null}
    </> : <>
      <DataCard title={selected.sku || title} meta={[selected.description, selected.orderNumber, selected.customerName].filter(Boolean).join(" · ")} status={selected.statusCode === "in_progress" ? wt("inProgress") : null}>
        <MetricRow values={[{ label: wt("remaining"), value: `${remainingTaskQuantity(selected)} ${selected.uomCode}` }, { label: wt("lotNumber"), value: selected.lotNumber || "—" }]} />
      </DataCard>
      <ScanField ref={source.ref} label={`1 · ${wt("scanSource")}`} expected={selected.sourceLocationCode} value={source.value} onChangeText={source.change} onSubmit={(text) => void submitSource(text)} status={source.status} message={source.message} placeholder={wt("scanLocationPlaceholder")} autoFocus />
      {isPutaway
        ? <ScanField ref={target.ref} label={`2 · ${wt("scanDestination")}`} expected={selected.targetLocationCode ? `${wt("suggested")} ${selected.targetLocationCode}` : null} value={target.value} onChangeText={target.change} onSubmit={(text) => void target.submit(text)} status={target.status} message={target.message} placeholder={wt("scanLocationPlaceholder")} />
        : <ScanField ref={item.ref} label={`2 · ${wt("scanItem")}`} expected={selected.sku} value={item.value} onChangeText={item.change} onSubmit={(text) => void item.submit(text)} status={item.status === "matched" && item.message ? "idle" : item.status} message={item.message} placeholder={wt("scanItemPlaceholder")} />}
      <QuantityField label={`3 · ${isPutaway ? wt("quantityToPutAway") : wt("quantityToPick")}`} value={quantity} onChangeText={setQuantity} max={remainingTaskQuantity(selected)} uomCode={selected.uomCode} />
      <Field label={wt("notesOptional")} value={notes} onChangeText={setNotes} multiline style={styles.notes} />
      {error ? <WarningState message={error} /> : null}
      <WarehouseButton label={isPutaway ? wt("confirmPutaway") : wt("confirmPick")} busy={busy} disabled={!source.value.trim() || (isPutaway ? !target.value.trim() : !item.value.trim())} onPress={() => void confirm()} />
    </>}
  </WarehouseScreen>
}

export function PutawayScreen(props: ScreenProps & { initialFilter?: string }) {
  return <WarehouseTaskQueueScreen {...props} typeCode="putaway" />
}

export function PickScreen(props: ScreenProps & { initialFilter?: string }) {
  return <WarehouseTaskQueueScreen {...props} typeCode="pick" />
}

type ShipRow = { orderLineId: string; quantity: string; available: number; uomCode: string }

function hasPickedStock(order: WarehouseOrder) {
  return order.lines.some((line) => Number(line.pickedQuantity) > Number(line.dispatchedQuantity))
}

export function ShipScreen({ api, facility, initialOrderId, onBack }: ScreenProps & { initialOrderId?: string }) {
  const [orders, setOrders] = useState<WarehouseOrder[]>([])
  const [selected, setSelected] = useState<WarehouseOrder | null>(null)
  const [rows, setRows] = useState<ShipRow[]>([])
  const [vehicleReg, setVehicleReg] = useState("")
  const [containerNumber, setContainerNumber] = useState("")
  const [sealNumber, setSealNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const page = await api.listOrders({ facilityId: facility.id, typeCode: "outbound", openOnly: true, limit: 50, offset: 0 })
      setOrders(page.rows.filter(hasPickedStock))
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }, [api, facility.id])

  useEffect(() => { void load().then(() => { if (initialOrderId) void chooseOrder({ id: initialOrderId }) }) }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  async function chooseOrder(order: Pick<WarehouseOrder, "id">) {
    setLoading(true); setError(null); setSuccess(null)
    try {
      const detail = await api.getOrder(order.id)
      setSelected(detail)
      setVehicleReg(detail.vehicleReg ?? "")
      setContainerNumber(detail.containerNumber ?? "")
      setSealNumber(detail.sealNumber ?? "")
      setNotes("")
      setRows(detail.lines.map((line) => {
        const available = Math.max(0, Number(line.pickedQuantity) - Number(line.dispatchedQuantity))
        return { orderLineId: line.id, quantity: String(available), available, uomCode: line.uomCode }
      }).filter((row) => row.available > 0))
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }

  async function ship() {
    if (!selected) return
    const dispatchLines = rows.map((row) => ({ orderLineId: row.orderLineId, quantity: Number(row.quantity), available: row.available }))
    if (!dispatchLines.some((line) => line.quantity > 0) || dispatchLines.some((line) => !Number.isFinite(line.quantity) || line.quantity < 0 || line.quantity > line.available)) return setError(wt("checkShipQuantities"))
    setBusy(true); setError(null)
    try {
      await api.dispatchOrder(selected.id, {
        vehicleReg: vehicleReg.trim() || null,
        containerNumber: containerNumber.trim() || null,
        sealNumber: sealNumber.trim() || null,
        notes: notes.trim() || null,
        lines: dispatchLines.filter((line) => line.quantity > 0).map(({ orderLineId, quantity }) => ({ orderLineId, quantity })),
      })
      setSelected(null); setRows([]); setVehicleReg(""); setContainerNumber(""); setSealNumber(""); setNotes("")
      setSuccess(wt("shipmentComplete"))
      await load()
    } catch (actionError) {
      setError(message(actionError))
    } finally {
      setBusy(false)
    }
  }

  const lineById = useMemo(() => new Map(selected?.lines.map((line) => [line.id, line]) ?? []), [selected])
  return <WarehouseScreen title={wt("ship")} subtitle={selected ? wt("shipOrderDetail") : wt("shipQueueDetail")} onBack={selected ? () => { setSelected(null); setError(null) } : onBack} actions={<WarehouseButton compact label={wt("refresh")} tone="secondary" onPress={() => void load()} />}>
    {success ? <SuccessState message={success} /> : null}
    {loading ? <LoadingState /> : error && !selected ? <ErrorState message={error} onRetry={() => void load()} /> : !selected ? orders.length ? orders.map((order) => <DataCard key={order.id} title={order.orderNumber} meta={[order.customerName, order.customerReference].filter(Boolean).join(" · ")} status={wt("picked")} onPress={() => void chooseOrder(order)}>
      <MetricRow values={[{ label: wt("readyToShip"), value: String(order.lines.reduce((sum, line) => sum + Math.max(0, Number(line.pickedQuantity) - Number(line.dispatchedQuantity)), 0)) }, { label: wt("lines"), value: String(order.lines.filter((line) => Number(line.pickedQuantity) > Number(line.dispatchedQuantity)).length) }]} />
    </DataCard>) : <EmptyState message={wt("nothingToShip")} /> : <>
      <DataCard title={selected.orderNumber} meta={[selected.customerName, selected.customerReference].filter(Boolean).join(" · ")} status={wt("picked")} />
      {rows.map((row) => {
        const line = lineById.get(row.orderLineId)
        if (!line) return null
        return <DataCard key={row.orderLineId} title={line.sku} meta={line.description} status={`${row.available} ${row.uomCode} ${wt("picked").toLowerCase()}`}>
          <Field label={wt("quantityToShip")} value={row.quantity} onChangeText={(value) => setRows((current) => current.map((candidate) => candidate.orderLineId === row.orderLineId ? { ...candidate, quantity: value } : candidate))} keyboardType="decimal-pad" suffix={row.uomCode} />
        </DataCard>
      })}
      <Field label={wt("vehicleRegistration")} value={vehicleReg} onChangeText={setVehicleReg} autoCapitalize="characters" />
      <Field label={wt("containerNumber")} value={containerNumber} onChangeText={setContainerNumber} autoCapitalize="characters" />
      <Field label={wt("sealNumber")} value={sealNumber} onChangeText={setSealNumber} autoCapitalize="characters" />
      <Field label={wt("notes")} value={notes} onChangeText={setNotes} multiline style={styles.notes} />
      {error ? <WarningState message={error} /> : null}
      <WarehouseButton label={wt("confirmShipment")} busy={busy} onPress={() => void ship()} />
    </>}
  </WarehouseScreen>
}

const styles = StyleSheet.create({
  detail: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.sm, writingDirection: "ltr" },
  position: { color: colors.subtle, fontSize: type.label, fontWeight: "500" },
  helper: { color: colors.subtle, fontSize: type.meta, lineHeight: 18, marginBottom: spacing.lg, marginTop: -spacing.md },
  notes: { minHeight: 90, textAlignVertical: "top" },
  route: { color: colors.inkSoft, fontSize: type.body, fontWeight: "600", marginTop: spacing.md, writingDirection: "ltr" },
})
