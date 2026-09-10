import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DotGridLoader } from './dot-grid-loader'
import { milestoneHistoryChanges } from '@/lib/booking-milestone-editor'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useLanguage } from '@/i18n/language-provider'
import { saveBookingMilestone, type BookingMilestoneSave, type BookingWorkflowEvent, type BookingWorkflowMilestone, type BookingWorkflowRoute, type BookingWorkflowWorkspace } from '@/lib/booking-workflow-api'
import { milestoneChanges, milestoneDraft, milestoneFields, MilestoneInputError, milestoneStatuses, milestoneTimeLabel, type MilestoneDraft } from '@/lib/booking-milestone-editor'

type Props = {
  bookingId: string
  bookingReference: string
  bookingUpdatedAt: string
  route: BookingWorkflowRoute
  types?: { code: string; name: string }[]
  events?: BookingWorkflowEvent[]
  editable: boolean
  disabledReason?: string
  onSaved: (workspace: BookingWorkflowWorkspace) => void
  save?: (payload: BookingMilestoneSave) => Promise<BookingWorkflowWorkspace>
}
type Editing = { id: string; bookingId: string; routeId: string; original?: BookingWorkflowMilestone; draft: MilestoneDraft; initial: MilestoneDraft; incompleteFields: string[]; stamp: string; routeStamp: string }

/** Exact-leg operational evidence. Saving is independent of the Booking draft:
 * the parent must disable this editor while unrelated draft changes are dirty. */
