import { useState } from "react"
import { StyleSheet, View } from "react-native"
import { Field } from "@/components/FormControls"
import { DataCard, ScanField, SuccessState, WarehouseButton, WarehouseScreen, WarningState } from "@/components/WarehouseUI"
import { spacing } from "@/theme/tokens"
import type { WarehouseFacility, WarehouseHandlingUnit, WarehouseLocation, WarehouseMobileApi } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"
import { scanFeedback, useScanStep } from "@/warehouse/scanner"

function message(error: unknown) {
  return error instanceof Error ? error.message : wt("serviceError")
}

function palletSummary(pallet: WarehouseHandlingUnit) {
  const quantity = pallet.contents.reduce((sum, content) => sum + Number(content.quantity), 0)
  return [pallet.locationCode ? `${wt("at")} ${pallet.locationCode}` : wt("noLocation"), pallet.customerName, `${quantity} ${wt("units")}`].filter(Boolean).join(" · ")
}

export function PalletMoveScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const pallet = useScanStep<WarehouseHandlingUnit>(async (scan) => {
    const unit = await api.findHandlingUnit(facility.id, scan)
    return unit ? { ok: true, value: unit, note: `${unit.code} · ${palletSummary(unit)}` } : { ok: false, message: wt("palletNotFound") }
  })
  const source = useScanStep<WarehouseLocation>(async (scan) => {
    const location = await api.findLocation(facility.id, scan)
    if (!location) return { ok: false, message: wt("sourceLocationNotFound") }
    const expected = pallet.result?.locationId
    return expected && expected !== location.id
      ? { ok: true, value: location, warning: true, note: `${wt("systemSays")} ${pallet.result?.locationCode ?? "—"}. ${wt("overrideRequired")}` }
      : { ok: true, value: location, note: wt("palletWhereExpected") }
  })
  const destination = useScanStep<WarehouseLocation>(async (scan) => {
    const location = await api.findLocation(facility.id, scan)
    if (!location || (pallet.result && location.facilityId !== pallet.result.facilityId)) return { ok: false, message: wt("destinationNotFound") }
    if (!location.isActive || location.statusCode !== "available") return { ok: false, message: wt("destinationUnavailable") }
    if (source.result?.id === location.id) return { ok: false, message: wt("sameLocation") }
    return { ok: true, value: location, note: `${location.code} · ${location.typeName || location.typeCode}` }
  })
  const mismatch = source.status === "warning"
  const ready = Boolean(pallet.result && source.result && destination.result) && (!mismatch || Boolean(reason.trim()))

  function clearSuccess<T extends (value: string) => void>(handler: T) {
    return (value: string) => { setSuccess(null); setError(null); handler(value) }
  }

  async function move() {
    if (!pallet.result || !source.result || !destination.result || (mismatch && !reason.trim())) return
    setBusy(true); setError(null)
    try {
      await api.moveHandlingUnit({ facilityId: facility.id, handlingUnitId: pallet.result.id, targetLocationId: destination.result.id, actualSourceLocationId: source.result.id, overrideReason: mismatch ? reason.trim() : null, notes: notes.trim() || null })
      scanFeedback("ok")
      setSuccess(`${pallet.result.code} ${wt("movedTo")} ${destination.result.code}.`)
      pallet.reset(); source.reset(); destination.reset(); setReason(""); setNotes("")
      pallet.focus()
    } catch (actionError) { scanFeedback("error"); setError(message(actionError)) } finally { setBusy(false) }
  }

  return <WarehouseScreen title={wt("moveOverride")} subtitle={wt("moveOverrideDetail")} onBack={onBack}>
    {success ? <SuccessState message={success} /> : null}
    <ScanField ref={pallet.ref} label={`1 · ${wt("palletCode")}`} value={pallet.value} onChangeText={clearSuccess((value) => { pallet.change(value); if (source.value) source.reset(); if (destination.value) destination.reset() })} onSubmit={async (text) => { if (await pallet.submit(text)) source.focus() }} status={pallet.status} message={pallet.message} placeholder={wt("scanPalletPlaceholder")} autoFocus />
    <ScanField ref={source.ref} label={`2 · ${wt("scannedSource")}`} expected={pallet.result?.locationCode ? `${wt("expected")} ${pallet.result.locationCode}` : null} value={source.value} onChangeText={clearSuccess(source.change)} onSubmit={async (text) => { if (await source.submit(text)) destination.focus() }} status={source.status} message={source.message} placeholder={wt("scanLocationPlaceholder")} />
    {mismatch ? <Field label={wt("overrideReason")} value={reason} onChangeText={setReason} /> : null}
    <ScanField ref={destination.ref} label={`3 · ${wt("destination")}`} value={destination.value} onChangeText={clearSuccess(destination.change)} onSubmit={(text) => void destination.submit(text)} status={destination.status} message={destination.message} placeholder={wt("scanLocationPlaceholder")} />
    <Field label={wt("notesOptional")} value={notes} onChangeText={setNotes} />
    {error ? <WarningState message={error} /> : null}
    <WarehouseButton label={wt("confirmMove")} disabled={!ready} busy={busy} onPress={() => void move()} />
  </WarehouseScreen>
}

