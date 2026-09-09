import { useCallback, useEffect, useState } from "react"
import { Text, StyleSheet } from "react-native"
import { Field } from "@/components/FormControls"
import { DataCard, EmptyState, ErrorState, LoadingState, MetricRow, ScanField, SuccessState, WarehouseButton, WarehouseScreen, WarningState } from "@/components/WarehouseUI"
import { colors, spacing, type } from "@/theme/tokens"
import type { WarehouseFacility, WarehouseHandlingUnit, WarehouseInventoryBalance, WarehouseInventoryException, WarehouseItem, WarehouseMobileApi } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"

function message(error: unknown) {
  return error instanceof Error ? error.message : wt("serviceError")
}

export function StockEnquiryScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<WarehouseInventoryBalance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try { setRows(await api.listInventory({ facilityId: facility.id, search: query.trim() })) } catch (loadError) { setError(message(loadError)) } finally { setLoading(false) }
  }, [api, facility.id, query])

  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return <WarehouseScreen title={wt("stockEnquiry")} subtitle={wt("stockEnquiryDetail")} onBack={onBack}>
    <ScanField value={query} onChangeText={setQuery} onSubmit={() => void load()} autoFocus />
    <WarehouseButton label={wt("search")} onPress={() => void load()} />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : rows.length ? rows.map((row) => <DataCard key={row.id} title={row.sku} meta={`${row.itemDescription} · ${row.locationCode || "—"}`} status={row.inventoryStatusCode}>
      <Text style={styles.detail}>{row.customerName || "—"}{row.handlingUnitCode ? ` · ${row.handlingUnitCode}` : ""}</Text>
      <MetricRow values={[{ label: wt("onHand"), value: `${row.onHandQuantity} ${row.uomCode}` }, { label: wt("available"), value: String(row.availableQuantity) }, { label: wt("held"), value: String(row.heldQuantity) }]} />
    </DataCard>) : <EmptyState />}
  </WarehouseScreen>
}

export function StockItemsScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<WarehouseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); setError(null); try { setRows(await api.listItems({ facilityId: facility.id, search: query.trim() })) } catch (loadError) { setError(message(loadError)) } finally { setLoading(false) } }, [api, facility.id, query])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <WarehouseScreen title={wt("stockItems")} subtitle={wt("stockItemsDetail")} onBack={onBack}>
    <ScanField value={query} onChangeText={setQuery} onSubmit={() => void load()} autoFocus />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : rows.length ? rows.map((row) => <DataCard key={row.id} title={row.sku} meta={row.description} status={row.baseUomCode}>
      <Text style={styles.detail}>{row.customerOrgName || "—"} · {[row.requiresLot && "lot", row.requiresSerial && "serial", row.requiresExpiry && "expiry", row.isDangerousGoods && "DG", row.isBondedEligible && "bonded"].filter(Boolean).join(" · ") || "standard"}</Text>
    </DataCard>) : <EmptyState />}
  </WarehouseScreen>
}

export function PalletsScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<WarehouseHandlingUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); setError(null); try { setRows(await api.listHandlingUnits({ facilityId: facility.id, search: query.trim() })) } catch (loadError) { setError(message(loadError)) } finally { setLoading(false) } }, [api, facility.id, query])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <WarehouseScreen title={wt("pallets")} subtitle={wt("palletsDetail")} onBack={onBack}>
    <ScanField value={query} onChangeText={setQuery} onSubmit={() => void load()} autoFocus />
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : rows.length ? rows.map((row) => <DataCard key={row.id} title={row.code} meta={`${row.typeName} · ${row.locationCode || "—"}`} status={row.lifecycleStatusCode}>
      <Text style={styles.detail}>{row.customerName || "—"}</Text>
      <MetricRow values={[{ label: wt("contents"), value: String(row.contents.length) }, { label: wt("onHand"), value: String(row.contents.reduce((sum, content) => sum + Number(content.quantity), 0)) }, { label: wt("status"), value: row.inventoryStatusCode }]} />
    </DataCard>) : <EmptyState />}
  </WarehouseScreen>
}

export function ExceptionsScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  const [query, setQuery] = useState("")
  const [rows, setRows] = useState<WarehouseInventoryException[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<WarehouseInventoryException | null>(null)
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const load = useCallback(async () => { setLoading(true); setError(null); try { setRows(await api.listExceptions({ facilityId: facility.id, search: query.trim() })) } catch (loadError) { setError(message(loadError)) } finally { setLoading(false) } }, [api, facility.id, query])
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  async function resolveDataError() {
    if (!selected || !notes.trim()) return
    setBusy(true); setError(null)
    try {
      await api.resolveLocationDataError({ facilityId: facility.id, exceptionId: selected.id, notes: notes.trim() })
      setSuccess(wt("exceptionResolved")); setSelected(null); setNotes(""); await load()
    } catch (actionError) { setError(message(actionError)) } finally { setBusy(false) }
  }

  return <WarehouseScreen title={wt("exceptions")} subtitle={wt("exceptionsDetail")} onBack={onBack} actions={<WarehouseButton compact label={wt("refresh")} tone="secondary" onPress={() => void load()} />}>
    <ScanField value={query} onChangeText={setQuery} onSubmit={() => void load()} />
    {success ? <SuccessState message={success} /> : null}
    {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : rows.length ? rows.map((row) => <DataCard key={row.id} title={row.title} meta={`${row.expectedLocationCode || "—"} · ${new Date(row.raisedAt).toLocaleString()}`} status={`${row.severityCode} · ${row.statusCode}`} onPress={row.typeCode === "location_empty" ? () => { setSelected(row); setSuccess(null) } : undefined}>
      {row.description ? <Text style={styles.detail}>{row.description}</Text> : null}
    </DataCard>) : <EmptyState />}
    {selected ? <>
      <WarningState message={wt("resolveWarning")} />
      <DataCard title={wt("stockFoundExpected")} meta={selected.expectedLocationCode} status={selected.statusCode} />
      <Field label={wt("resolutionNotes")} value={notes} onChangeText={setNotes} multiline style={styles.notes} />
      <WarehouseButton label={wt("confirmResolution")} disabled={!notes.trim()} busy={busy} onPress={() => void resolveDataError()} />
    </> : null}
  </WarehouseScreen>
}

export function HoldingFeesScreen({ onBack }: { onBack: () => void }) {
  return <WarehouseScreen title={wt("holdingFees")} subtitle={wt("holdingFeesDetail")} onBack={onBack}>
    <DataCard title={wt("feeModelTitle")} status={wt("designDecision")}><Text style={styles.detail}>{wt("feeModelBody")}</Text></DataCard>
    <DataCard title={wt("proposedParameters")}><Text style={styles.detail}>{wt("feeParameters")}</Text></DataCard>
  </WarehouseScreen>
}

const styles = StyleSheet.create({ detail: { color: colors.text, fontSize: type.meta, lineHeight: 19, marginTop: spacing.md }, notes: { minHeight: 90, textAlignVertical: "top" } })
