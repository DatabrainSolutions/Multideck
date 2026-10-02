import { useCallback, useEffect, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { Field } from "@/components/FormControls"
import { DataCard, EmptyState, ErrorState, LoadingState, MetricRow, ScanField, SegmentedChoice, SuccessState, WarehouseButton, WarehouseScreen, WarningState } from "@/components/WarehouseUI"
import { formatQuantity, message, type ScreenProps } from "@/screens/screenSupport"
import { StockLineActions } from "@/screens/StockLineActions"
import { colors, spacing, type } from "@/theme/tokens"
import type { WarehouseHandlingUnit, WarehouseInventoryBalance, WarehouseInventoryException, WarehouseItem, WarehouseLocation } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"
import { scanFeedback, useScanStep } from "@/warehouse/scanner"

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
}

export function StockEnquiryScreen({ api, facility, initialSearch, onBack }: ScreenProps & { initialSearch?: string }) {
  const [query, setQuery] = useState(initialSearch ?? "")
  const [rows, setRows] = useState<WarehouseInventoryBalance[]>([])
  const [selected, setSelected] = useState<WarehouseInventoryBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const load = useCallback(async (term = query) => {
    setLoading(true); setError(null)
    try { setRows(await api.listInventory({ facilityId: facility.id, search: term.trim() })) } catch (loadError) { setError(message(loadError)) } finally { setLoading(false) }
  }, [api, facility.id, query])

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (selected) {
    return <WarehouseScreen title={wt("stockLine")} onBack={() => setSelected(null)}>
      <StockLineActions api={api} facility={facility} balance={selected} onClose={() => setSelected(null)} onDone={(summary) => { setSelected(null); setSuccess(summary); void load() }} />
    </WarehouseScreen>
  }

  return <WarehouseScreen title={wt("stockEnquiry")} subtitle={wt("stockEnquiryDetail")} onBack={onBack} onRefresh={() => void load()} refreshing={loading && rows.length > 0}>
    {success ? <SuccessState message={success} /> : null}
    <ScanField label={wt("stockEnquiryScan")} value={query} onChangeText={(value) => { setQuery(value); setSuccess(null) }} onSubmit={(text) => void load(text)} autoFocus />
    <WarehouseButton label={wt("search")} tone="secondary" onPress={() => void load()} />
    {loading && !rows.length ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : rows.length ? <>
      <Text style={styles.hint}>{wt("tapStockLine")}</Text>
      {rows.map((row) => <DataCard key={row.id} title={row.sku} meta={[row.itemDescription, row.locationCode].filter(Boolean).join(" · ")} status={row.inventoryStatusName || row.inventoryStatusCode} onPress={() => { setSuccess(null); setSelected(row) }}>
        <Text style={styles.detail}>{[row.customerName, row.handlingUnitCode ? `${wt("pallet")} ${row.handlingUnitCode}` : wt("looseStock"), row.lotNumber ? `${wt("lotNumber")} ${row.lotNumber}` : null].filter(Boolean).join(" · ")}</Text>
        <MetricRow values={[{ label: wt("onHand"), value: `${formatQuantity(Number(row.onHandQuantity))} ${row.uomCode}` }, { label: wt("available"), value: formatQuantity(Number(row.availableQuantity)) }, { label: wt("held"), value: formatQuantity(Number(row.heldQuantity)) }]} />
      </DataCard>)}
    </> : <EmptyState />}
  </WarehouseScreen>
}

export function StockItemsScreen({ api, facility, onBack }: ScreenProps) {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<WarehouseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (term = query) => { setLoading(true); setError(null); try { setRows(await api.listItems({ facilityId: facility.id, search: term.trim() })) } catch (loadError) { setError(message(loadError)) } finally { setLoading(false) } }, [api, facility.id, query])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <WarehouseScreen title={wt("stockItems")} subtitle={wt("stockItemsDetail")} onBack={onBack} onRefresh={() => void load()} refreshing={loading && rows.length > 0}>
    <ScanField value={query} onChangeText={setQuery} onSubmit={(text) => void load(text)} autoFocus />
    {loading && !rows.length ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : rows.length ? rows.map((row) => <DataCard key={row.id} title={row.sku} meta={row.description} status={row.baseUomCode}>
      <Text style={styles.detail}>{[row.customerOrgName, ...[row.requiresLot && wt("needsLot"), row.requiresSerial && wt("needsSerial"), row.requiresExpiry && wt("needsExpiry"), row.isDangerousGoods && wt("dangerousGoods"), row.isBondedEligible && wt("bondedEligible")].filter(Boolean)].filter(Boolean).join(" · ") || wt("standardHandling")}</Text>
    </DataCard>) : <EmptyState />}
  </WarehouseScreen>
}

