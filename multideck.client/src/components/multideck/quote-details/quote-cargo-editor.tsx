import { useId, useRef, useState } from 'react'
import { ChevronDown, Plus, Trash2 } from '@/components/icons/hugeicons'
import { DataTable, type DataTableColumn } from '@/components/multideck/data-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { TableCell, TableRow } from '@/components/ui/table'
import { CargoHandlingEditor } from './cargo-handling-editor'
import { handlingKinds, handlingLabels, readCargoHandling } from '@/lib/cargo-handling'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CompactCombobox, CompactFieldShell } from './quote-detail-fields'
import { freightPackageTypeOptions } from '@/lib/freight-package-types'
import { newQuoteCargoLine, quoteCargoNumberFields, quoteCargoTotal, type QuoteCargoLine } from '@/lib/quote-cargo'
import { useLanguage } from '@/i18n/language-provider'
import { cn } from '@/lib/utils'

const fieldLabels = {
  description: 'Goods description', commodity: 'Commodity', packageQuantity: 'Packages / pieces',
  grossWeightKg: 'Gross weight (kg)', netWeightKg: 'Net weight (kg)', volumeCbm: 'Volume (CBM)',
  chargeableWeightKg: 'Chargeable weight (kg)', length: 'Length', width: 'Width', height: 'Height',
  hsCode: 'HS code', countryOfOrigin: 'Country of origin (code)',
} as const
const fieldGrid = 'grid min-w-0 gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]'

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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const patch = (lineId: string, change: Partial<QuoteCargoLine>) => {
    if (editable && lines) onChange(lines.map(line => line.id === lineId ? { ...line, ...change, id: line.id } : line))
  }
  const toggle = (lineId: string) => setExpandedId(current => current === lineId ? null : lineId)
  const add = () => {
    if (!editable || (lines?.length ?? 0) >= 500) return
    const line = newQuoteCargoLine()
    focusNewLine.current = line.id
    onChange([...(lines ?? []), line])
    setExpandedId(line.id)
  }
  const renderField = (line: QuoteCargoLine, key: keyof typeof fieldLabels) => {
    const numeric = (quoteCargoNumberFields as readonly string[]).includes(key)
    const fieldId = `${id}-${line.id}-${key}`
    return <CompactFieldShell key={key} label={fieldLabels[key]} htmlFor={fieldId} width="full" className={key === 'description' ? 'col-span-full' : ''}>
      {key === 'description' ? <Textarea
        ref={element => { if (element && focusNewLine.current === line.id) { focusNewLine.current = null; element.focus() } }}
        id={fieldId} value={line[key]} readOnly={!editable} rows={2} data-i18n-skip dir="auto"
        onChange={event => patch(line.id, { description: event.target.value })}
        className="min-w-0 resize-y text-base sm:text-[13px]"
      /> : <Input id={fieldId} value={line[key]} readOnly={!editable} inputMode={numeric ? 'decimal' : undefined} data-i18n-skip dir={numeric ? 'ltr' : 'auto'} onChange={event => patch(line.id, { [key]: event.target.value })} className="h-9 min-w-0 text-base sm:text-[13px]" />}
    </CompactFieldShell>
  }
  const columns: DataTableColumn<QuoteCargoLine>[] = [
    {
      id: 'description', label: 'Cargo line', kind: 'identity', width: 320, minWidth: 230, canHide: false,
      cell: line => <button type="button" aria-expanded={expandedId === line.id} aria-controls={expandedId === line.id ? `${id}-${line.id}-details` : undefined} onClick={event => { event.stopPropagation(); toggle(line.id) }} className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-[var(--md-radius-sm)] text-start outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]">
        <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-[var(--md-subtle)] transition-transform motion-reduce:transition-none', expandedId !== line.id && '-rotate-90')} />
        <span className="w-5 shrink-0 text-[12px] tabular-nums text-[var(--md-subtle)]">{(lines?.indexOf(line) ?? 0) + 1}</span>
        <span className="min-w-0"><span data-i18n-skip dir="auto" className="block truncate text-[13px] text-[var(--md-ink)]">{line.description || t('Description not recorded')}</span>{line.commodity ? <span data-i18n-skip dir="auto" className="block truncate text-[12px] text-[var(--md-text)]">{line.commodity}</span> : null}</span>
      </button>,
    },
    { id: 'packages', label: 'Packages', kind: 'number', width: 140, cell: line => <span data-i18n-skip>{[line.packageQuantity, line.packageType].filter(Boolean).join(' ') || '–'}</span> },
    { id: 'grossWeightKg', label: 'Weight (kg)', kind: 'number', width: 115, cell: line => <span data-i18n-skip>{line.grossWeightKg || '–'}</span> },
    { id: 'volumeCbm', label: 'Volume (CBM)', kind: 'number', width: 125, cell: line => <span data-i18n-skip>{line.volumeCbm || '–'}</span> },
    { id: 'handling', label: 'Handling', kind: 'text', width: 200, cell: line => {
      try {
        const handling = readCargoHandling(line.handlingDetailsJson)
        const selected = handlingKinds.filter(kind => handling[kind] || (kind === 'hazardous' && line.isHazardous) || (kind === 'temperatureControlled' && line.isTemperatureControlled))
        return <span className={cn('whitespace-normal text-[12px]', selected.some(kind => kind === 'hazardous' || kind === 'temperatureControlled') && 'text-[var(--md-amber)]')}>{selected.map(kind => t(handlingLabels[kind])).join(' · ') || '–'}</span>
      } catch {
        return <span className="whitespace-normal text-[12px] text-[var(--md-amber)]">{[line.isHazardous ? t('Hazardous') : '', line.isTemperatureControlled ? t('Temperature controlled') : '', t('Unable to read saved handling')].filter(Boolean).join(' · ')}</span>
      }
    } },
  ]
  if (!lines) return editable ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => {
        const empty = newQuoteCargoLine()
        const line = { ...empty, ...legacy, id: empty.id }
        focusNewLine.current = line.id
        onChange([line]); setExpandedId(line.id)
      }}><Plus className="size-3.5" />{t('Use individual cargo lines')}</Button>
      <p className="text-[12px] leading-5 text-[var(--md-text)]">{t('Keep the current goods as one line, then add more. Submitted history stays unchanged.')}</p>
    </div>
  ) : null
  return (
    <section className="grid min-w-0 gap-3" aria-labelledby={`${id}-heading`} style={{ containerType: 'inline-size' }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 ref={heading} tabIndex={-1} id={`${id}-heading`} className="text-[13px] font-medium text-[var(--md-ink)]">{t('Cargo lines')} <span className="ms-1 text-[var(--md-subtle)]">{lines.length}</span></h3>
        {editable ? <Button type="button" variant="outline" size="sm" disabled={lines.length >= 500} title={lines.length >= 500 ? t('Maximum 500 cargo lines') : undefined} onClick={add}><Plus className="size-3.5" />{t('Add cargo line')}</Button> : <p className="text-[12px] text-[var(--md-text)]">{t('Saved version · read only')}</p>}
      </div>
      <DataTable
        columns={columns} rows={lines} getRowKey={line => line.id} ariaLabel={t('Cargo lines')}
        showToolbar={false} showColumnManager={false} enableSelectionExport={false} minimumWidth={900}
        tableClassName="table-fixed" onRowClick={line => toggle(line.id)}
        rowProps={line => ({ 'aria-expanded': expandedId === line.id })}
        emptyState={<p role="status" className="py-4 text-[12px] text-[var(--md-text)]">{t(editable ? 'No cargo lines. Add goods before sending the Quote.' : 'No cargo lines recorded.')}</p>}
        renderAfterRow={(line, visibleColumnCount) => expandedId === line.id ? <TableRow key={`${line.id}-details`} className="hover:bg-transparent">
          <TableCell colSpan={visibleColumnCount} className="bg-[var(--md-surface-soft)] p-0 align-top whitespace-normal">
            <div id={`${id}-${line.id}-details`} className="sticky start-0 grid w-[100cqw] min-w-0 max-w-[100cqw] gap-5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-[var(--md-ink)]">{t('Line')} {lines.indexOf(line) + 1} · {t('Cargo details')}</p>
                {editable ? <Button type="button" variant="ghost" size="sm" className="text-[var(--md-red)] hover:text-[var(--md-red)]" onClick={() => setRemovingId(line.id)}><Trash2 className="size-3.5" />{t('Remove line')}</Button> : null}
              </div>
              <div className={fieldGrid}>
                {renderField(line, 'description')}
                {renderField(line, 'commodity')}
                {renderField(line, 'packageQuantity')}
                <CompactCombobox label="Package type" value={line.packageType} options={freightPackageTypeOptions} disabled={!editable} onValueChange={value => patch(line.id, { packageType: value })} width="full" />
              </div>
              <fieldset className="grid min-w-0 gap-2">
                <legend className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">{t('Weight & volume')}</legend>
                <div className={fieldGrid}>
                  {renderField(line, 'grossWeightKg')}{renderField(line, 'netWeightKg')}{renderField(line, 'volumeCbm')}
                  {chargeableWeight || line.chargeableWeightKg ? renderField(line, 'chargeableWeightKg') : null}
                </div>
              </fieldset>
              <fieldset className="grid min-w-0 gap-2">
                <legend className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">{t('Dimensions')}</legend>
                <div className={fieldGrid}>
                  {renderField(line, 'length')}{renderField(line, 'width')}{renderField(line, 'height')}
                  <CompactCombobox label="Dimension unit" value={line.lengthUnit} options={['cm', 'm', 'in'].map(value => ({ value, label: value }))} disabled={!editable} allowCustom={false} onValueChange={value => { if (value) patch(line.id, { lengthUnit: value }) }} width="full" />
                </div>
              </fieldset>
              <fieldset className="grid min-w-0 gap-2">
                <legend className="mb-2 text-[12px] font-medium text-[var(--md-ink)]">{t('Commodity classification')}</legend>
                <div className={fieldGrid}>{renderField(line, 'hsCode')}{renderField(line, 'countryOfOrigin')}</div>
              </fieldset>
              <CargoHandlingEditor key={line.id} value={line.handlingDetailsJson || JSON.stringify({ ...(line.isHazardous ? { hazardous: { tbc: true, details: {} } } : {}), ...(line.isTemperatureControlled ? { temperatureControlled: { tbc: true, details: {} } } : {}) })} line={line} editable={editable} onChange={handlingDetailsJson => { const handling = readCargoHandling(handlingDetailsJson); patch(line.id, { handlingDetailsJson, isHazardous: Boolean(handling.hazardous), isTemperatureControlled: Boolean(handling.temperatureControlled) }) }} />
            </div>
          </TableCell>
        </TableRow> : null}
      />
      {lines.length ? <div className="flex flex-wrap gap-x-6 gap-y-1 text-[12px] text-[var(--md-text)]">
        {(['packageQuantity', 'grossWeightKg', 'volumeCbm'] as const).map((key, index) => <p key={key}>{t(['Total packages', 'Total weight (kg)', 'Total volume (CBM)'][index])} <span data-i18n-skip className="ms-1 font-medium tabular-nums text-[var(--md-ink)]">{quoteCargoTotal(lines, key) || t('Not fully recorded')}</span></p>)}
      </div> : null}
      <Dialog open={Boolean(removingId)} onOpenChange={open => { if (!open) setRemovingId(null) }}>
        <DialogContent onCloseAutoFocus={event => { event.preventDefault(); heading.current?.focus() }}>
          <DialogHeader><DialogTitle>{t('Remove cargo line?')}</DialogTitle><DialogDescription>{t('This removes the line from this working draft only. Previously submitted Quote versions are retained.')}</DialogDescription></DialogHeader>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setRemovingId(null)}>{t('Keep line')}</Button><Button type="button" variant="destructive" onClick={() => { if (editable) { onChange(lines.filter(line => line.id !== removingId)); if (expandedId === removingId) setExpandedId(null) }; setRemovingId(null) }}>{t('Remove line')}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
