import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Field } from "@/components/FormControls"
import { DataCard, MetricRow, QuantityField, ScanField, SegmentedChoice, WarehouseButton, WarningState } from "@/components/WarehouseUI"
import { formatQuantity, message } from "@/screens/screenSupport"
import { colors, radius, spacing, type } from "@/theme/tokens"
import type { WarehouseFacility, WarehouseInventoryBalance, WarehouseLocation, WarehouseMobileApi } from "@/warehouse/api"
import { wt, type WarehouseCopyKey } from "@/warehouse/i18n"
import { scanFeedback, useScanStep } from "@/warehouse/scanner"

type Action = "move" | "quarantine" | "damaged"
const reasonSuggestions: Record<Action, WarehouseCopyKey[]> = {
  move: ["reasonReslot", "reasonReplenish", "reasonConsolidate", "reasonFoundElsewhere"],
  quarantine: ["reasonQualityCheck", "reasonCustomerRequest", "reasonLabelling", "reasonExpiryCheck"],
  damaged: ["reasonCrushed", "reasonWet", "reasonForklift", "reasonOpened"],
}

/**
 * The physical changes a floor operator can make to one stock line: move some or all of it,
 * or take it out of available stock. Releasing holds stays an office decision on the web.
 */
export function StockLineActions({ api, facility, balance, onDone, onClose }: { api: WarehouseMobileApi; facility: WarehouseFacility; balance: WarehouseInventoryBalance; onDone: (summary: string) => void; onClose: () => void }) {
  const onHand = Number(balance.onHandQuantity)
  const committed = Number(balance.reservedQuantity) + Number(balance.allocatedQuantity)
  const [action, setAction] = useState<Action>("move")
  const [quantity, setQuantity] = useState(formatQuantity(onHand))
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const destination = useScanStep<WarehouseLocation>(async (scan) => {
    const location = await api.findLocation(facility.id, scan)
    if (!location) return { ok: false, message: wt("locationNotFound") }
    if (!location.isActive || location.statusCode !== "available") return { ok: false, message: wt("destinationUnavailable") }
    if (location.id === balance.locationId) return { ok: false, message: wt("sameLocation") }
    if (balance.isBonded && !location.allowsBondedStock) return { ok: false, message: wt("bondedNotAllowed") }
    return { ok: true, value: location, note: `${location.code} · ${location.typeName || location.typeCode}` }
  })

  const amount = Number(quantity)
  // Allocated or reserved stock can only move as a whole line, and cannot change status on the floor.
  const partialBlocked = action === "move" && committed > 0 && amount < onHand
  const statusBlocked = action !== "move" && committed > 0
  const valid = Number.isFinite(amount) && amount > 0 && amount <= onHand && Boolean(reason.trim()) && !partialBlocked && !statusBlocked && (action !== "move" || Boolean(destination.result))

  async function submit() {
    if (!valid) return
    setBusy(true); setError(null)
    try {
      if (action === "move" && destination.result) {
        await api.moveBalance({ facilityId: facility.id, balanceId: balance.id, quantity: amount, targetLocationId: destination.result.id, actualSourceLocationId: null, overrideReason: null, reasonCode: reason.trim(), notes: notes.trim() || null })
        onDone(`${formatQuantity(amount)} ${balance.uomCode} ${balance.sku} ${wt("movedTo")} ${destination.result.code}.`)
      } else if (action !== "move") {
        await api.changeStockStatus({ facilityId: facility.id, balanceId: balance.id, quantity: amount, targetStatusCode: action, reasonCode: reason.trim(), notes: notes.trim() || null })
        onDone(`${formatQuantity(amount)} ${balance.uomCode} ${balance.sku} ${action === "damaged" ? wt("markedDamaged") : wt("placedInQuarantine")}.`)
      }
      scanFeedback("ok")
    } catch (actionError) {
      scanFeedback("error")
      setError(message(actionError))
    } finally {
      setBusy(false)
    }
  }

  return <View>
    <DataCard title={balance.sku} meta={[balance.itemDescription, balance.customerName].filter(Boolean).join(" · ")} status={balance.inventoryStatusName || balance.inventoryStatusCode}>
      <Text style={styles.detail}>{[balance.locationCode ? `${wt("at")} ${balance.locationCode}` : wt("noLocation"), balance.handlingUnitCode ? `${wt("pallet")} ${balance.handlingUnitCode}` : wt("looseStock"), balance.lotNumber ? `${wt("lotNumber")} ${balance.lotNumber}` : null].filter(Boolean).join(" · ")}</Text>
      <MetricRow values={[{ label: wt("onHand"), value: `${formatQuantity(onHand)} ${balance.uomCode}` }, { label: wt("available"), value: formatQuantity(Number(balance.availableQuantity)) }, { label: wt("committed"), value: formatQuantity(committed) }]} />
    </DataCard>

    <SegmentedChoice label={wt("whatIsHappening")} value={action} onChange={(next) => { setAction(next); setReason(""); setError(null) }} options={[{ value: "move", label: wt("moveStock") }, { value: "quarantine", label: wt("quarantine") }, { value: "damaged", label: wt("damaged") }]} />

    <QuantityField label={wt("quantity")} value={quantity} onChangeText={setQuantity} max={onHand} uomCode={balance.uomCode} />
    {partialBlocked ? <WarningState message={wt("committedMoveWhole")} /> : null}
    {statusBlocked ? <WarningState message={wt("committedStatusBlocked")} /> : null}

    {action === "move" ? <ScanField ref={destination.ref} label={wt("destination")} value={destination.value} onChangeText={destination.change} onSubmit={async (text) => { if (await destination.submit(text)) destination.ref.current?.blur() }} status={destination.status} message={destination.message} placeholder={wt("scanLocationPlaceholder")} autoFocus /> : null}

    <Field label={wt("reason")} value={reason} onChangeText={setReason} placeholder={wt("reasonPlaceholder")} />
    <View style={styles.chips}>
      {reasonSuggestions[action].map((key) => {
        const text = wt(key)
        const chosen = reason === text
        return <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: chosen }} onPress={() => setReason(text)} style={({ pressed }) => [styles.chip, chosen && styles.chipSelected, pressed && styles.chipPressed]}><Text style={[styles.chipText, chosen && styles.chipTextSelected]}>{text}</Text></Pressable>
      })}
    </View>
    <Field label={wt("notesOptional")} value={notes} onChangeText={setNotes} multiline style={styles.notes} />
    {error ? <WarningState message={error} /> : null}
    <WarehouseButton label={action === "move" ? wt("confirmStockMove") : action === "damaged" ? wt("confirmDamaged") : wt("confirmQuarantine")} tone={action === "move" ? "primary" : "danger"} busy={busy} disabled={!valid} onPress={() => void submit()} />
    <WarehouseButton label={wt("cancel")} tone="secondary" onPress={onClose} />
  </View>
}


const styles = StyleSheet.create({
  detail: { color: colors.text, fontSize: type.meta, lineHeight: 18, marginTop: spacing.sm, writingDirection: "ltr" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  chip: { backgroundColor: colors.surface, borderColor: colors.hairline, borderRadius: radius.lg, borderWidth: 1, justifyContent: "center", minHeight: 40, paddingHorizontal: spacing.md },
  chipPressed: { opacity: 0.7 },
  chipSelected: { backgroundColor: colors.backgroundStrong, borderColor: colors.accent },
  chipText: { color: colors.inkSoft, fontSize: type.label },
  chipTextSelected: { color: colors.accent, fontWeight: "500" },
  notes: { minHeight: 80, textAlignVertical: "top" },
})