export function PalletsScreen({ api, facility, initialSearch, onBack, onMovePallet }: ScreenProps & { initialSearch?: string; onMovePallet: (palletCode: string) => void }) {
  const [query, setQuery] = useState(initialSearch ?? "")
  const [rows, setRows] = useState<WarehouseHandlingUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async (term = query) => { setLoading(true); setError(null); try { setRows(await api.listHandlingUnits({ facilityId: facility.id, search: term.trim() })) } catch (loadError) { setError(message(loadError)) } finally { setLoading(false) } }, [api, facility.id, query])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <WarehouseScreen title={wt("pallets")} subtitle={wt("palletsDetail")} onBack={onBack} onRefresh={() => void load()} refreshing={loading && rows.length > 0}>
    <ScanField value={query} onChangeText={setQuery} onSubmit={(text) => void load(text)} placeholder={wt("scanPalletPlaceholder")} autoFocus />
    {loading && !rows.length ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : rows.length ? rows.map((row) => <DataCard key={row.id} title={row.code} meta={[row.typeName, row.locationCode ? `${wt("at")} ${row.locationCode}` : wt("noLocation"), row.customerName].filter(Boolean).join(" · ")} status={row.inventoryStatusName || row.inventoryStatusCode}>
      {row.contents.length ? row.contents.map((content) => <Text key={content.balanceId} style={styles.contentLine}>{`${content.sku} · ${formatQuantity(Number(content.quantity))} ${content.uomCode}${content.lotNumber ? ` · ${wt("lotNumber")} ${content.lotNumber}` : ""}`}</Text>) : <Text style={styles.detail}>{wt("emptyPallet")}</Text>}
      <View style={styles.cardAction}><WarehouseButton compact tone="secondary" label={wt("movePallet")} onPress={() => onMovePallet(row.code)} /></View>
    </DataCard>) : <EmptyState />}
  </WarehouseScreen>
}

type Resolution = "data_error" | "found" | "request_loss" | "approve_loss"

