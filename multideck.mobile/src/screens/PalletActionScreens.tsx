import { useEffect, useMemo, useState } from "react"
import { StyleSheet, Text } from "react-native"
import { Field } from "@/components/FormControls"
import { DataCard, ErrorState, LoadingState, ScanField, SuccessState, WarehouseButton, WarehouseScreen } from "@/components/WarehouseUI"
import { colors, spacing, type } from "@/theme/tokens"
import type { WarehouseHandlingUnit, WarehouseHandlingUnitReference, WarehouseMobileApi } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"

function exactUnit(units: WarehouseHandlingUnit[], code: string) {
  const value = code.trim().toLowerCase()
  return units.find((unit) => unit.code.toLowerCase() === value || unit.sscc?.toLowerCase() === value)
}

export function PalletMoveScreen({ api, onBack }: { api: WarehouseMobileApi; onBack: () => void }) {
  const [units, setUnits] = useState<WarehouseHandlingUnit[]>([])
  const [reference, setReference] = useState<WarehouseHandlingUnitReference | null>(null)
  const [palletCode, setPalletCode] = useState("")
  const [sourceCode, setSourceCode] = useState("")
  const [destinationCode, setDestinationCode] = useState("")
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [reviewed, setReviewed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => { void Promise.all([api.listHandlingUnits(), api.getHandlingUnitReference()]).then(([nextUnits, nextReference]) => { setUnits(nextUnits); setReference(nextReference) }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : wt("serviceError"))).finally(() => setLoading(false)) }, [api])

  const pallet = useMemo(() => exactUnit(units, palletCode), [units, palletCode])
  const source = useMemo(() => reference?.locations.find((location) => location.code.toLowerCase() === sourceCode.trim().toLowerCase()), [reference, sourceCode])
  const destination = useMemo(() => reference?.locations.find((location) => location.code.toLowerCase() === destinationCode.trim().toLowerCase()), [reference, destinationCode])
  const mismatch = Boolean(pallet && source && pallet.locationId !== source.id)

  function review() {
    setError(null); setSuccess(null)
    if (!pallet) return setError(wt("palletNotFound"))
    if (!source) return setError(wt("sourceLocationNotFound"))
    if (!destination || destination.facilityId !== pallet.facilityId) return setError(wt("destinationNotFound"))
    setReviewed(true)
  }

  async function move() {
    if (!pallet || !source || !destination || (mismatch && !reason.trim())) return
    setBusy(true); setError(null)
    try {
      await api.moveHandlingUnit({ facilityId: pallet.facilityId, handlingUnitId: pallet.id, targetLocationId: destination.id, actualSourceLocationId: source.id, overrideReason: mismatch ? reason.trim() : null, notes: notes.trim() || null })
      setSuccess(wt("moveComplete")); setReviewed(false)
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : wt("serviceError")) } finally { setBusy(false) }
  }

  return <WarehouseScreen title={wt("moveOverride")} subtitle={wt("moveOverrideDetail")} onBack={onBack}>
    {loading ? <LoadingState /> : <>
      <ScanField value={palletCode} onChangeText={(value) => { setPalletCode(value); setReviewed(false) }} placeholder={wt("palletCode")} autoFocus />
      <ScanField value={sourceCode} onChangeText={(value) => { setSourceCode(value); setReviewed(false) }} placeholder={wt("scannedSource")} />
      <ScanField value={destinationCode} onChangeText={(value) => { setDestinationCode(value); setReviewed(false) }} placeholder={wt("destination")} />
      {!reviewed ? <WarehouseButton label={wt("reviewMove")} onPress={review} /> : <>
        <DataCard title={pallet?.code || "—"} meta={`${pallet?.locationCode || "—"} → ${destination?.code || "—"}`} status={pallet?.lifecycleStatusCode}>
          <Text style={styles.detail}>{pallet?.customerName || "—"} · {pallet?.contents.length || 0} {wt("contents").toLowerCase()}</Text>
        </DataCard>
        {mismatch ? <><ErrorState message={wt("overrideRequired")} /><Field label={wt("overrideReason")} value={reason} onChangeText={setReason} /></> : null}
        <Field label={wt("investigationNotes")} value={notes} onChangeText={setNotes} />
        <WarehouseButton label={wt("confirmMove")} disabled={mismatch && !reason.trim()} busy={busy} onPress={() => void move()} />
      </>}
      {error ? <ErrorState message={error} /> : null}{success ? <SuccessState message={success} /> : null}
    </>}
  </WarehouseScreen>
}

