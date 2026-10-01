import { useRef, useState } from 'react'
import { Plus, Trash2 } from '@/components/icons/hugeicons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { CargoAllocationEditor } from '@/components/multideck/cargo-allocation-editor'
import { useLanguage } from '@/i18n/language-provider'
import { analyseCargoAllocations, cargoPackageQuantityText, cargoPackageSplitSummary, newBookingCargoAllocation, remainingForAllocation } from '@/lib/booking-cargo-allocations'
import { bookingEquipmentPresentation } from '@/lib/booking-equipment-policy'
import type { BookingCargoAllocation, BookingWorkflowCargo, BookingWorkflowContainer, BookingWorkflowRoute } from '@/lib/booking-workflow-api'

type Props = {
  cargo: BookingWorkflowCargo
  cargoIndex: number
  cargoLines: readonly BookingWorkflowCargo[]
  equipment: readonly BookingWorkflowContainer[]
  routes: readonly BookingWorkflowRoute[]
  allocations: readonly BookingCargoAllocation[]
  editable: boolean
  validationAttempt?: number
  onClose: () => void
  onSave: (allocations: BookingCargoAllocation[]) => void
}

/** Booking-specific, cargo-first edit surface. Changes remain local until Save. */
export function BookingCargoLoadPlanSheet({ cargo, cargoIndex, cargoLines, equipment, routes, allocations, editable, validationAttempt = 0, onClose, onSave }: Props) {
  const { t } = useLanguage()
  const originalQuantities = useRef(new Map(allocations.filter(line => line.cargoId === cargo.id).map(line => [line.id, line.packageQuantity])))
  const touchedQuantities = useRef(new Set<string>())
  const [draft, setDraft] = useState<BookingCargoAllocation[]>(() => allocations.filter(line => line.cargoId === cargo.id && !line.archived)
    .map(line => ({ ...line, packageQuantity: line.packageQuantity == null ? null : cargoPackageQuantityText(line.packageQuantity) })))
  const [advanced, setAdvanced] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const firstQuantity = useRef<HTMLInputElement>(null)
  const wholeJourney = draft.filter(line => !line.routeId).sort((a, b) => {
    const first = equipment.findIndex(item => item.id === a.containerId)
    const second = equipment.findIndex(item => item.id === b.containerId)
    return (first < 0 ? equipment.length : first) - (second < 0 ? equipment.length : second)
  })
  const legSpecific = draft.some(line => Boolean(line.routeId))
  const summary = cargoPackageSplitSummary(cargo, wholeJourney)
  const equipmentLabel = (item: BookingWorkflowContainer, index: number) =>
    `${item.number || `${t(bookingEquipmentPresentation(item.equipmentKind).label)} ${index + 1}`} · ${item.type || t('Type not recorded')}`
  const usedEquipment = new Set(wholeJourney.map(line => line.containerId).filter(Boolean))
  const unusedEquipment = equipment.filter(item => item.id && !usedEquipment.has(item.id))
  const otherAllocationCount = allocations.filter(line => line.cargoId !== cargo.id).length

  function update(id: string, change: Partial<BookingCargoAllocation>) {
    if (Object.prototype.hasOwnProperty.call(change, 'packageQuantity')) touchedQuantities.current.add(id)
    setDraft(current => current.map(line => line.id === id ? { ...line, ...change } : line))
    setError('')
  }

  function save() {
    if (!editable || !cargo.id) return
    const savedDraft = draft.map(line => touchedQuantities.current.has(line.id) ? line
      : { ...line, packageQuantity: originalQuantities.current.get(line.id) ?? line.packageQuantity })
    const merged = [...allocations.filter(line => line.cargoId !== cargo.id), ...savedDraft]
    const issue = analyseCargoAllocations(cargoLines, equipment, routes, merged).issues.find(item => draft.some(line => line.id === item.id))
    if (issue) {
      setError(t(issue.message))
      setAttempt(value => value + 1)
      setAdvanced(true)
      return
    }
    onSave(merged)
    onClose()
  }

  return <Sheet open onOpenChange={open => { if (!open) onClose() }}>
    <SheetContent side="right" style={{ width: 'min(540px, 100vw)', maxWidth: 'min(540px, 100vw)' }} className="overflow-hidden border-0 bg-[var(--md-surface)] p-0 shadow-[var(--md-shadow-lift)]" closeLabel={t('Close load plan')}>
      <SheetHeader className="shrink-0 gap-1 px-5 pb-4 pt-6 pe-14 shadow-[var(--md-stroke-bottom)]">
        <SheetTitle className="text-[18px] text-[var(--md-ink)]">{t('Load plan')} · {t('Cargo')} {cargoIndex + 1}</SheetTitle>
        <SheetDescription data-i18n-skip className="text-[13px] text-[var(--md-text)]">{cargo.description || t('New cargo line')} · {summary.total ?? t('Quantity not recorded')} {cargo.packageType || t('packages')}</SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {legSpecific ? <p className="text-[12px] leading-5 text-[var(--md-text)]">{t('This cargo has leg-specific allocations. Edit those in Advanced details below.')}</p> : <>
          <div className="grid gap-2">
            {wholeJourney.map((line, index) => {
              const selected = equipment.findIndex(item => item.id === line.containerId)
              const remaining = remainingForAllocation([cargo], draft, line).packageQuantity
              return <div key={line.id} className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 sm:grid-cols-[minmax(0,1fr)_96px_auto] sm:items-center">
                <Select value={line.containerId || undefined} onValueChange={value => update(line.id, { containerId: value })} disabled={!editable}>
                  <SelectTrigger aria-label={`${t('Container for allocation')} ${index + 1}`} className="min-h-10 min-w-0 bg-[var(--md-surface)] text-[13px]">
                    <SelectValue placeholder={t('Choose container')} />
                  </SelectTrigger>
                  <SelectContent>{equipment.map((item, itemIndex) => item.id && (!usedEquipment.has(item.id) || item.id === line.containerId)
                    ? <SelectItem key={item.id} value={item.id} data-i18n-skip>{equipmentLabel(item, itemIndex)}</SelectItem> : null)}</SelectContent>
                </Select>
                <div className="flex min-w-0 items-center gap-1.5">
                  <Input ref={index === 0 ? firstQuantity : undefined} aria-label={`${t('Packages in')} ${selected >= 0 ? equipmentLabel(equipment[selected], selected) : `${t('allocation')} ${index + 1}`}`}
                    value={line.packageQuantity ?? ''} inputMode="decimal" disabled={!editable}
                    aria-invalid={attempt > 0 && (line.packageQuantity == null || summary.invalid || summary.over) || undefined}
                    onChange={event => update(line.id, { packageQuantity: event.target.value })}
                    className="h-10 min-w-0 bg-[var(--md-surface)] text-base tabular-nums sm:text-[13px]" />
                  <span data-i18n-skip className="shrink-0 text-[12px] text-[var(--md-text)]">{cargo.packageType || t('packages')}</span>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" disabled={!editable} aria-label={`${t('Remove')} ${selected >= 0 ? equipmentLabel(equipment[selected], selected) : `${t('allocation')} ${index + 1}`}`}
                  onClick={() => { setDraft(current => current.filter(item => item.id !== line.id));setError('') }}><Trash2 className="size-4" aria-hidden="true" /></Button>
                {editable && !line.packageQuantity && remaining ? <Button type="button" variant="ghost" size="sm" className="justify-self-start text-[12px] sm:col-span-3" onClick={() => update(line.id, { packageQuantity: remaining })}>{t('Use remaining')} {remaining} {cargo.packageType || t('packages')}</Button> : null}
              </div>
            })}
          </div>
          <div className="grid gap-1">
            <Button type="button" variant="ghost" size="sm" className="w-fit gap-1 px-1 text-[var(--md-accent)]" disabled={!editable || !unusedEquipment.length || otherAllocationCount + draft.length >= 1000}
              onClick={() => {
                const next = { ...newBookingCargoAllocation(), cargoId: cargo.id || '', containerId: unusedEquipment.length === 1 ? unusedEquipment[0].id || '' : '' }
                setDraft(current => [...current, next]);setError('')
              }}><Plus className="size-4" aria-hidden="true" />{t('Add another container')}</Button>
            {!unusedEquipment.length ? <p className="text-[11px] text-[var(--md-subtle)]">{t('All saved containers are in this plan. Add equipment below to split further.')}</p> : null}
          </div>
          {summary.invalid ? <p role="alert" className="text-[12px] text-[var(--md-status-red-ink)]">{t('Enter valid package quantities on the cargo line and in each container.')}</p> : null}
          {summary.total !== null && !summary.invalid ? <div className="grid gap-2 pt-1">
            <Progress value={summary.percent} aria-label={t('Packages allocated')} />
            <div className="flex justify-between gap-3 text-[12px] tabular-nums">
              <span data-i18n-skip>{summary.knownAllocated} {t('of')} {summary.total} {cargo.packageType || t('packages')} {t('allocated')}</span>
              <span data-i18n-skip className={summary.over ? 'text-[var(--md-status-red-ink)]' : 'text-[var(--md-text)]'}>{summary.over ? `${t('Over by')} ${summary.remaining?.slice(1)}` : `${summary.remaining} ${t('remaining')}`}</span>
            </div>
            {summary.unknownCount ? <p className="text-[12px] text-[var(--md-status-amber-ink)]">{summary.unknownCount} {t('container quantities are still unknown.')}</p> : null}
          </div> : <p className="text-[12px] text-[var(--md-text)]">{t('Record the cargo-line package total to see the remaining balance.')}</p>}
          <p className="text-[12px] leading-5 text-[var(--md-text)]">{t('Weight is not automatically divided. Container loaded weight and VGM stay unchanged.')}</p>
        </>}
        <details open={advanced || undefined} onToggle={event => setAdvanced(event.currentTarget.open)} className="pt-2">
          <summary className="min-h-9 cursor-pointer py-2 text-[12px] font-medium text-[var(--md-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-accent)]">{t('Advanced details · legs, weights and notes')}</summary>
          <div className="pt-3"><CargoAllocationEditor cargo={[cargo]} equipment={equipment} routes={routes} allocations={draft} editable={editable} validationAttempt={validationAttempt + attempt} onChange={lines => {
            for (const line of lines) if (line.packageQuantity !== draft.find(item => item.id === line.id)?.packageQuantity) touchedQuantities.current.add(line.id)
            setDraft(lines);setError('')
          }} /></div>
        </details>
        {error ? <p role="alert" className="rounded-[var(--md-radius-md)] bg-[var(--md-status-red-bg)] px-3 py-2 text-[12px] text-[var(--md-status-red-ink)]">{error}</p> : null}
      </div>
      <SheetFooter className="shrink-0 flex-row justify-end gap-2 bg-[var(--md-surface)] px-5 py-4 shadow-[var(--md-stroke-top)]">
        <Button type="button" variant="outline" onClick={onClose}>{t('Cancel')}</Button>
        <Button type="button" disabled={!editable || summary.invalid || summary.over} onClick={save}>{t('Save load plan')}</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
}