export function ExceptionsScreen({ api, facility, onBack }: ScreenProps) {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<WarehouseInventoryException[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<WarehouseInventoryException | null>(null)
  const [resolution, setResolution] = useState<Resolution>("data_error")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const load = useCallback(async (term = query) => { setLoading(true); setError(null); try { setRows(await api.listExceptions({ facilityId: facility.id, search: term.trim() })) } catch (loadError) { setError(message(loadError)) } finally { setLoading(false) } }, [api, facility.id, query])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const foundAt = useScanStep<WarehouseLocation>(async (scan) => {
    const location = await api.findLocation(facility.id, scan)
    if (!location || !location.isActive) return { ok: false, message: wt("locationNotFound") }
    if (location.id === selected?.expectedLocationId) return { ok: false, message: wt("useFoundHere") }
    return { ok: true, value: location, note: `${location.code} · ${location.typeName || location.typeCode}` }
  })

  function open(row: WarehouseInventoryException) {
    setSelected(row); setSuccess(null); setError(null); setNotes(""); foundAt.reset()
    setResolution(row.statusCode === "pending_approval" ? "approve_loss" : "data_error")
  }

  async function resolve() {
    if (!selected || !notes.trim()) return
    if (resolution === "found" && !foundAt.result) return setError(wt("scanWhereFound"))
    setBusy(true); setError(null)
    try {
      await api.resolveLocationException({ facilityId: facility.id, exceptionId: selected.id, resolution, actualLocationId: resolution === "found" ? foundAt.result?.id ?? null : null, notes: notes.trim() })
      scanFeedback("ok")
      setSuccess(resolution === "request_loss" ? wt("writeOffRequested") : resolution === "approve_loss" ? wt("writeOffApproved") : wt("exceptionResolved"))
      setSelected(null); await load()
    } catch (actionError) { scanFeedback("error"); setError(message(actionError)) } finally { setBusy(false) }
  }

  if (selected) {
    const pending = selected.statusCode === "pending_approval"
    return <WarehouseScreen title={wt("exception")} onBack={() => setSelected(null)}>
      <DataCard title={selected.title} meta={[selected.expectedLocationCode ? `${wt("expected")} ${selected.expectedLocationCode}` : null, formatDateTime(selected.raisedAt)].filter(Boolean).join(" · ")} status={pending ? wt("awaitingApproval") : wt("open")}>
        {selected.description ? <Text style={styles.detail}>{selected.description}</Text> : null}
      </DataCard>
      {pending ? <WarningState message={wt("approveWriteOffWarning")} /> : <>
        <SegmentedChoice label={wt("whatDidYouFind")} value={resolution} onChange={(next) => { setResolution(next); setError(null) }} options={[{ value: "data_error", label: wt("foundHere") }, { value: "found", label: wt("foundElsewhere") }, { value: "request_loss", label: wt("notFound") }]} />
        <Text style={styles.detail}>{resolution === "data_error" ? wt("foundHereDetail") : resolution === "found" ? wt("foundElsewhereDetail") : wt("notFoundDetail")}</Text>
        {resolution === "found" ? <ScanField ref={foundAt.ref} label={wt("whereFound")} value={foundAt.value} onChangeText={foundAt.change} onSubmit={async (text) => { if (await foundAt.submit(text)) foundAt.ref.current?.blur() }} status={foundAt.status} message={foundAt.message} placeholder={wt("scanLocationPlaceholder")} autoFocus /> : null}
      </>}
      <Field label={wt("resolutionNotes")} value={notes} onChangeText={setNotes} multiline style={styles.notes} placeholder={wt("resolutionNotesPlaceholder")} />
      {error ? <WarningState message={error} /> : null}
      <WarehouseButton label={pending ? wt("approveWriteOff") : resolution === "request_loss" ? wt("requestWriteOff") : wt("confirmResolution")} tone={pending || resolution === "request_loss" ? "danger" : "primary"} disabled={!notes.trim() || (resolution === "found" && !foundAt.result)} busy={busy} onPress={() => void resolve()} />
    </WarehouseScreen>
  }

  return <WarehouseScreen title={wt("exceptions")} subtitle={wt("exceptionsDetail")} onBack={onBack} onRefresh={() => void load()} refreshing={loading && rows.length > 0}>
    {success ? <SuccessState message={success} /> : null}
    <ScanField value={query} onChangeText={setQuery} onSubmit={(text) => void load(text)} />
    {loading && !rows.length ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : rows.length ? rows.map((row) => {
      const actionable = row.typeCode === "location_empty"
      return <DataCard key={row.id} title={row.title} meta={[row.expectedLocationCode, formatDateTime(row.raisedAt)].filter(Boolean).join(" · ")} status={row.statusCode === "pending_approval" ? wt("awaitingApproval") : row.severityCode} onPress={actionable ? () => open(row) : undefined}>
        {row.description ? <Text style={styles.detail}>{row.description}</Text> : null}
        {!actionable ? <Text style={styles.hint}>{wt("resolveOnWeb")}</Text> : null}
      </DataCard>
    }) : <EmptyState message={query.trim() ? wt("noResults") : wt("noExceptions")} />}
  </WarehouseScreen>
}

const styles = StyleSheet.create({
  detail: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.sm, writingDirection: "ltr" },
  contentLine: { color: colors.inkSoft, fontSize: type.label, lineHeight: 20, marginTop: spacing.xs, writingDirection: "ltr" },
  hint: { color: colors.subtle, fontSize: type.meta, marginBottom: spacing.sm, marginTop: spacing.sm, writingDirection: "ltr" },
  notes: { minHeight: 90, textAlignVertical: "top" },
  cardAction: { alignItems: "flex-start", marginTop: spacing.md },
})
