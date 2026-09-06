import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLanguage } from '@/i18n/language-provider'
import { allocationMeasures, analyseCargoAllocations, newBookingCargoAllocation, remainingForAllocation } from '@/lib/booking-cargo-allocations'
import type { BookingCargoAllocation, BookingCargoAllocationState, BookingWorkflowCargo, BookingWorkflowContainer, BookingWorkflowRoute } from '@/lib/booking-workflow-api'

/** Reusable allocation rows. The Booking owns persistence and concurrency. */
export function CargoAllocationEditor({ cargo, equipment, routes, allocations, legacyLinks = [], editable, validationAttempt = 0, onChange }: {
  cargo: readonly BookingWorkflowCargo[]
  equipment: readonly BookingWorkflowContainer[]
  routes: readonly BookingWorkflowRoute[]
  allocations: BookingCargoAllocation[] | undefined
  legacyLinks?: BookingCargoAllocationState['legacyUnquantifiedLinks']
  editable: boolean
  validationAttempt?: number
  onChange: (lines: BookingCargoAllocation[]) => void
}) {
  const { t } = useLanguage()
  const prefix = useId()
  const root = useRef<HTMLElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const removeTrigger = useRef<HTMLElement | null>(null)
  const keepButton = useRef<HTMLButtonElement>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const analysis = analyseCargoAllocations(cargo, equipment, routes, allocations ?? [])
  useEffect(() => {
    if (!validationAttempt) return
    const invalid = root.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    const disclosure = invalid?.closest('details')
    if (disclosure) disclosure.open = true
    invalid?.focus()
  }, [validationAttempt])
  const cargoOptions = cargo.flatMap((item, index) => item.id ? [{ value: item.id, label: `${t('Cargo')} ${index + 1} · ${item.description || t('No description')}` }] : [])
  const equipmentOptions = equipment.flatMap((item, index) => item.id ? [{ value: item.id, label: `${t('Equipment')} ${index + 1} · ${[item.number, item.type].filter(Boolean).join(' · ') || t('Not numbered')}` }] : [])
  const routeOptions = [{ value: 'whole-journey', label: t('Whole journey') }, ...routes.flatMap((item, index) => item.id ? [{ value: item.id, label: `${t('Leg')} ${index + 1} · ${item.mode || ''} · ${item.originUnlocode || item.origin || '—'} → ${item.destinationUnlocode || item.destination || '—'}` }] : [])]
  const labelFor = (options: { value: string; label: string }[], value: string | null) => options.find(option => option.value === value)?.label || t('Removed or not selected')
  const patch = (id: string, change: Partial<BookingCargoAllocation>) => {
    if (!editable || !allocations) return
    onChange(allocations.map(line => line.id === id ? { ...line, ...change, id: line.id, archived: false } : line))
  }
  const controlClass = 'min-h-9 w-full min-w-0 rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] text-base sm:text-[12px]'
  if (!allocations) return <p className="text-[12px] leading-relaxed text-[var(--md-text)]">{t('Cargo allocation is not available on this deployment yet. Existing equipment details remain unchanged.')}</p>
  return <section ref={root} tabIndex={-1} aria-label={t('Cargo allocation')} className="@container grid min-w-0 gap-4 outline-offset-2">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-2xl text-[12px] leading-relaxed text-[var(--md-text)]">
        <p>{t('Assign goods to equipment for the whole journey or a specific leg. Successive legs are balanced separately.')}</p>
        <p>{t('Blank quantities remain unknown. Allocations do not change container totals, VGM or the accepted Quote.')}</p>
      </div>
      {editable ? <Button ref={addButton} type="button" variant="outline" size="sm" disabled={!cargoOptions.length || !equipmentOptions.length || allocations.length >= 1000}
        onClick={() => {
          if (!editable || !cargoOptions.length || !equipmentOptions.length || allocations.length >= 1000) return
          const line = newBookingCargoAllocation()
          if (cargoOptions.length === 1) line.cargoId = cargoOptions[0].value
          if (equipmentOptions.length === 1) line.containerId = equipmentOptions[0].value
          pendingFocus.current = line.id;onChange([...allocations, line])
        }}>{t('Add allocation')}</Button> : null}
    </div>
    {editable && (!cargoOptions.length || !equipmentOptions.length || cargo.some(item => !item.id) || equipment.some(item => !item.id) || routes.some(item => !item.id)) ?
      <p className="text-[12px] leading-relaxed text-[var(--md-text)]">{t('Save new cargo, equipment and routing legs before allocating them. Unsaved items are not offered in the selectors.')}</p> : null}
    {!allocations.length ? <p className="text-[12px] text-[var(--md-text)]">{t('No quantified allocations recorded.')}</p> : null}
    {allocations.map((line, index) => {
      const errors = validationAttempt ? analysis.issues.filter(issue => issue.id === line.id) : []
      const errorFor = (field: keyof BookingCargoAllocation) => errors.find(issue => issue.field === field)?.message
      const selectorFields = [
        ['cargoId', 'Cargo line', cargoOptions, line.cargoId],
        ['containerId', 'Equipment', equipmentOptions, line.containerId],
        ['routeId', 'Routing scope', routeOptions, line.routeId ?? 'whole-journey'],
      ] as const
      return <fieldset key={line.id} className="grid min-w-0 gap-3 rounded-[var(--md-radius-xl)] bg-[var(--md-surface-soft)] p-2">
        <legend className="px-1 text-[12px] font-medium">{t('Allocation')} {index + 1}</legend>
        <div className="grid min-w-0 gap-3 @[40rem]:grid-cols-3">
          {selectorFields.map(([field, label, options, value]) => {
            const controlId = `${prefix}-${line.id}-${field}`
            return <div key={field} className="grid min-w-0 content-start gap-1">
              <label htmlFor={editable ? controlId : undefined} className="text-[12px] text-[var(--md-text)]">{t(label)}</label>
              {editable ? <Select value={value} onValueChange={next => patch(line.id, { [field]: next === 'whole-journey' ? null : next })}>
                <SelectTrigger id={controlId} aria-invalid={Boolean(errorFor(field)) || undefined} aria-describedby={errorFor(field) ? `${controlId}-error` : undefined} className={controlClass}
                  ref={element => { if (field === 'cargoId' && element && pendingFocus.current === line.id) { pendingFocus.current = null;element.focus() } }}>
                  <SelectValue placeholder={t('Choose')} />
                </SelectTrigger>
                <SelectContent>{value && !options.some(option => option.value === value) ? <SelectItem value={value}>{t('Removed — choose another')}</SelectItem> : null}
                  {options.map(option => <SelectItem key={option.value} value={option.value}><span data-i18n-skip className="whitespace-normal break-words">{option.label}</span></SelectItem>)}
                </SelectContent>
              </Select> : <p data-i18n-skip className="break-words text-[13px] leading-relaxed">{labelFor(options, value)}</p>}
              {errorFor(field) ? <p id={`${controlId}-error`} className="text-[12px] leading-relaxed text-[var(--md-status-red-ink)]">{t(errorFor(field)!)}</p> : null}
            </div>
          })}
        </div>
        <div className="grid min-w-0 gap-3 @[28rem]:grid-cols-3">
          {allocationMeasures.map(([field, label]) => {
            const controlId = `${prefix}-${line.id}-${field}`
            return <div key={field} className="grid min-w-0 content-start gap-1">
              <label htmlFor={editable ? controlId : undefined} className="text-[12px] text-[var(--md-text)]">{t(label)}</label>
              {editable ? <Input id={controlId} value={line[field] ?? ''} inputMode="decimal" className={controlClass}
                aria-invalid={Boolean(errorFor(field)) || undefined} aria-describedby={errorFor(field) ? `${controlId}-error` : undefined}
                onChange={event => patch(line.id, { [field]: event.target.value })} /> : <p className="break-words text-[13px] tabular-nums" data-i18n-skip>{line[field] == null || line[field] === '' ? t('Unknown') : line[field]}</p>}
              {errorFor(field) ? <p id={`${controlId}-error`} className="text-[12px] leading-relaxed text-[var(--md-status-red-ink)]">{t(errorFor(field)!)}</p> : null}
            </div>
          })}
        </div>
        <details className="min-w-0">
          <summary className="min-h-8 cursor-pointer py-1 text-[12px] font-medium outline-offset-2">{t('Allocation notes')}</summary>
          {editable ? <><label className="sr-only" htmlFor={`${prefix}-${line.id}-notes`}>{t('Allocation notes')} {index + 1}</label>
            <Textarea id={`${prefix}-${line.id}-notes`} value={line.notes ?? ''} className={`${controlClass} mt-1`} aria-invalid={Boolean(errorFor('notes')) || undefined}
              aria-describedby={errorFor('notes') ? `${prefix}-${line.id}-notes-error` : undefined} onChange={event => patch(line.id, { notes: event.target.value })} />
            {errorFor('notes') ? <p id={`${prefix}-${line.id}-notes-error`} className="text-[12px] text-[var(--md-status-red-ink)]">{t(errorFor('notes')!)}</p> : null}
          </> : <p data-i18n-skip className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{line.notes || t('No notes')}</p>}
        </details>
        {editable ? <div className="flex flex-wrap justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" disabled={!Object.keys(remainingForAllocation(cargo, allocations, line)).length} onClick={() => patch(line.id, remainingForAllocation(cargo, allocations, line))}>{t('Use remaining quantities')}</Button>
          <Button type="button" variant="ghost" size="sm" aria-label={`${t('Remove allocation')} ${index + 1}`} onClick={event => { removeTrigger.current = event.currentTarget;setRemovingId(line.id) }}>{t('Remove allocation')}</Button>
        </div> : null}
      </fieldset>
    })}
    {analysis.balances.length ? <div className="grid gap-3">
      <h4 className="text-[12px] font-medium">{t('Remaining after these allocations')}</h4>
      {analysis.balances.map(balance => <div key={`${balance.cargoId}:${balance.routeId}`} className="grid gap-2">
        <p data-i18n-skip className="break-words text-[12px] leading-relaxed">{labelFor(cargoOptions, balance.cargoId)} · {labelFor(routeOptions, balance.routeId ?? 'whole-journey')}</p>
        <dl className="grid gap-3 @[28rem]:grid-cols-3">{allocationMeasures.map(([field, label]) => <div key={field}>
          <dt className="text-[12px] text-[var(--md-text)]">{t(label)}</dt><dd data-i18n-skip className="break-words text-[13px] tabular-nums">{balance.remaining[field] == null ? t('Unknown') : balance.remaining[field]!.startsWith('-') ? `${t('Over by')} ${balance.remaining[field]!.slice(1)}` : balance.remaining[field]}</dd>
        </div>)}</dl>
      </div>)}
    </div> : null}
    {legacyLinks.length ? <details className="min-w-0 text-[12px] leading-relaxed">
      <summary className="min-h-8 cursor-pointer py-1 font-medium outline-offset-2">{t('Previous unquantified links')} · {legacyLinks.length}</summary>
      <p className="max-w-2xl text-[var(--md-text)]">{t('These links do not record quantities or routing scope. They are retained separately and are not included in the balances above.')}</p>
      <ul className="mt-2 grid gap-1">{legacyLinks.map(link => <li data-i18n-skip key={`${link.cargoId}:${link.containerId}`} className="break-words">{labelFor(cargoOptions, link.cargoId)} → {labelFor(equipmentOptions, link.containerId)}</li>)}</ul>
    </details> : null}
    <Dialog open={Boolean(removingId)} onOpenChange={open => { if (!open) setRemovingId(null) }}>
      <DialogContent onOpenAutoFocus={event => { event.preventDefault();keepButton.current?.focus() }} onCloseAutoFocus={event => {
        event.preventDefault();if (removeTrigger.current?.isConnected) removeTrigger.current.focus();else (addButton.current ?? root.current)?.focus()
      }}><DialogHeader><DialogTitle>{t('Remove this allocation?')}</DialogTitle><DialogDescription>{t('The allocation is removed when you save the Booking. Its saved history, cargo, equipment and accepted Quote remain intact.')}</DialogDescription></DialogHeader>
        <DialogFooter><Button ref={keepButton} type="button" variant="outline" onClick={() => setRemovingId(null)}>{t('Keep allocation')}</Button><Button type="button" disabled={!editable} onClick={() => { if (editable) onChange(allocations.filter(line => line.id !== removingId));setRemovingId(null) }}>{t('Remove allocation')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}
