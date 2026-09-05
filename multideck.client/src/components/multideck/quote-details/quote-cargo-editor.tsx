import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CompactCombobox, CompactFieldShell } from './quote-detail-fields'
import { freightPackageTypeOptions } from '@/lib/freight-package-types'
import { newQuoteCargoLine, quoteCargoNumberFields, quoteCargoTotal, type QuoteCargoLine } from '@/lib/quote-cargo'
import { useLanguage } from '@/i18n/language-provider'
import { cn } from '@/lib/utils'

const fields = [
  ['description', 'Goods description'], ['commodity', 'Commodity'], ['packageQuantity', 'Packages / pieces'],
  ['grossWeightKg', 'Gross weight (kg)'], ['netWeightKg', 'Net weight (kg)'], ['volumeCbm', 'Volume (CBM)'],
  ['chargeableWeightKg', 'Chargeable weight (kg)'], ['length', 'Length'], ['width', 'Width'], ['height', 'Height'],
  ['hsCode', 'HS code'], ['countryOfOrigin', 'Country of origin (code)'],
] as const

/** A goods-list editor, not a complete Quote screen. Parent owns autosave/versioning. */
export function QuoteCargoEditor({ lines, legacy, editable, chargeableWeight = true, onChange }: {
  lines: QuoteCargoLine[] | undefined
  legacy?: Partial<QuoteCargoLine>
  editable: boolean
  chargeableWeight?: boolean
  onChange: (lines: QuoteCargoLine[]) => void
}) {
  const { t } = useLanguage()
  const id = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const focusNewLine = useRef<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const selected = lines?.find(line => line.id === selectedId) ?? lines?.[0]
  const selectedIndex = selected ? lines!.indexOf(selected) : -1
  const patch = (change: Partial<QuoteCargoLine>) => {
    if (editable && selected) onChange(lines!.map(line => line.id === selected.id ? { ...line, ...change, id: line.id } : line))
  }
  const add = () => {
    if (!editable || (lines?.length ?? 0) >= 500) return
    const line = newQuoteCargoLine()
    focusNewLine.current = line.id
    onChange([...(lines ?? []), line]); setSelectedId(line.id)
  }
  if (!lines) return editable ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => {
        const empty = newQuoteCargoLine()
        const line = { ...empty, ...legacy, id: empty.id }
        focusNewLine.current = line.id
        onChange([line]); setSelectedId(line.id)
      }}>{t('Use individual cargo lines')}</Button>
      <p className="text-[12px] leading-5 text-[var(--md-text)]">{t('Keep the current goods as one line, then add more. Submitted history stays unchanged.')}</p>
    </div>
  ) : null
  return (
    <section className="grid min-w-0 gap-3" aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 ref={heading} tabIndex={-1} id={`${id}-heading`} className="text-[13px] font-medium text-[var(--md-ink)]">{t('Cargo lines')} · {lines.length}</h3>
        {editable ? <Button type="button" variant="outline" size="sm" disabled={lines.length >= 500} onClick={add}>{t('Add cargo line')}</Button> : <p className="text-[12px] text-[var(--md-text)]">{t('Saved version · read only')}</p>}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-[var(--md-text)]">
        {(['packageQuantity', 'grossWeightKg', 'volumeCbm'] as const).map((key, index) => <p key={key}>{t(['Total packages', 'Total weight (kg)', 'Total volume (CBM)'][index])}: <span data-i18n-skip>{quoteCargoTotal(lines, key) || t('Not fully recorded')}</span></p>)}
      </div>
      {!lines.length ? <p role="status" className="text-[12px] text-[var(--md-text)]">{t('No cargo lines. Add goods before sending the Quote.')}</p> : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(0,2fr)]">
          <ol aria-label={t('Choose a cargo line')} className="grid max-h-80 content-start gap-1 overflow-y-auto">
            {lines.map((line, index) => <li key={line.id} className="min-w-0"><button type="button" aria-pressed={line.id === selected?.id} onClick={() => setSelectedId(line.id)} className={cn('w-full rounded-[var(--md-radius-md)] px-3 py-2 text-start text-[12px] leading-5 focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]', line.id === selected?.id ? 'bg-[var(--md-accent-a12)] text-[var(--md-ink)]' : 'bg-[var(--md-surface-soft)] text-[var(--md-text)]')}>
              <span>{t('Line')} {index + 1}</span><span data-i18n-skip dir="auto" className="block truncate">{line.description || t('Description not recorded')}</span>
              <span data-i18n-skip className="block">{[line.packageQuantity, line.packageType].filter(Boolean).join(' · ') || '—'}</span>
            </button></li>)}
          </ol>
          {selected ? <div className="grid min-w-0 content-start gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[13px] font-medium">{t('Line')} {selectedIndex + 1}</p>{editable ? <Button type="button" variant="ghost" size="sm" onClick={() => setRemovingId(selected.id)}>{t('Remove cargo line')}</Button> : null}</div>
            <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {fields.filter(([key]) => key !== 'chargeableWeightKg' || chargeableWeight || Boolean(selected[key])).map(([key, label]) => {
                const numeric = (quoteCargoNumberFields as readonly string[]).includes(key)
                return editable ? <CompactFieldShell key={key} label={label} htmlFor={`${id}-${key}`} width="full" className={key === 'description' ? 'sm:col-span-2 xl:col-span-3' : ''}>
                  {key === 'description' ? <Textarea ref={element => { if (element && focusNewLine.current === selected.id) { focusNewLine.current = null; element.focus() } }} id={`${id}-${key}`} value={selected[key]} rows={2} data-i18n-skip dir="auto" onChange={event => patch({ description: event.target.value })} className="min-w-0 resize-y text-base sm:text-[13px]" /> : <Input id={`${id}-${key}`} value={selected[key]} inputMode={numeric ? 'decimal' : undefined} data-i18n-skip dir={numeric ? 'ltr' : 'auto'} onChange={event => patch({ [key]: event.target.value })} className="h-9 min-w-0 text-base sm:text-[13px]" />}
                </CompactFieldShell> : <dl key={key} className={cn('min-w-0 text-[12px] leading-5', key === 'description' && 'sm:col-span-2 xl:col-span-3')}><dt className="text-[var(--md-text)]">{t(label)}</dt><dd data-i18n-skip dir="auto" className="break-words whitespace-pre-wrap text-[var(--md-ink)]">{selected[key] || '—'}</dd></dl>
              })}
              {editable ? <>
                <CompactCombobox label="Package type" value={selected.packageType} options={freightPackageTypeOptions} onValueChange={value => patch({ packageType: value })} width="full" />
                <CompactCombobox label="Dimension unit" value={selected.lengthUnit} options={['cm', 'm', 'in'].map(value => ({ value, label: value }))} allowCustom={false} onValueChange={value => { if (value) patch({ lengthUnit: value }) }} width="full" />
              </> : <><dl className="text-[12px] leading-5"><dt>{t('Package type')}</dt><dd data-i18n-skip>{selected.packageType || '—'}</dd></dl><dl className="text-[12px] leading-5"><dt>{t('Dimension unit')}</dt><dd data-i18n-skip>{selected.lengthUnit}</dd></dl></>}
            </div>
            <div className="flex flex-wrap gap-4">{(['isHazardous', 'isTemperatureControlled'] as const).map((key, index) => <label key={key} className="flex min-h-8 items-center gap-2 text-[12px]">{editable ? <Checkbox checked={selected[key]} onCheckedChange={checked => patch({ [key]: checked === true })} /> : <span>{t(selected[key] ? 'Yes' : 'No')} ·</span>}{t(index === 0 ? 'Hazardous' : 'Temperature controlled')}</label>)}</div>
          </div> : null}
        </div>
      )}
      <Dialog open={Boolean(removingId)} onOpenChange={open => { if (!open) setRemovingId(null) }}>
        <DialogContent onCloseAutoFocus={event => { event.preventDefault(); heading.current?.focus() }}>
          <DialogHeader><DialogTitle>{t('Remove cargo line?')}</DialogTitle><DialogDescription>{t('This removes the line from this working draft only. Previously submitted Quote versions are retained.')}</DialogDescription></DialogHeader>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setRemovingId(null)}>{t('Keep line')}</Button><Button type="button" onClick={() => { if (editable) onChange(lines.filter(line => line.id !== removingId)); setRemovingId(null) }}>{t('Remove line')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
