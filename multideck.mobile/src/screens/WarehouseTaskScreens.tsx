import { useCallback, useEffect, useMemo, useState } from "react"
import { StyleSheet, Text } from "react-native"
import { Field } from "@/components/FormControls"
import { DataCard, EmptyState, ErrorState, LoadingState, MetricRow, ScanField, SuccessState, WarehouseButton, WarehouseScreen, WarningState } from "@/components/WarehouseUI"
import { colors, spacing, type } from "@/theme/tokens"
import type { WarehouseFacility, WarehouseLocation, WarehouseMobileApi, WarehouseOrder, WarehouseTask } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"

function message(error: unknown) {
  return error instanceof Error ? error.message : wt("serviceError")
}

function sameCode(first: string | null | undefined, second: string) {
  return Boolean(first && first.trim().toLowerCase() === second.trim().toLowerCase())
}

function exactLocation(locations: WarehouseLocation[], code: string) {
  return locations.find((location) => sameCode(location.code, code) || sameCode(location.barcode, code))
}

function matchesTaskLocation(taskLocationId: string | null, taskLocationCode: string | null, locations: WarehouseLocation[], scan: string) {
  if (sameCode(taskLocationCode, scan)) return true
  const taskLocation = taskLocationId ? locations.find((location) => location.id === taskLocationId) : null
  return Boolean(taskLocation && (sameCode(taskLocation.code, scan) || sameCode(taskLocation.barcode, scan)))
}

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