export function ConsolidationScreen({ api, onBack }: { api: WarehouseMobileApi; onBack: () => void }) {
  const [units, setUnits] = useState<WarehouseHandlingUnit[]>([])
  const [targetCode, setTargetCode] = useState("")
  const [sourceCodes, setSourceCodes] = useState("")
  const [notes, setNotes] = useState("")
  const [reviewed, setReviewed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  useEffect(() => { void api.listHandlingUnits().then(setUnits).catch((loadError) => setError(loadError instanceof Error ? loadError.message : wt("serviceError"))).finally(() => setLoading(false)) }, [api])
  const target = useMemo(() => exactUnit(units, targetCode), [units, targetCode])
  const sourceValues = sourceCodes.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean)
  const sources = sourceValues.map((code) => exactUnit(units, code)).filter((unit): unit is WarehouseHandlingUnit => Boolean(unit))

  function review() {
    setError(null); setSuccess(null)
    if (!target) return setError(wt("palletNotFound"))
    if (!sourceValues.length || sources.length !== sourceValues.length) return setError(wt("sourcePalletsNotFound"))
    if (sources.some((source) => source.id === target.id)) return setError(wt("targetSourceConflict"))
    if (sources.some((source) => source.facilityId !== target.facilityId || source.customerOrgId !== target.customerOrgId)) return setError(wt("palletScopeMismatch"))
    setReviewed(true)
  }

  async function consolidate() {
    if (!target || !sources.length) return
    setBusy(true); setError(null)
    try {
      await api.consolidateHandlingUnits({ facilityId: target.facilityId, targetHandlingUnitId: target.id, sourceHandlingUnitIds: sources.map((source) => source.id), notes: notes.trim() || null })
      setSuccess(wt("consolidationComplete")); setReviewed(false)
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : wt("serviceError")) } finally { setBusy(false) }
  }

  return <WarehouseScreen title={wt("consolidation")} subtitle={wt("consolidationDetail")} onBack={onBack}>
    {loading ? <LoadingState /> : <>
      <ScanField value={targetCode} onChangeText={(value) => { setTargetCode(value); setReviewed(false) }} placeholder={wt("targetPallet")} autoFocus />
      <ScanField value={sourceCodes} onChangeText={(value) => { setSourceCodes(value); setReviewed(false) }} placeholder={wt("sourcePalletsHint")} multiline />
      {!reviewed ? <WarehouseButton label={wt("reviewConsolidation")} onPress={review} /> : <>
        <ErrorState message={wt("consolidationWarning")} />
        <DataCard title={target?.code || "—"} meta={`${wt("targetPallet")} · ${target?.locationCode || "—"}`} status={target?.lifecycleStatusCode} />
        {sources.map((source) => <DataCard key={source.id} title={source.code} meta={`${wt("sourcePallets")} · ${source.locationCode || "—"}`} status={source.lifecycleStatusCode} />)}
        <Field label={wt("investigationNotes")} value={notes} onChangeText={setNotes} />
        <WarehouseButton label={wt("confirmConsolidation")} tone="danger" busy={busy} onPress={() => void consolidate()} />
      </>}
      {error ? <ErrorState message={error} /> : null}{success ? <SuccessState message={success} /> : null}
    </>}
  </WarehouseScreen>
}

const styles = StyleSheet.create({ detail: { color: colors.text, fontSize: type.meta, marginTop: spacing.md } })
