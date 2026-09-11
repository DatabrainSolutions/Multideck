import { useId, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLanguage } from '@/i18n/language-provider'
import { cargoHandlingMissing, handlingFields, handlingKinds, handlingLabels, readCargoHandling, type HandlingDetail, type HandlingKind } from '@/lib/cargo-handling'

/** Controlled per-line handling. The parent owns persistence and version locking. */
export function CargoHandlingEditor({ value, line, editable, onChange, booking = false, onLineChange, evidence, sourceEvidenceEntry, unsaved = false }: {
  value?: string | null
  line: { description?: string | null; length?: unknown; width?: unknown; height?: unknown; lengthUnit?: string | null }
  booking?: boolean
  unsaved?: boolean
  evidence?: ReactNode
  sourceEvidenceEntry?: ReactNode
  onLineChange?: (field: "description" | "length" | "width" | "height", value: string) => void
  editable: boolean
  onChange: (value: string) => void
}) {
  const { t } = useLanguage()
  const id = useId()
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [editing, setEditing] = useState<HandlingKind | null>(null)
  const [draft, setDraft] = useState<HandlingDetail>({ tbc: false, details: {} })
  const [lineDraft, setLineDraft] = useState({ description: "", length: "", width: "", height: "" })
  const [error, setError] = useState("")
  let handling
  try { handling = readCargoHandling(value) } catch {
    return <p role="alert">{t('Saved handling details could not be read. Reload before editing; do not overwrite this line.')}</p>
  }
  const missing = cargoHandlingMissing(handling, line)
  const open = (kind: HandlingKind) => { setDraft(handling[kind] ?? { tbc: false, details: {} }); setLineDraft({ description: String(line.description ?? ''), length: String(line.length ?? ''), width: String(line.width ?? ''), height: String(line.height ?? '') }); setError(''); setEditing(kind) }
  return <div className="grid gap-2 text-[12px]">
    {!booking ? <p className="font-medium">{t('Selected handling')}: {handlingKinds.filter(kind => handling[kind]).map(kind => t(handlingLabels[kind])).join(' · ') || t('None')}</p> : null}
    {missing.length ? <p role="status" className="text-[var(--md-amber)]">{t('Details required before Booking is operationally ready or completed')}: {missing.map(label => t(label)).join(', ')}.</p> : null}
    <div className="flex flex-wrap gap-1.5" aria-label={t('Cargo line handling')}>
      {handlingKinds.map(kind => <Button key={kind} type="button" variant={handling[kind] ? 'default' : 'outline'} size="sm" disabled={!editable} aria-pressed={Boolean(handling[kind])} onClick={event => {
        trigger.current = event.currentTarget
        if (booking || kind === 'hazardous' || kind === 'temperatureControlled') { open(kind); return }
        const next = { ...handling }
        if (next[kind]) delete next[kind]
        else next[kind] = { tbc: false, details: {} }
        onChange(JSON.stringify(next))
      }}>{t(handlingLabels[kind])}</Button>)}
    </div>
    {booking ? <>
      {handlingKinds.some(kind => handling[kind]) || evidence ? <section aria-label={t('Goods evidence')} className="grid min-w-0 gap-1">
        <h4 className="py-1 font-medium">{t('Goods evidence')}</h4>
        {unsaved ? <p role="status" className="text-[var(--md-text)]">{t('Unsaved changes · save the booking to record them')}</p> : null}
        {handlingKinds.filter(kind => handling[kind]).map(kind => <details key={kind} className="min-w-0 border-b border-[var(--md-line)]">
          <summary className="min-h-10 cursor-pointer py-2.5 font-medium focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]">{t(handlingLabels[kind])}<span className="ms-2 font-normal text-[var(--md-text)]">{t(missing.includes(handlingLabels[kind]) ? 'Details required' : 'Handling requirement')}</span></summary>
          <div className="grid gap-2 pb-3 ps-4">
            {kind === 'hazardous' || kind === 'temperatureControlled' ? <dl className="grid gap-2 sm:grid-cols-2">{handlingFields[kind].map(([key, label]) => <div key={key}><dt className="text-[var(--md-text)]">{t(label)}</dt><dd data-i18n-skip className="whitespace-pre-wrap break-words">{handling[kind]?.details[key] || t('Not recorded')}</dd></div>)}</dl>
              : kind === 'oversized' ? <p data-i18n-skip>{[line.length, line.width, line.height].map(value => String(value ?? '–')).join(' × ')} {line.lengthUnit || 'cm'}</p>
                : <p data-i18n-skip className="whitespace-pre-wrap break-words">{line.description || t('Handling instructions required in goods description')}</p>}
            {kind === 'hazardous' ? <p className="text-[var(--md-text)]">{t('Handling requirements are not transport approval or source evidence.')}</p> : null}
            {handling[kind]!.tbc ? <p>{t('Details TBC')}</p> : null}
            {editable ? <Button type="button" variant="ghost" size="sm" className="justify-self-start" aria-label={`${t('Edit')} ${t(handlingLabels[kind])}`} onClick={event => { trigger.current = event.currentTarget; open(kind) }}>{t('Edit details')}</Button> : null}
            {kind === 'hazardous' ? sourceEvidenceEntry : null}
          </div>
        </details>)}
        {evidence}
      </section> : null}
    </> : <>
    {handlingKinds.filter(kind => handling[kind]).map(kind => <div key={kind} className="flex flex-wrap items-center gap-2">
      <span>{t(handlingLabels[kind])}</span>
      {kind === 'hazardous' || kind === 'temperatureControlled' ? <>
        <span data-i18n-skip>{handlingFields[kind].map(([key, label]) => handling[kind]?.details[key] ? `${t(label)}: ${handling[kind]!.details[key]}` : '').filter(Boolean).join(' · ')}</span>
        {editable ? <Button type="button" variant="ghost" size="sm" onClick={event => { trigger.current = event.currentTarget; open(kind) }}>{t('Edit details')}</Button> : null}
      </> : <span>{t(kind === 'oversized' ? 'Use the measurements above.' : 'Record handling instructions in the goods description.')}</span>}
      <label className="flex min-h-8 items-center gap-2"><Checkbox disabled={!editable} checked={handling[kind]!.tbc} onCheckedChange={checked => onChange(JSON.stringify({ ...handling, [kind]: { ...handling[kind], tbc: checked === true } }))} />{t('Details TBC')}</label>
    </div>)}
    </>}
    <Dialog open={editing !== null} onOpenChange={open => { if (!open) setEditing(null) }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[var(--md-radius-2xl)] p-0 sm:max-w-[560px]" onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.isConnected) trigger.current.focus() }}><DialogHeader className="shrink-0 px-5 pb-4 pt-5 pe-14 sm:px-6 sm:pe-14"><DialogTitle className="leading-6">{editing ? t(handlingLabels[editing]) : ''}</DialogTitle><DialogDescription className="text-[13px] leading-5">{t(booking ? 'Use supplied requirements. Resolve TBC before booking readiness or completion. This is not carrier or safety approval.' : 'Record supplied requirements for this cargo line. TBC allows Quote issue but must be resolved before Booking readiness and completion. This is not carrier or safety approval.')}</DialogDescription></DialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">
        <div className="grid grid-cols-1 items-start gap-x-4 gap-y-4 p-1 sm:grid-cols-2">
          {editing ? handlingFields[editing].map(([key, label]) => <label key={key} htmlFor={`${id}-${key}`} className={cn("grid min-w-0 gap-1.5 text-[12px] leading-5", key === "notes" && "sm:col-span-2")}>{t(label)}{key === "notes" ? <Textarea id={`${id}-${key}`} rows={3} className="min-h-24 resize-y rounded-[var(--md-radius-lg)] px-3 py-2" value={draft.details[key] ?? ''} onChange={event => setDraft({ ...draft, details: { ...draft.details, [key]: event.target.value } })} /> : <Input id={`${id}-${key}`} className="h-10 min-w-0 rounded-[var(--md-radius-lg)] px-3" value={draft.details[key] ?? ''} onChange={event => setDraft({ ...draft, details: { ...draft.details, [key]: event.target.value } })} />}</label>) : null}
          {booking && editing && !handlingFields[editing].length ? (editing === 'oversized' ? (['length', 'width', 'height'] as const) : (['description'] as const)).map(key => <label key={key} htmlFor={`${id}-${key}`} className="grid gap-1.5 text-[12px]">{t(key === 'description' ? 'Goods description / handling instructions' : `${key[0].toUpperCase() + key.slice(1)} (${line.lengthUnit || 'cm'})`)}<Input id={`${id}-${key}`} value={lineDraft[key]} onChange={event => { setLineDraft({ ...lineDraft, [key]: event.target.value }); setError('') }} /></label>) : null}
        </div>
        {error ? <p role="alert" className="mt-3 text-[12px] text-[var(--md-status-red-ink)]">{error}</p> : null}
        <label className="mt-4 flex min-h-9 items-center gap-2 px-1 text-[12px]"><Checkbox checked={draft.tbc} onCheckedChange={checked => setDraft({ ...draft, tbc: checked === true })} />{t('Details TBC')}</label>
        </div>
        <DialogFooter className="m-0 shrink-0 gap-2 rounded-none px-5 py-4 sm:flex-wrap sm:px-6"><Button type="button" variant="ghost" className="sm:me-auto" onClick={() => { if (editing && editable) { const next = { ...handling }; delete next[editing]; onChange(JSON.stringify(next)) }; setEditing(null) }}>{t('Remove selection')}</Button><Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('Cancel')}</Button><Button type="button" onClick={() => { if (editing && editable) {
          if (booking && !draft.tbc && cargoHandlingMissing({ [editing]: draft }, lineDraft).length) { setError(t('Complete the required details or mark Details TBC.')); return }
          if (booking && onLineChange && !handlingFields[editing].length) {
            if (editing === 'oversized') (['length', 'width', 'height'] as const).forEach(key => onLineChange(key, lineDraft[key]))
            else onLineChange('description', lineDraft.description)
          }
          onChange(JSON.stringify({ ...handling, [editing]: draft }))
        }; setEditing(null) }}>{t('Apply details')}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