export function BookingRouteMilestones(props: Props) {
  const { t, language } = useLanguage()
  const { route, types, events, editable, disabledReason, bookingReference } = props
  const id = useId()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [busy, setBusy] = useState(false)
  const [discard, setDiscard] = useState(false)
  const [error, setError] = useState('')
  const [errorField, setErrorField] = useState('')
  const [message, setMessage] = useState('')
  const focusTarget = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const fields = useRef(new Map<string, HTMLElement>())
  const mounted = useRef(false)
  const inFlight = useRef(false)
  const latest = useRef(props); latest.current = props
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (errorField) fields.current.get(errorField)?.focus() }, [errorField, error])
  const available = Array.isArray(route.milestones) && Array.isArray(types) && Boolean(route.id && route.updatedAt && props.bookingUpdatedAt)
  const canEdit = editable && available && !disabledReason
  const canCreate = canEdit && Boolean(types?.some(type => type.code !== 'customs_released'))
  const changedMode = Boolean(editing?.original && editing.original.recordedMode !== route.mode)
  const dirty = Boolean(editing && (editing.incompleteFields.length || JSON.stringify(editing.draft) !== JSON.stringify(editing.initial)))
  const hasIncompleteTime = () => [...fields.current.values()].some(field => field instanceof HTMLInputElement && field.type === 'datetime-local' && field.validity.badInput)
  useEffect(() => {
    if (!editing) return
    const preventLoss = (event: BeforeUnloadEvent) => { if (dirty || busy || hasIncompleteTime()) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', preventLoss)
    return () => window.removeEventListener('beforeunload', preventLoss)
  }, [dirty, busy, editing])
  const close = () => {
    if (inFlight.current) return
    if (discard) { setDiscard(false); return }
    if (dirty || hasIncompleteTime()) { setDiscard(true); return }
    setEditing(null)
  }
  function open(target: HTMLElement, original?: BookingWorkflowMilestone) {
    if (!canEdit || (!original && !canCreate) || (original && !original.operatorEditable)) return
    focusTarget.current = target
    const draft = milestoneDraft(original)
    setEditing({ id: original?.id ?? crypto.randomUUID(), bookingId: props.bookingId, routeId: route.id!, original, draft, initial: draft, incompleteFields: [], stamp: props.bookingUpdatedAt, routeStamp: route.updatedAt! })
    setError(''); setErrorField(''); setDiscard(false)
  }
  function update(key: keyof MilestoneDraft, value: string, incomplete = false) {
    setEditing(current => current ? { ...current, draft: { ...current.draft, [key]: value }, incompleteFields: [...current.incompleteFields.filter(field => field !== key), ...(incomplete ? [key] : [])] } : current)
    setError(''); setErrorField('')
  }
  const fieldProps = (key: string) => ({ id: `${id}-${key}`, 'aria-invalid': errorField === key || undefined,
    'aria-describedby': errorField === key ? `${id}-error` : undefined,
    ref: (element: HTMLElement | null) => { if (element) fields.current.set(key, element); else fields.current.delete(key) } })
  const context = `${bookingReference} · ${t('Step')} ${route.order ?? 1} · ${route.mode ?? t('Mode not recorded')}`
  return <section aria-labelledby={`${id}-heading`} className="grid min-w-0 gap-3 pt-2 text-[13px] text-[var(--md-ink)]">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h5 id={`${id}-heading`} ref={heading} tabIndex={-1} className="font-medium">{t('Operational milestones')}</h5>
      <Button type="button" variant="ghost" className="h-9 px-2 text-xs" disabled={!canCreate} onClick={event => open(event.currentTarget)}>{t('Record milestone')}</Button>
    </div>
    <p className="text-xs leading-5 text-[var(--md-text)]">{t('Planned, estimated and actual times are independent. No tracking feed connected.')}</p>
    {disabledReason ? <p className="text-xs leading-5 text-[var(--md-text)]">{t(disabledReason)}</p> : null}
    {available && !types?.some(type => type.code !== 'customs_released') ? <p className="text-xs leading-5 text-[var(--md-text)]">{t('No active operational milestone types are available for new records.')}</p> : null}
    {!available ? <p>{t('Milestone data is unavailable. Reload the Booking before editing.')}</p> : route.milestones!.length === 0 ? <p className="text-[var(--md-text)]">{t('No milestones recorded for this step.')}</p> : <ol className="grid min-w-0 gap-4">
      {route.milestones!.map(item => {
        const history = events?.filter(event => event.metadata?.milestoneId === item.id && event.type === 'route_milestone_recorded')
        const oldMode = item.recordedMode !== route.mode
        return <li key={item.id} className="grid min-w-0 gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-words"><span className="font-medium" data-i18n-skip>{item.name}</span> <span className="text-[var(--md-text)]">· {t(item.status.charAt(0).toUpperCase() + item.status.slice(1))}</span></p>
            {item.operatorEditable ? <Button type="button" variant="ghost" className="h-9 px-2 text-xs" disabled={!canEdit} aria-label={`${t(oldMode ? 'Review old milestone' : 'Correct milestone')}: ${item.name}`} onClick={event => open(event.currentTarget, item)}>{t(oldMode ? 'Review old milestone' : 'Correct')}</Button> : <span className="text-xs text-[var(--md-text)]">{t('Read-only')}</span>}
          </div>
          <dl className="grid min-w-0 gap-2 sm:grid-cols-3">
            {milestoneFields.filter(field => field.time).map(({ key, label }) => <div key={key} className="min-w-0 text-xs leading-5"><dt className="text-[var(--md-text)]">{t(label)}</dt><dd className="break-words" data-i18n-skip>{item[key] ? milestoneTimeLabel(item[key], language) : t('Not recorded')}</dd></div>)}
          </dl>
          {oldMode ? <p className="text-xs leading-5 text-[var(--md-text)]">{t('Historical mode:')} <span data-i18n-skip>{item.recordedMode ?? t('Unknown')}</span>. {t('Retained evidence, not an event for the new mode.')}</p> : null}
          <details className="min-w-0 text-xs leading-5">
            <summary className="cursor-pointer rounded py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2">{t('Source, details and recent history')}</summary>
            <p>{t('Source:')} <span data-i18n-skip>{item.source === 'operator' ? t('Operator recorded') : item.source || t('Unknown source')}</span> · {t('Recorded:')} <span data-i18n-skip>{milestoneTimeLabel(item.createdAt, language)}</span></p>
            <dl className="mt-2 grid gap-2 sm:grid-cols-2">{milestoneFields.filter(field => !field.time).map(({ key, label }) => <div key={key} className="min-w-0"><dt className="text-[var(--md-text)]">{t(label)}</dt><dd className="whitespace-pre-wrap break-words" data-i18n-skip>{item[key] || t('Not recorded')}</dd></div>)}</dl>
            <p className="mt-3 font-medium">{t('Recent history returned with this Booking')}</p>
            {!history?.length ? <p className="text-[var(--md-text)]">{t('No history returned here. This does not mean the audit history is empty.')}</p> : <ul className="mt-2 grid gap-3">{history.map(event => <li key={event.id} className="min-w-0 break-words">
              <p data-i18n-skip>{event.summary} · {event.actor || t('Actor unavailable')} · {milestoneTimeLabel(event.occurredAt, language)}</p>
              {typeof event.metadata?.reason === 'string' ? <p className="whitespace-pre-wrap text-[var(--md-text)]" data-i18n-skip>{event.metadata.reason}</p> : null}
              <dl className="mt-1 grid gap-1">{milestoneHistoryChanges(event.metadata).map(change => {
                const label = (value: string | null | undefined) => !value ? t('Not recorded') : change.time ? milestoneTimeLabel(value, language) : value
                return <div key={change.key} className="min-w-0"><dt className="font-medium">{t(change.label)}</dt><dd className="whitespace-pre-wrap break-words"><span>{t('Before:')} </span><span data-i18n-skip>{label(change.before)}</span><br /><span>{t('After:')} </span><span data-i18n-skip>{label(change.after)}</span></dd></div>
              })}</dl>
            </li>)}</ul>}
          </details>
        </li>
      })}
    </ol>}
    <p role="status" className="text-xs text-[var(--md-text)]">{message}</p>
    <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open) close() }}>
      <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto overscroll-contain" onCloseAutoFocus={event => { event.preventDefault(); (focusTarget.current?.isConnected ? focusTarget.current : heading.current)?.focus() }}>
        <DialogHeader><DialogTitle>{t(discard ? 'Discard milestone changes?' : editing?.original ? 'Correct operational milestone' : 'Record operational milestone')}</DialogTitle><DialogDescription>{discard ? t('Your unsaved entries will be discarded. Saved milestone history is unchanged.') : <><span data-i18n-skip>{context}</span><br />{t('Enter known times in UTC. Blank fields mean not recorded. This saves the milestone directly; the Quote and route dates stay unchanged.')}</>}</DialogDescription></DialogHeader>
        {discard ? <DialogFooter><Button type="button" variant="ghost" autoFocus onClick={() => setDiscard(false)}>{t('Keep editing')}</Button><Button type="button" onClick={() => { setDiscard(false); setEditing(null) }}>{t('Discard changes')}</Button></DialogFooter> : null}{editing ? <form noValidate hidden={discard} className={discard ? "hidden" : "grid min-w-0 gap-4"} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && event.target instanceof HTMLTextAreaElement) { event.preventDefault(); event.currentTarget.requestSubmit() } }} onSubmit={async event => {
          event.preventDefault()
          if (inFlight.current) return
          setError(''); setErrorField('')
          try {
            if (!canEdit || editing.bookingId !== props.bookingId || editing.routeId !== route.id || editing.stamp !== props.bookingUpdatedAt || editing.routeStamp !== route.updatedAt) throw new Error('This Booking or routing step changed. Close this editor and review the latest values.')
            const invalid = event.currentTarget.querySelector<HTMLInputElement>('input:invalid')
            if (invalid) throw new MilestoneInputError(invalid.name, 'Enter a complete, valid date and time in UTC, or clear the field.')
            const changes = milestoneChanges(editing.draft, types!, editing.original, route.mode)
            if (!Object.keys(changes).length) { setMessage(t('No milestone fields changed.')); setEditing(null); return }
            const payload: BookingMilestoneSave = { id: editing.id, routeId: route.id!, type: editing.draft.type,
              expectedUpdatedAt: editing.stamp, expectedRouteUpdatedAt: editing.routeStamp,
              expectedMilestoneUpdatedAt: editing.original?.updatedAt ?? null, changes, reason: editing.draft.reason.trim() }
            inFlight.current = true; setBusy(true)
            const saved = await (props.save ? props.save(payload) : saveBookingMilestone(props.bookingId, payload))
            if (!mounted.current) return
            if (latest.current.bookingId !== props.bookingId || latest.current.bookingUpdatedAt !== editing.stamp || latest.current.route.id !== route.id || latest.current.route.updatedAt !== editing.routeStamp || !latest.current.editable || latest.current.disabledReason) throw new Error('The milestone was saved, but this view changed. Reload the Booking before continuing.')
            if (saved.booking.jobId !== props.bookingId) throw new Error('The save returned a different Booking. Reload before continuing.')
            props.onSaved(saved); setMessage(t('Milestone saved.')); setEditing(null)
          } catch (failure) {
            if (mounted.current) { setError(t(failure instanceof Error ? failure.message : 'The milestone could not be saved. Your entries have been kept.')); setErrorField(failure instanceof MilestoneInputError ? failure.field : '') }
          } finally { inFlight.current = false; if (mounted.current) setBusy(false) }
        }}>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 gap-1.5"><label htmlFor={`${id}-type`} className="text-xs font-medium">{t('Milestone')} *</label><Select value={editing.draft.type} onValueChange={value => update('type', value)} disabled={busy || Boolean(editing.original)}><SelectTrigger {...fieldProps('type')} className="w-full"><SelectValue placeholder={t('Choose milestone')} /></SelectTrigger><SelectContent>{(editing.original ? [{ code: editing.original.type, name: editing.original.name }] : types ?? []).filter(type => type.code !== 'customs_released').map(type => <SelectItem key={type.code} value={type.code}><span data-i18n-skip>{type.name}</span></SelectItem>)}</SelectContent></Select></div>
            <div className="grid min-w-0 gap-1.5"><label htmlFor={`${id}-status`} className="text-xs font-medium">{t('Status')} *</label><Select value={editing.draft.status} onValueChange={value => update('status', value)} disabled={busy}><SelectTrigger {...fieldProps('status')} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{milestoneStatuses.filter(status => editing.original || status !== 'voided').map(status => <SelectItem key={status} value={status}>{t(status.charAt(0).toUpperCase() + status.slice(1))}</SelectItem>)}</SelectContent></Select></div>
          </div>
          {changedMode ? <p className="text-xs leading-5">{t('This evidence belongs to the previous mode. Only voiding is available; its recorded values will remain in history.')}</p> : null}
          {milestoneFields.map(({ key, label, time, limit }) => <label key={key} htmlFor={`${id}-${key}`} className="grid min-w-0 gap-1.5 text-xs font-medium">{t(label)} {time ? t('(UTC)') : ''}
            {key === 'notes' ? <Textarea {...fieldProps(key)} name={key} rows={2} maxLength={limit} value={editing.draft[key]} disabled={busy || changedMode} onChange={event => update(key, event.target.value)} className="text-base sm:text-[13px]" /> : <Input {...fieldProps(key)} name={key} type={time ? 'datetime-local' : 'text'} step={time ? '1' : undefined} maxLength={limit} value={editing.draft[key]} disabled={busy || changedMode} onChange={event => update(key, event.target.value, time && event.target.validity.badInput)} className="w-full min-w-0 text-base sm:text-[13px]" />}
          </label>)}
          <label htmlFor={`${id}-reason`} className="grid gap-1.5 text-xs font-medium">{t('Reason for this record or correction')} *<Textarea {...fieldProps('reason')} name="reason" required rows={2} maxLength={2000} disabled={busy} value={editing.draft.reason} onChange={event => update('reason', event.target.value)} className="text-base sm:text-[13px]" /></label>
          <p className="text-xs leading-5 text-[var(--md-text)]">{t('* Required. Corrections retain the previous values and operator attribution.')}{editing.draft.status === 'voided' ? ` ${t('Voiding retains this record and its audit history. It cannot be reactivated.')}` : ''}</p>
          {error ? <p id={`${id}-error`} role={errorField ? undefined : 'alert'} className="text-xs leading-5 text-[var(--md-text)]">{error}</p> : null}
          <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={close}>{t('Cancel')}</Button><Button type="submit" disabled={busy || !canEdit} aria-busy={busy}>{busy ? <DotGridLoader size="sm" decorative /> : null}{t(editing.draft.status === 'voided' ? 'Void milestone' : 'Save milestone')}{busy ? ` · ${t('Saving…')}` : ''}</Button></DialogFooter>
        </form> : null}
      </DialogContent>
    </Dialog>
  </section>
}