export function ConsolidationScreen({ api, facility, onBack }: { api: WarehouseMobileApi; facility: WarehouseFacility; onBack: () => void }) {
  const [sources, setSources] = useState<WarehouseHandlingUnit[]>([])
  const [notes, setNotes] = useState("")
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const target = useScanStep<WarehouseHandlingUnit>(async (scan) => {
    const unit = await api.findHandlingUnit(facility.id, scan)
    return unit ? { ok: true, value: unit, note: `${unit.code} · ${palletSummary(unit)}` } : { ok: false, message: wt("palletNotFound") }
  })
  const nextSource = useScanStep<WarehouseHandlingUnit>(async (scan) => {
    const unit = await api.findHandlingUnit(facility.id, scan)
    if (!unit) return { ok: false, message: wt("palletNotFound") }
    if (unit.id === target.result?.id) return { ok: false, message: wt("targetSourceConflict") }
    if (sources.some((source) => source.id === unit.id)) return { ok: false, message: wt("alreadyAdded") }
    if (target.result && (unit.facilityId !== target.result.facilityId || unit.customerOrgId !== target.result.customerOrgId)) return { ok: false, message: wt("palletScopeMismatch") }
    return { ok: true, value: unit }
  })

  async function addSource(text: string) {
    const unit = await nextSource.submit(text)
    if (!unit) return
    setSources((current) => [...current, unit]); setConfirming(false)
    nextSource.reset(); nextSource.focus()
  }

  async function consolidate() {
    if (!target.result || !sources.length) return
    setBusy(true); setError(null)
    try {
      await api.consolidateHandlingUnits({ facilityId: facility.id, targetHandlingUnitId: target.result.id, sourceHandlingUnitIds: sources.map((source) => source.id), notes: notes.trim() || null })
      scanFeedback("ok")
      setSuccess(wt("consolidationComplete")); setConfirming(false); setSources([]); setNotes(""); target.reset(); nextSource.reset(); target.focus()
    } catch (actionError) { scanFeedback("error"); setError(message(actionError)) } finally { setBusy(false) }
  }

  return <WarehouseScreen title={wt("consolidation")} subtitle={wt("consolidationDetail")} onBack={onBack}>
    {success ? <SuccessState message={success} /> : null}
    <ScanField ref={target.ref} label={`1 · ${wt("targetPallet")}`} value={target.value} onChangeText={(value) => { setSuccess(null); setSources([]); setConfirming(false); target.change(value) }} onSubmit={async (text) => { if (await target.submit(text)) nextSource.focus() }} status={target.status} message={target.message} placeholder={wt("scanPalletPlaceholder")} autoFocus />
    <ScanField ref={nextSource.ref} label={`2 · ${wt("sourcePallets")}`} expected={sources.length ? `${sources.length} ${wt("added")}` : null} value={nextSource.value} onChangeText={nextSource.change} onSubmit={(text) => void addSource(text)} status={nextSource.status === "matched" ? "idle" : nextSource.status} message={nextSource.message} placeholder={wt("scanSourcePalletPlaceholder")} editable={Boolean(target.result)} />
    {sources.map((source) => <DataCard key={source.id} title={source.code} meta={palletSummary(source)}>
      <View style={styles.cardAction}><WarehouseButton compact tone="secondary" label={wt("remove")} onPress={() => { setSources((current) => current.filter((candidate) => candidate.id !== source.id)); setConfirming(false) }} /></View>
    </DataCard>)}
    {error ? <WarningState message={error} /> : null}
    {target.result && sources.length ? confirming ? <>
      <WarningState message={wt("consolidationWarning")} />
      <Field label={wt("notesOptional")} value={notes} onChangeText={setNotes} />
      <WarehouseButton label={`${wt("confirmConsolidation")} ${target.result.code}`} tone="danger" busy={busy} onPress={() => void consolidate()} />
    </> : <WarehouseButton label={wt("reviewConsolidation")} onPress={() => setConfirming(true)} /> : null}
  </WarehouseScreen>
}

const styles = StyleSheet.create({ cardAction: { alignItems: "flex-start", marginTop: spacing.md } })
