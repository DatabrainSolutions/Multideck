import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DotGridLoader } from './dot-grid-loader'
import { useLanguage } from '@/i18n/language-provider'
import { securityEvidenceChanges, securityEvidenceDraft, securityEvidenceFields, SecurityEvidenceInputError, type SecurityEvidenceDraft } from '@/lib/booking-security-evidence-editor'
import { milestoneTimeLabel } from '@/lib/booking-milestone-editor'
import { saveBookingSecurityEvidence, type BookingSecurityEvidence, type BookingSecurityEvidenceSave, type BookingWorkflowCargo,
  type BookingWorkflowEvent, type BookingWorkflowWorkspace } from '@/lib/booking-workflow-api'

type Props = {
  bookingId: string; bookingReference: string; bookingUpdatedAt: string; cargo: BookingWorkflowCargo
  editable: boolean; disabledReason?: string; events?: BookingWorkflowEvent[]
  onSaved: (workspace: BookingWorkflowWorkspace) => void
  save?: (payload: BookingSecurityEvidenceSave) => Promise<BookingWorkflowWorkspace>
}
type Editing = { id: string; bookingId: string; cargoId: string; stamp: string; cargoStamp: string;
  original?: BookingSecurityEvidence; draft: SecurityEvidenceDraft; initial: SecurityEvidenceDraft }

/** Multideck-owned supplied-evidence editor. Parent draft saves must be clean
 * before this independent, exact-record operation may replace the workspace. */
