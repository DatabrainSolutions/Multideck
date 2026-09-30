import { useState } from "react"
import { StyleSheet, Text } from "react-native"
import { Field } from "@/components/FormControls"
import { DataCard, ScanField, SuccessState, WarehouseButton, WarehouseScreen, WarningState } from "@/components/WarehouseUI"
import { colors, spacing, type } from "@/theme/tokens"
import type { WarehouseFacility, WarehouseHandlingUnit, WarehouseLocation, WarehouseMobileApi } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"

function message(error: unknown) {
  return error instanceof Error ? error.message : wt("serviceError")
}

export function PalletMoveScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  const [palletCode, setPalletCode] = useState("")
  const [sourceCode, setSourceCode] = useState("")
  const [destinationCode, setDestinationCode] = useState("")
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [review, setReview] = useState<{ pallet: WarehouseHandlingUnit; source: WarehouseLocation; destination: WarehouseLocation } | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const mismatch = Boolean(review && review.pallet.locationId !== review.source.id)

  function edit(setter: (value: string) => void) {
    return (value: string) => { setter(value); setReview(null); setSuccess(null) }
  }

  async function check() {
    setError(null); setSuccess(null); setChecking(true)
    try {
      const [pallet, source, destination] = await Promise.all([
        api.findHandlingUnit(facility.id, palletCode),
        api.findLocation(facility.id, sourceCode),
        api.findLocation(facility.id, destinationCode),
      ])
      if (!pallet) return setError(wt("palletNotFound"))
      if (!source) return setError(wt("sourceLocationNotFound"))
      if (!destination || destination.facilityId !== pallet.facilityId) return setError(wt("destinationNotFound"))
      setReview({ pallet, source, destination })
    } catch (lookupError) { setError(message(lookupError)) } finally { setChecking(false) }
  }

  async function move() {
    if (!review || (mismatch && !reason.trim())) return
    setBusy(true); setError(null)
    try {
      await api.moveHandlingUnit({ facilityId: facility.id, handlingUnitId: review.pallet.id, targetLocationId: review.destination.id, actualSourceLocationId: review.source.id, overrideReason: mismatch ? reason.trim() : null, notes: notes.trim() || null })
      setSuccess(wt("moveComplete")); setReview(null); setPalletCode(""); setSourceCode(""); setDestinationCode(""); setReason(""); setNotes("")
    } catch (actionError) { setError(message(actionError)) } finally { setBusy(false) }
  }

  return <WarehouseScreen title={wt("moveOverride")} subtitle={wt("moveOverrideDetail")} onBack={onBack}>
    {success ? <SuccessState message={success} /> : null}
    <ScanField value={palletCode} onChangeText={edit(setPalletCode)} placeholder={wt("palletCode")} autoFocus />
    <ScanField value={sourceCode} onChangeText={edit(setSourceCode)} placeholder={wt("scannedSource")} />
    <ScanField value={destinationCode} onChangeText={edit(setDestinationCode)} placeholder={wt("destination")} />
    {!review ? <WarehouseButton label={wt("reviewMove")} busy={checking} disabled={!palletCode.trim() || !sourceCode.trim() || !destinationCode.trim()} onPress={() => void check()} /> : <>
      <DataCard title={review.pallet.code} meta={`${review.pallet.locationCode || "—"} → ${review.destination.code}`} status={review.pallet.lifecycleStatusCode}>
        <Text style={styles.detail}>{review.pallet.customerName || "—"} · {review.pallet.contents.length} {wt("contents").toLowerCase()}</Text>
      </DataCard>
      {mismatch ? <><WarningState message={wt("overrideRequired")} /><Field label={wt("overrideReason")} value={reason} onChangeText={setReason} /></> : null}
      <Field label={wt("investigationNotes")} value={notes} onChangeText={setNotes} />
      <WarehouseButton label={wt("confirmMove")} disabled={mismatch && !reason.trim()} busy={busy} onPress={() => void move()} />
    </>}
    {error ? <WarningState message={error} /> : null}
  </WarehouseScreen>
}

export function ConsolidationScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  const [targetCode, setTargetCode] = useState("")
  const [sourceCodes, setSourceCodes] = useState("")
  const [notes, setNotes] = useState("")
  const [review, setReview] = useState<{ target: WarehouseHandlingUnit; sources: WarehouseHandlingUnit[] } | null>(null)
  const [checking, setChecking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const sourceValues = sourceCodes.split(/[\n,]+/).map((value) => value.trim()).filter(Boolean)

  async function check() {
    setError(null); setSuccess(null); setChecking(true)
    try {
      const [target, ...sources] = await Promise.all([api.findHandlingUnit(facility.id, targetCode), ...sourceValues.map((code) => api.findHandlingUnit(facility.id, code))])
      if (!target) return setError(wt("palletNotFound"))
      const found = sources.filter((unit): unit is WarehouseHandlingUnit => Boolean(unit))
      if (!sourceValues.length || found.length !== sourceValues.length) return setError(wt("sourcePalletsNotFound"))
      if (found.some((source) => source.id === target.id)) return setError(wt("targetSourceConflict"))
      if (found.some((source) => source.facilityId !== target.facilityId || source.customerOrgId !== target.customerOrgId)) return setError(wt("palletScopeMismatch"))
      setReview({ target, sources: found.filter((unit, index) => found.findIndex((candidate) => candidate.id === unit.id) === index) })
    } catch (lookupError) { setError(message(lookupError)) } finally { setChecking(false) }
  }

  async function consolidate() {
    if (!review) return
    setBusy(true); setError(null)
    try {
      await api.consolidateHandlingUnits({ facilityId: facility.id, targetHandlingUnitId: review.target.id, sourceHandlingUnitIds: review.sources.map((source) => source.id), notes: notes.trim() || null })
      setSuccess(wt("consolidationComplete")); setReview(null); setTargetCode(""); setSourceCodes(""); setNotes("")
    } catch (actionError) { setError(message(actionError)) } finally { setBusy(false) }
  }

  return <WarehouseScreen title={wt("consolidation")} subtitle={wt("consolidationDetail")} onBack={onBack}>
    {success ? <SuccessState message={success} /> : null}
    <ScanField value={targetCode} onChangeText={(value) => { setTargetCode(value); setReview(null) }} placeholder={wt("targetPallet")} autoFocus />
    <ScanField value={sourceCodes} onChangeText={(value) => { setSourceCodes(value); setReview(null) }} placeholder={wt("sourcePalletsHint")} multiline />
    {!review ? <WarehouseButton label={wt("reviewConsolidation")} busy={checking} disabled={!targetCode.trim() || !sourceValues.length} onPress={() => void check()} /> : <>
      <WarningState message={wt("consolidationWarning")} />
      <DataCard title={review.target.code} meta={`${wt("targetPallet")} · ${review.target.locationCode || "—"}`} status={review.target.lifecycleStatusCode} />
      {review.sources.map((source) => <DataCard key={source.id} title={source.code} meta={`${wt("sourcePallets")} · ${source.locationCode || "—"}`} status={source.lifecycleStatusCode} />)}
      <Field label={wt("investigationNotes")} value={notes} onChangeText={setNotes} />
      <WarehouseButton label={wt("confirmConsolidation")} tone="danger" busy={busy} onPress={() => void consolidate()} />
    </>}
    {error ? <WarningState message={error} /> : null}
  </WarehouseScreen>
}

const styles = StyleSheet.create({ detail: { color: colors.text, fontSize: type.meta, marginTop: spacing.md } })