export function ReceiveScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
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
      setLocations(locationRows.filter((location) => location.isActive && location.statusCode === "available" && ["dock", "staging"].includes(location.typeCode)))
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }, [api, facility.id])

  useEffect(() => { void load() }, [load])

  async function chooseOrder(order: WarehouseOrder) {
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
    const location = exactLocation(locations, locationCode)
    if (!location || location.facilityId !== facility.id) return setError(wt("receivingLocationNotFound"))
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

function WarehouseTaskQueueScreen({ api, facility, onBack, typeCode }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void; typeCode: "putaway" | "pick" }) {
  const [tasks, setTasks] = useState<WarehouseTask[]>([])
  const [selected, setSelected] = useState<WarehouseTask | null>(null)
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [sourceCode, setSourceCode] = useState("")
  const [itemCode, setItemCode] = useState("")
  const [targetCode, setTargetCode] = useState("")
  const [quantity, setQuantity] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [page, locationRows] = await Promise.all([
        api.listTasks({ facilityId: facility.id, type: typeCode, status: "open", limit: 50, offset: 0 }),
        api.listLocations(facility.id),
      ])
      setTasks(page.rows)
      setLocations(locationRows)
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }, [api, facility.id, typeCode])

  useEffect(() => { void load() }, [load])

  async function chooseTask(task: WarehouseTask) {
    setLoading(true); setError(null); setSuccess(null)
    try {
      const detail = await api.getTask(task.id)
      setSelected(detail)
      setSourceCode("")
      setItemCode("")
      setTargetCode(detail.targetLocationCode ?? "")
      setQuantity(String(remainingTaskQuantity(detail)))
      setNotes("")
    } catch (loadError) {
      setError(message(loadError))
    } finally {
      setLoading(false)
    }
  }

  async function confirm() {
    if (!selected) return
    if (!sourceCode.trim() || !matchesTaskLocation(selected.sourceLocationId, selected.sourceLocationCode, locations, sourceCode)) return setError(wt("sourceScanMismatch"))
    if (typeCode === "pick" && !itemCode.trim()) return setError(wt("scanItemFirst"))
    const numericQuantity = Number(quantity)
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0 || numericQuantity > remainingTaskQuantity(selected)) return setError(wt("checkTaskQuantity"))
    const target = typeCode === "putaway" ? exactLocation(locations, targetCode) : null
    if (typeCode === "putaway" && (!target || target.facilityId !== facility.id || !target.isActive || target.statusCode !== "available" || ["dock", "staging", "quarantine", "investigation"].includes(target.typeCode))) return setError(wt("destinationNotFound"))

    setBusy(true); setError(null)
    try {
      await api.confirmTask(selected.id, {
        quantity: numericQuantity,
        ...(target ? { targetLocationId: target.id, scannedTargetLocationCode: targetCode.trim() } : {}),
        scannedSourceLocationCode: sourceCode.trim(),
        ...(typeCode === "pick" ? { scannedItemCode: itemCode.trim() } : {}),
        notes: notes.trim() || null,
      })
      setSelected(null); setSourceCode(""); setItemCode(""); setTargetCode(""); setQuantity(""); setNotes("")
      setSuccess(typeCode === "putaway" ? wt("putawayComplete") : wt("pickComplete"))
      await load()
    } catch (actionError) {
      setError(message(actionError))
    } finally {
      setBusy(false)
    }
  }

  const title = typeCode === "putaway" ? wt("putAway") : wt("pick")
  const subtitle = typeCode === "putaway" ? wt("putawayQueueDetail") : wt("pickQueueDetail")
  return <WarehouseScreen title={title} subtitle={selected ? (typeCode === "putaway" ? wt("putawayTaskDetail") : wt("pickTaskDetail")) : subtitle} onBack={selected ? () => { setSelected(null); setError(null) } : onBack} actions={<WarehouseButton compact label={wt("refresh")} tone="secondary" onPress={() => void load()} />}>
    {success ? <SuccessState message={success} /> : null}
    {loading ? <LoadingState /> : error && !selected ? <ErrorState message={error} onRetry={() => void load()} /> : !selected ? tasks.length ? tasks.map((task) => <DataCard key={task.id} title={task.sku || task.orderNumber || title} meta={[task.orderNumber, task.customerName].filter(Boolean).join(" · ")} status={task.statusCode} onPress={() => void chooseTask(task)}>
      <Text style={styles.route}>{task.sourceLocationCode || "—"} {"→"} {typeCode === "putaway" ? task.targetLocationCode || wt("chooseDestination") : wt("dispatchStage")}</Text>
      <MetricRow values={[{ label: wt("remaining"), value: `${remainingTaskQuantity(task)} ${task.uomCode}` }, { label: wt("lotNumber"), value: task.lotNumber || "—" }]} />
    </DataCard>) : <EmptyState message={typeCode === "putaway" ? wt("nothingToPutAway") : wt("nothingToPick")} /> : <>
      <DataCard title={selected.sku || title} meta={[selected.description, selected.orderNumber, selected.customerName].filter(Boolean).join(" · ")} status={selected.statusCode}>
        <MetricRow values={[{ label: wt("quantity"), value: `${remainingTaskQuantity(selected)} ${selected.uomCode}` }, { label: wt("lotNumber"), value: selected.lotNumber || "—" }]} />
      </DataCard>
      <ScanField value={sourceCode} onChangeText={setSourceCode} placeholder={`${wt("scanSource")} · ${selected.sourceLocationCode || "—"}`} autoFocus />
      {typeCode === "pick" ? <ScanField value={itemCode} onChangeText={setItemCode} placeholder={`${wt("scanItem")} · ${selected.sku || "—"}`} /> : <ScanField value={targetCode} onChangeText={setTargetCode} placeholder={wt("scanDestination")} />}
      <Field label={typeCode === "putaway" ? wt("quantityToPutAway") : wt("quantityToPick")} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" suffix={selected.uomCode} />
      <Field label={wt("notes")} value={notes} onChangeText={setNotes} multiline style={styles.notes} />
      {error ? <WarningState message={error} /> : null}
      <WarehouseButton label={typeCode === "putaway" ? wt("confirmPutaway") : wt("confirmPick")} busy={busy} disabled={!sourceCode.trim() || (typeCode === "pick" ? !itemCode.trim() : !targetCode.trim())} onPress={() => void confirm()} />
    </>}
  </WarehouseScreen>
}

export function PutawayScreen(props: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  return <WarehouseTaskQueueScreen {...props} typeCode="putaway" />
}

export function PickScreen(props: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  return <WarehouseTaskQueueScreen {...props} typeCode="pick" />
}

type ShipRow = { orderLineId: string; quantity: string; available: number; uomCode: string }

function hasPickedStock(order: WarehouseOrder) {
  return order.lines.some((line) => Number(line.pickedQuantity) > Number(line.dispatchedQuantity))
}

export function ShipScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
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

  useEffect(() => { void load() }, [load])

  async function chooseOrder(order: WarehouseOrder) {
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
  helper: { color: colors.subtle, fontSize: type.meta, lineHeight: 18, marginBottom: spacing.lg, marginTop: -spacing.md },
  notes: { minHeight: 90, textAlignVertical: "top" },
  route: { color: colors.inkSoft, fontSize: type.body, fontWeight: "600", marginTop: spacing.md, writingDirection: "ltr" },
})
