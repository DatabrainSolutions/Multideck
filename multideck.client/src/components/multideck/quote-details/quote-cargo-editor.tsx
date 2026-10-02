import { useId, useRef, useState } from 'react'
import { ChevronDown, GripVertical, Plus, Trash2 } from '@/components/icons/hugeicons'
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
export function QuoteCargoEditor({ lines: savedLines, legacy, editable, onChange }: {
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
  const draggingId = useRef<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [legacyTemplate] = useState(newQuoteCargoLine)
  // Display old shipment totals in the same editor without changing a saved
  // snapshot on mount. Only an operator edit materialises the draft cargo list.
  const lines = savedLines ?? [{ ...legacyTemplate, ...legacy, id: legacyTemplate.id }]
  const patch = (lineId: string, change: Partial<QuoteCargoLine>) => {
    if (editable && lines) onChange(lines.map(line => line.id === lineId ? { ...line, ...change, id: line.id } : line))
  }
  const move = (lineId: string, targetId: string) => {
    if (!editable || !lines) return
    const from = lines.findIndex(line => line.id === lineId)
    const to = lines.findIndex(line => line.id === targetId)
    if (from < 0 || to < 0 || from === to) return
    const reordered = [...lines]
    const [line] = reordered.splice(from, 1)
    reordered.splice(to, 0, line)
    onChange(reordered)
    setAnnouncement(`${t('Line')} ${from + 1} → ${to + 1}`)
  }
  const toggle = (lineId: string) => setExpandedId(current => current === lineId ? null : lineId)
  const add = () => {
    if (!editable || (lines?.length ?? 0) >= 500) return
    const line = newQuoteCargoLine()
    focusNewLine.current = line.id
    onChange([...(lines ?? []), line])
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
    ...(editable ? [{ id: 'reorder', label: '', kind: 'custom' as const, width: 44, canHide: false, cell: (line: QuoteCargoLine) => <Button
      type="button" variant="ghost" size="icon" className="size-9 cursor-grab active:cursor-grabbing"
      aria-label={`${t('Reorder line')} ${(lines?.indexOf(line) ?? 0) + 1}`} aria-describedby={`${id}-reorder-help`}
      disabled={(lines?.length ?? 0) < 2} draggable={(lines?.length ?? 0) > 1}
      onDragStart={event => { draggingId.current = line.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', line.id) }}
      onDragEnd={() => { draggingId.current = null }}
      onKeyDown={event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        const index = lines?.findIndex(item => item.id === line.id) ?? -1
        const target = lines?.[index + (event.key === 'ArrowUp' ? -1 : 1)]
        if (target) move(line.id, target.id)
      }}><GripVertical aria-hidden="true" className="size-4" /></Button> }] : []),
    { id: 'quantity' , label: 'Quantity', kind: 'number', width: 110, canHide: false, cell: line => <Input
      ref={element => { if (element && focusNewLine.current === line.id) { focusNewLine.current = null; element.focus() } }}
      aria-label={`${t('Quantity')} · ${t('Line')} ${(lines?.indexOf(line) ?? 0) + 1}`}
      value={line.packageQuantity} readOnly={!editable} inputMode="numeric" data-i18n-skip dir="ltr"
      onChange={event => patch(line.id, { packageQuantity: event.target.value })} className="h-9 min-w-0 text-base sm:text-[13px]" /> },
    { id: 'packageType', label: 'Package type', kind: 'custom', width: 230, canHide: false, cell: line => <CompactCombobox
      label="Package type" value={line.packageType} options={freightPackageTypeOptions} disabled={!editable}
      onValueChange={value => patch(line.id, { packageType: value })} width="full" className="[&>div:first-child]:sr-only" /> },
    { id: 'dimensions', label: 'Dimensions per package (L × W × H)', kind: 'custom', width: 390, canHide: false, cell: line => <div className="flex min-w-0 items-center gap-1.5">
      {(['length', 'width', 'height'] as const).map(key => <Input key={key}
        aria-label={`${t(fieldLabels[key])} · ${t('Line')} ${(lines?.indexOf(line) ?? 0) + 1}`}
        value={line[key]} readOnly={!editable} inputMode="decimal" data-i18n-skip dir="ltr"
        onChange={event => patch(line.id, { [key]: event.target.value })}
        placeholder={t(fieldLabels[key])} className="h-9 min-w-0 flex-1 text-base sm:text-[13px]" />)}
      <CompactCombobox label="Dimension unit" value={line.lengthUnit} options={['cm', 'm', 'in'].map(value => ({ value, label: value }))}
        disabled={!editable} allowCustom={false} onValueChange={value => { if (value) patch(line.id, { lengthUnit: value }) }}
        width="full" className="w-20 flex-none [&>div:first-child]:sr-only" />
    </div> },
    ...(['grossWeightKg', 'netWeightKg'] as const).map(key => ({
      id: key, label: key === 'grossWeightKg' ? 'Gross' : 'Nett', kind: 'number' as const, width: 100, canHide: false,
      cell: (line: QuoteCargoLine) => <Input aria-label={`${t(fieldLabels[key])} · ${t('Line')} ${(lines?.indexOf(line) ?? 0) + 1}`}
        value={line[key]} readOnly={!editable} inputMode="decimal" data-i18n-skip dir="ltr"
        onChange={event => patch(line.id, { [key]: event.target.value })} className="h-9 min-w-0 text-base sm:text-[13px]" />,
    })),
    { id: 'weightUnit', label: 'Weight UOM', kind: 'text', width: 85, canHide: false, cell: () => <span aria-label={t('Kilograms')} className="text-[12px]">kg</span> },
    { id: 'details', label: 'Goods details (optional)', kind: 'custom', width: 180, canHide: false, cell: line => <button
      type="button" aria-expanded={expandedId === line.id} aria-controls={expandedId === line.id ? `${id}-${line.id}-details` : undefined}
      onClick={() => toggle(line.id)} className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-[var(--md-radius-sm)] text-start outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent)]">
      <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 text-[var(--md-subtle)] transition-transform motion-reduce:transition-none', expandedId !== line.id && '-rotate-90')} />
      <span className="min-w-0"><span className="block text-[12px] text-[var(--md-ink)]">{t(expandedId === line.id ? 'Hide goods details' : 'Goods details')}</span>
        {line.description || line.commodity ? <span data-i18n-skip dir="auto" className="block truncate text-[11px] text-[var(--md-text)]">{line.description || line.commodity}</span> : null}
      </span>
    </button> },
    { id: 'handling', label: 'Handling', kind: 'text', width: 200, cell: line => {
      try {
        const handling = readCargoHandling(line.handlingDetailsJson)
        const selected = handlingKinds.filter(kind => handling[kind] || (kind === 'hazardous' && line.isHazardous) || (kind === 'temperatureControlled' && line.isTemperatureControlled))
        return <span className={cn('whitespace-normal text-[12px]', selected.some(kind => kind === 'hazardous' || kind === 'temperatureControlled') && 'text-[var(--md-amber)]')}>{selected.map(kind => t(handlingLabels[kind])).join(' · ') || '–'}</span>
      } catch {
        return <span className="whitespace-normal text-[12px] text-[var(--md-amber)]">{[line.isHazardous ? t('Hazardous') : '', line.isTemperatureControlled ? t('Temperature controlled') : '', t('Unable to read saved handling')].filter(Boolean).join(' · ')}</span>
      }
    } },
    ...(editable ? [{ id: 'remove', label: '', kind: 'custom' as const, width: 44, canHide: false, cell: (line: QuoteCargoLine) => <Button
      type="button" variant="ghost" size="icon" className="size-9 text-[var(--md-subtle)] hover:text-[var(--md-red)]"
      aria-label={`${t('Remove line')} ${(lines?.indexOf(line) ?? 0) + 1}`} onClick={() => setRemovingId(line.id)}>
      <Trash2 aria-hidden="true" className="size-4" /></Button> }] : []),
  ]
  return (
    <section className="grid min-w-0 gap-3" aria-labelledby={`${id}-heading`} style={{ containerType: 'inline-size' }}>
      {savedLines === undefined ? <p className="text-[12px] text-[var(--md-text)]">{t('Earlier shipment totals are shown together in one row; individual cargo allocations were not recorded.')}</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 ref={heading} tabIndex={-1} id={`${id}-heading`} className="text-[13px] font-medium text-[var(--md-ink)]">{t('Cargo details')} <span className="ms-1 text-[var(--md-subtle)]">({lines.length})</span></h3>
        {editable ? <Button type="button" variant="outline" size="sm" disabled={lines.length >= 500} title={lines.length >= 500 ? t('Maximum 500 cargo lines') : undefined} onClick={add}><Plus className="size-3.5" />{t('Add cargo line')}</Button> : <p className="text-[12px] text-[var(--md-text)]">{t('Saved version · read only')}</p>}
      </div>
      <p id={`${id}-reorder-help`} className="sr-only">{t('Drag to reorder, or use the up and down arrow keys on the handle.')}</p>
      <p role="status" className="sr-only">{announcement}</p>
      <DataTable
        columns={columns} rows={lines} getRowKey={line => line.id} ariaLabel={t('Cargo lines')}
        showToolbar={false} showColumnManager={false} enableSelectionExport={false} minimumWidth={1483}
        tableClassName="table-fixed"
        rowProps={line => ({
          'aria-expanded': expandedId === line.id,
          onDragOver: event => { if (editable && draggingId.current) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } },
          onDrop: event => {
            if (!editable || !draggingId.current) return
            event.preventDefault()
            move(draggingId.current, line.id)
            draggingId.current = null
          },
        })}
        emptyState={<p role="status" className="py-4 text-[12px] text-[var(--md-text)]">{t(editable ? 'Add package quantity, type and dimensions to price this Quote.' : 'No cargo lines recorded.')}</p>}
        renderAfterRow={(line, visibleColumnCount) => expandedId === line.id ? <TableRow key={`${line.id}-details`} className="hover:bg-transparent">
          <TableCell colSpan={visibleColumnCount} className="bg-[var(--md-surface-soft)] p-0 align-top whitespace-normal">
            <div id={`${id}-${line.id}-details`} className="sticky start-0 grid w-[100cqw] min-w-0 max-w-[100cqw] gap-5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-[var(--md-ink)]">{t('Line')} {lines.indexOf(line) + 1} · {t('Goods details (optional)')}</p>
                {editable ? <Button type="button" variant="ghost" size="sm" className="text-[var(--md-red)] hover:text-[var(--md-red)]" onClick={() => setRemovingId(line.id)}><Trash2 className="size-3.5" />{t('Remove line')}</Button> : null}
              </div>
              <div className={fieldGrid}>
                {renderField(line, 'description')}
                {renderField(line, 'commodity')}
              </div>
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
