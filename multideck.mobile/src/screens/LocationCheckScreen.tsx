import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { StyleSheet, Text } from "react-native"
import { Field } from "@/components/FormControls"
import { DataCard, ErrorState, LoadingState, MetricRow, ScanField, SuccessState, WarehouseButton, WarehouseScreen, WarningState } from "@/components/WarehouseUI"
import { colors, spacing, type } from "@/theme/tokens"
import type { WarehouseFacility, WarehouseInventoryBalance, WarehouseLocation, WarehouseMobileApi } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"

export function LocationCheckScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<WarehouseLocation | null>(null)
  const [stock, setStock] = useState<WarehouseInventoryBalance[]>([])
  const [notes, setNotes] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const retryLoad = useRef<() => void>(() => {})

  const loadLocations = useCallback(async () => {
    setLoading(true); setError(null); setSelected(null); setQuery("")
    retryLoad.current = () => { void loadLocations() }
    try { setLocations(await api.listLocations(facility.id)) } catch (loadError) { setError(loadError instanceof Error ? loadError.message : wt("serviceError")) } finally { setLoading(false) }
  }, [api, facility.id])

  useEffect(() => { void loadLocations() }, [loadLocations])

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return []
    return locations.filter((location) => location.code.toLowerCase().includes(term) || location.barcode?.toLowerCase().includes(term)).slice(0, 12)
  }, [locations, query])

  async function chooseLocation(location: WarehouseLocation) {
    setSelected(location); setQuery(location.code); setConfirming(false); setSuccess(null); setError(null); setActionError(null); setLoading(true)
    retryLoad.current = () => { void chooseLocation(location) }
    try {
      const balances = await api.listInventory({ facilityId: facility.id, search: location.code })
      setStock(balances.filter((balance) => balance.locationId === location.id))
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : wt("serviceError")) } finally { setLoading(false) }
  }

  async function reportEmpty() {
    if (!selected || !notes.trim()) return
    setBusy(true); setActionError(null)
    try {
      await api.reportLocationEmpty({ facilityId: facility.id, locationId: selected.id, notes: notes.trim() })
      setSuccess(wt("exceptionRaised")); setConfirming(false); setStock([])
    } catch (reportError) { setActionError(reportError instanceof Error ? reportError.message : wt("serviceError")) } finally { setBusy(false) }
  }

  return <WarehouseScreen title={wt("locationCheck")} subtitle={wt("locationCheckDetail")} onBack={onBack}>
    <ScanField value={query} onChangeText={(value) => { setQuery(value); setSelected(null); setConfirming(false); setActionError(null) }} onSubmit={() => { const exact = matches.find((row) => row.code.toLowerCase() === query.trim().toLowerCase() || row.barcode?.toLowerCase() === query.trim().toLowerCase()); if (exact) void chooseLocation(exact) }} autoFocus />
    {!selected ? matches.map((location) => <DataCard key={location.id} title={location.code} meta={[location.zoneName, location.aisle, location.bay, location.level].filter(Boolean).join(" · ")} status={location.statusName || location.statusCode} onPress={() => void chooseLocation(location)} />) : null}
    {loading ? <LoadingState /> : null}
    {error ? <ErrorState message={error} onRetry={retryLoad.current} /> : null}
    {success ? <SuccessState message={success} /> : null}
    {selected && !loading ? <>
      <DataCard title={selected.code} meta={`${selected.typeName || selected.typeCode} · ${selected.zoneName || "—"}`} status={selected.statusName || selected.statusCode}>
        <MetricRow values={[{ label: wt("contents"), value: String(stock.length) }, { label: wt("onHand"), value: String(stock.reduce((total, row) => total + Number(row.onHandQuantity), 0)) }, { label: wt("held"), value: String(stock.reduce((total, row) => total + Number(row.heldQuantity), 0)) }]} />
      </DataCard>
      {stock.map((row) => <DataCard key={row.id} title={row.sku} meta={`${row.itemDescription} · ${row.handlingUnitCode || "—"}`} status={row.inventoryStatusCode}><Text style={styles.detail}>{row.onHandQuantity} {row.uomCode} · {row.customerName || "—"}</Text></DataCard>)}
      {actionError ? <WarningState message={actionError} /> : null}
      {stock.length > 0 && !success ? confirming ? <>
        <WarningState message={wt("emptyWarning")} />
        <Field label={wt("investigationNotes")} value={notes} onChangeText={setNotes} multiline style={styles.notes} />
        <WarehouseButton label={wt("confirmEmpty")} tone="danger" disabled={!notes.trim()} busy={busy} onPress={() => void reportEmpty()} />
      </> : <WarehouseButton label={wt("physicallyEmpty")} tone="danger" onPress={() => setConfirming(true)} /> : null}
    </> : null}
  </WarehouseScreen>
}

const styles = StyleSheet.create({ detail: { color: colors.text, fontSize: type.meta, marginTop: spacing.md }, notes: { minHeight: 90, textAlignVertical: "top", writingDirection: "ltr" } })