export function BookingSecurityEvidenceEditor(props: Props) {
  const { t, language } = useLanguage(), id = useId()
  const [editing, setEditing] = useState<Editing | null>(null), [busy, setBusy] = useState(false)
  const [discard, setDiscard] = useState(false), [error, setError] = useState(''), [errorField, setErrorField] = useState('')
  const [message, setMessage] = useState('')
  const fields = useRef(new Map<string, HTMLElement>()), trigger = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null), inFlight = useRef(false), mounted = useRef(false)
  const latest = useRef(props); latest.current = props
  const available = Boolean(props.cargo.id && props.cargo.updatedAt && props.bookingUpdatedAt && Array.isArray(props.cargo.securityEvidence))
  const canEdit = available && props.editable && !props.disabledReason
  const dirty = Boolean(editing && JSON.stringify(editing.draft) !== JSON.stringify(editing.initial))
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (errorField) fields.current.get(errorField)?.focus() }, [errorField, error])
  useEffect(() => {
    if (!editing || (!dirty && !busy)) return
    const preventLoss = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [editing, dirty, busy])
  const close = () => { if (inFlight.current) return; if (discard) setDiscard(false); else if (dirty) setDiscard(true); else setEditing(null) }
  function open(target: HTMLElement, original?: BookingSecurityEvidence) {
    if (!canEdit || (original && !original.operatorEditable)) return
    trigger.current = target
    const draft = securityEvidenceDraft(original)
    setEditing({ id: original?.id ?? crypto.randomUUID(), bookingId: props.bookingId, cargoId: props.cargo.id!,
      stamp: props.bookingUpdatedAt, cargoStamp: props.cargo.updatedAt!, original, draft, initial: draft })
    setError(''); setErrorField(''); setDiscard(false)
  }
  const update = (key: keyof SecurityEvidenceDraft, value: string) => {
    setEditing(current => current ? { ...current, draft: { ...current.draft, [key]: value } } : current)
    setError(''); setErrorField('')
  }
  const fieldProps = (key: string) => ({ id: `${id}-${key}`, name: key, 'aria-invalid': errorField === key || undefined,
    'aria-describedby': errorField === key ? `${id}-error` : undefined,
    ref: (element: HTMLElement | null) => { if (element) fields.current.set(key, element); else fields.current.delete(key) } })
  const display = (value: unknown) => value === null || value === undefined || value === '' ? t('Not recorded')
    : typeof value === 'boolean' ? t(value ? 'Yes' : 'No') : String(value)
  return <section aria-labelledby={`${id}-heading`} className="grid min-w-0 gap-3 py-3 text-[13px] text-[var(--md-ink)]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 ref={heading} tabIndex={-1} id={`${id}-heading`} className="font-medium">{t('Screening evidence')}</h4>
      <Button type="button" variant="ghost" className="min-h-10 px-2 text-xs" disabled={!canEdit} onClick={event => open(event.currentTarget)}>{t('Record screening evidence')}</Button>
    </div>
    <p className="text-xs leading-5 text-[var(--md-text)]">{t('Supplied screening evidence for this cargo line—not clearance, agent verification or an air waybill. Unknown remains not recorded.')}</p>
    {props.disabledReason ? <p className="text-xs text-[var(--md-text)]">{t(props.disabledReason)}</p> : null}
    {!available ? <p>{t('Save the cargo line and reload its evidence before editing.')}</p>
      : !props.cargo.securityEvidence!.length ? <p className="text-[var(--md-text)]">{t('No screening details recorded for this line.')}</p>
        : <ol className="grid gap-4">{props.cargo.securityEvidence!.map(item => <li key={item.id} className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-words"><span data-i18n-skip>{item.securityStatus || item.screeningMethod || t('Supplied evidence')}</span> · {t(item.recordStatus === 'voided' ? 'Voided' : 'Recorded')}</p>
            {item.operatorEditable ? <Button type="button" variant="ghost" className="min-h-10 px-2 text-xs" disabled={!canEdit}
              aria-label={`${t('Correct screening evidence')}: ${item.securityStatus || item.screeningMethod || item.id}`}
              onClick={event => open(event.currentTarget, item)}>{t('Correct')}</Button> : <span className="text-xs">{t('Read-only')}</span>}
          </div>
          <details className="min-w-0 text-xs leading-5">
            <summary className="cursor-pointer py-2 font-medium">{t('Supplied details, source and recent history')}</summary>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">{securityEvidenceFields.map(field => <div key={field.key} className="min-w-0">
              <dt className="text-[var(--md-text)]">{t(field.label)}</dt><dd className="whitespace-pre-wrap break-words" data-i18n-skip>{display(item[field.key])}</dd>
            </div>)}</dl>
            <p className="mt-2">{t('Source:')} {t(item.source === 'operator' ? 'Operator recorded' : 'Legacy')} · <span data-i18n-skip>{milestoneTimeLabel(item.createdAt, language)}</span></p>
            <p className="mt-3 font-medium">{t('Recent history returned with this Booking')}</p>
            {!props.events?.some(event => event.type === 'cargo_security_evidence_recorded' && event.metadata?.evidenceId === item.id)
              ? <p>{t('No history returned here. This does not mean the audit history is empty.')}</p>
              : <ul className="mt-2 grid gap-3">{props.events.filter(event => event.type === 'cargo_security_evidence_recorded' && event.metadata?.evidenceId === item.id).map(event => {
                const before = event.metadata?.before as Record<string, unknown> | null, after = event.metadata?.after as Record<string, unknown> | null
                return <li key={event.id} className="min-w-0 break-words"><p data-i18n-skip>{event.summary} · {event.actor || t('Actor unavailable')} · {milestoneTimeLabel(event.occurredAt, language)}</p>
                  {typeof event.metadata?.reason === 'string' ? <p data-i18n-skip>{event.metadata.reason}</p> : null}
                  <dl className="mt-1 grid gap-1">{[...securityEvidenceFields, { key: 'recordStatus', label: 'Record status' }].filter(field => before?.[field.key] !== after?.[field.key]).map(field =>
                    <div key={field.key}><dt className="font-medium">{t(field.label)}</dt><dd>{t('Before:')} <span data-i18n-skip>{display(before?.[field.key])}</span> · {t('After:')} <span data-i18n-skip>{display(after?.[field.key])}</span></dd></div>)}</dl>
                </li>
              })}</ul>}
          </details>
        </li>)}</ol>}
    <p role="status" className="text-xs text-[var(--md-text)]">{message}</p>
    <Dialog open={Boolean(editing)} onOpenChange={value => { if (!value) close() }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto overscroll-contain sm:max-w-xl" onCloseAutoFocus={event => { event.preventDefault(); (trigger.current?.isConnected ? trigger.current : heading.current)?.focus() }}>
        <DialogHeader><DialogTitle>{t(discard ? 'Discard screening changes?' : editing?.original ? 'Correct screening evidence' : 'Record screening evidence')}</DialogTitle>
          <DialogDescription>{discard ? t('Unsaved entries will be discarded. Saved history is unchanged.') : <><span data-i18n-skip>{props.bookingReference} · {t('Cargo')} {props.cargo.lineNumber ?? 1}</span><br />{t('Copy supplied evidence only. Record its source and reason; do not infer missing details.')}</>}</DialogDescription></DialogHeader>
        {discard ? <DialogFooter><Button type="button" variant="ghost" autoFocus onClick={() => setDiscard(false)}>{t('Keep editing')}</Button><Button type="button" onClick={() => { setDiscard(false); setEditing(null) }}>{t('Discard changes')}</Button></DialogFooter> : null}
        {editing ? <form noValidate hidden={discard} className={discard ? 'hidden' : 'grid min-w-0 gap-4'}
          onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && event.target instanceof HTMLTextAreaElement) { event.preventDefault(); event.currentTarget.requestSubmit() } }}
          onSubmit={async event => {
            event.preventDefault(); if (inFlight.current) return
            setError(''); setErrorField('')
            try {
              if (!canEdit || editing.bookingId !== props.bookingId || editing.cargoId !== props.cargo.id || editing.stamp !== props.bookingUpdatedAt || editing.cargoStamp !== props.cargo.updatedAt) throw new Error('This Booking or cargo changed. Close the editor and review the latest values.')
              const changes = securityEvidenceChanges(editing.draft, editing.original)
              if (!Object.keys(changes).length) { setMessage(t('No screening fields changed.')); setEditing(null); return }
              const payload: BookingSecurityEvidenceSave = { id: editing.id, cargoId: editing.cargoId, expectedUpdatedAt: editing.stamp,
                expectedCargoUpdatedAt: editing.cargoStamp, expectedRecordUpdatedAt: editing.original?.updatedAt ?? null, changes, reason: editing.draft.reason }
              inFlight.current = true; setBusy(true)
              const workspace = await (props.save ? props.save(payload) : saveBookingSecurityEvidence(editing.bookingId, payload))
              if (!mounted.current || latest.current.bookingId !== editing.bookingId || latest.current.cargo.id !== editing.cargoId) return
              if (latest.current.disabledReason || !latest.current.editable || latest.current.bookingUpdatedAt !== editing.stamp || latest.current.cargo.updatedAt !== editing.cargoStamp) throw new Error('The evidence saved, but this workspace changed. Reload to review it without losing other edits.')
              if (workspace.booking.jobId !== editing.bookingId) throw new Error('The save returned a different Booking. Reload before continuing.')
              props.onSaved(workspace); setEditing(null); setMessage(t('Screening evidence saved.'))
            } catch (failure) {
              if (mounted.current) { setError(t(failure instanceof Error ? failure.message : 'The evidence could not be saved. Your entries are retained.')); if (failure instanceof SecurityEvidenceInputError) setErrorField(failure.field) }
            } finally { inFlight.current = false; if (mounted.current) setBusy(false) }
          }}>
          {editing.original ? <div className="grid gap-1"><label htmlFor={`${id}-recordStatus`}>{t('Record status')}</label><Select disabled={busy} value={editing.draft.recordStatus} onValueChange={value => update('recordStatus', value)}><SelectTrigger {...fieldProps('recordStatus')}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recorded">{t('Recorded')}</SelectItem><SelectItem value="voided">{t('Voided')}</SelectItem></SelectContent></Select></div> : null}
          {editing.draft.recordStatus === 'voided' ? <p className="text-xs leading-5">{t('This retains the original values and makes the record read-only. Other field edits in this form will not be applied.')}</p> : <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            {securityEvidenceFields.map(field => <div key={field.key} className={field.key === 'notes' || field.key === 'sourceReference' ? 'grid min-w-0 gap-1 sm:col-span-2' : 'grid min-w-0 gap-1'}>
              <label htmlFor={`${id}-${field.key}`}>{t(field.label)}{field.key === 'sourceReference' ? ` · ${t('Required')}` : ''}</label>
              {field.key === 'notes' ? <Textarea {...fieldProps(field.key)} disabled={busy} value={editing.draft[field.key]} maxLength={field.max} onChange={event => update(field.key, event.target.value)} />
                : <Input {...fieldProps(field.key)} type={field.key === 'screenedAt' ? 'datetime-local' : 'text'} step={field.key === 'screenedAt' ? '0.000001' : undefined} disabled={busy} required={field.key === 'sourceReference'} value={editing.draft[field.key]} maxLength={field.max} onChange={event => update(field.key, event.target.value)} />}
            </div>)}
          </div>}
          <div className="grid gap-1"><label htmlFor={`${id}-reason`}>{t('Reason')} · {t('Required')}</label><Textarea {...fieldProps('reason')} required disabled={busy} maxLength={2000} value={editing.draft.reason} onChange={event => update('reason', event.target.value)} /></div>
          {error ? <p id={`${id}-error`} role={errorField ? undefined : 'alert'} className="text-xs text-[var(--md-status-red-ink)]">{error}</p> : null}
          <DialogFooter className="sticky bottom-0 bg-[var(--md-surface)]"><Button type="button" variant="ghost" disabled={busy} onClick={close}>{t('Cancel')}</Button><Button type="submit" disabled={busy || !canEdit} aria-busy={busy}>{busy ? <DotGridLoader size="sm" decorative /> : null}{t(editing.draft.recordStatus === 'voided' ? 'Void record' : 'Save evidence')}{busy ? ` · ${t('Saving…')}` : ''}</Button></DialogFooter>
        </form> : null}
      </DialogContent>
    </Dialog>
  </section>
}
