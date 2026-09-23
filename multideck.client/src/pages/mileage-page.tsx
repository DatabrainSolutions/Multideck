import { EmptyStateIllustration } from "@/components/multideck/empty-state-illustration"
import { MileageRouteMap } from '@/components/multideck/mileage-route-map'
import { InlineNotice } from '@/components/multideck/inline-notice'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Check, MapPin, Plus, RefreshCw, Settings, X } from '@/components/icons/hugeicons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { WizardDialog } from '@/components/multideck/wizard-dialog'
import { Surface } from '@/components/multideck/surface'
import { StatusPill } from '@/components/multideck/status-pill'
import { DataTable, type DataTableColumn } from '@/components/multideck/data-table'
import { DotGridLoader, DotGridLoaderPanel } from '@/components/multideck/dot-grid-loader'
import { CompactCombobox } from '@/components/multideck/quote-details/quote-detail-fields'
import { useLanguage } from '@/i18n/language-provider'
import { calculateMileageRoute, loadMileagePhotos, uploadMileagePhoto, readMileagePhoto, type MileagePhoto, type MileageRouteData, mileageMapLink, mileageRequest, mileageStatusLabels, type MileageContext, type MileageDetail, type MileageRate, type MileageStatus, type MileageTrip } from '@/lib/mileage-api'
import './mileage-page.css'

const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Try again.'
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function Field({ label, id, children, hint }: { label: string; id: string; children: ReactNode; hint?: string }) {
  return <div className="mileage-field"><label htmlFor={id}>{label}</label>{children}{hint && <p id={`${id}-hint`} className="mileage-hint">{hint}</p>}</div>
}
function Choice({ id, value, onChange, options, disabled, label, description }: { label?: string; description?: string; id: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} aria-describedby={description} id={id} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
}
function ErrorNotice({ children, retry }: { children: ReactNode; retry?: () => void }) {
  return <InlineNotice tone="error" action={retry && <Button type="button" variant="ghost" size="sm" onClick={retry}>Try again</Button>}>{children}</InlineNotice>
}
function TripStatus({ status }: { status: MileageStatus }) {
  return <StatusPill tone={status === 'paid' ? 'green' : status === 'rejected' ? 'red' : status === 'pending' ? 'amber' : 'neutral'}>{mileageStatusLabels[status]}</StatusPill>
}
function RateBreakdown({ rate, money }: { rate: MileageRate; money: (amount: number) => string }) {
  return <div className="mileage-rate"><p>{rate.label}</p>{rate.highMiles !== undefined ? <dl><div><dt>{rate.highMiles.toLocaleString()} mi × {rate.highRatePence}p</dt><dd>{money(rate.highMiles * (rate.highRatePence ?? 0) / 100)}</dd></div>{!!rate.lowMiles && <div><dt>{rate.lowMiles.toLocaleString()} mi × {rate.lowRatePence}p</dt><dd>{money(rate.lowMiles * (rate.lowRatePence ?? 0) / 100)}</dd></div>}</dl> : <p>{rate.ratePence}p per mile</p>}</div>
}

export function MileagePage({ route, navigate }: { route: string; navigate: (path: string) => void }) {
  const [context, setContext] = useState<MileageContext | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let active = true
    mileageRequest<MileageContext>('context').then(data => { if (active) { setContext(data); setError('') } }).catch(error => { if (active) setError(message(error)) })
    return () => { active = false }
  }, [reload])
  const finance = route.startsWith('/finance/')
  const root = finance ? '/finance/mileage' : '/crm/trips'
  if (!context) return <div className="md-page mileage-page">{error ? <><h1>Trips & mileage</h1><ErrorNotice retry={() => setReload(v => v + 1)}>{error}</ErrorNotice></> : <DotGridLoaderPanel label="Loading mileage" />}</div>
  if (finance && !context.finance) return <div className="md-page mileage-page"><ErrorNotice>Finance payment access is required to view this queue.</ErrorNotice></div>
  if (route === '/crm/trips/settings') return <MileageSettings context={context} onSaved={setContext} navigate={navigate} />
  if (route === '/crm/trips/new') return <><MileageRegister context={context} navigate={navigate} finance={false} /><MileageForm key="new" context={context} navigate={navigate} /></>
  const id = route.slice(root.length + 1)
  if (id && id !== 'approvals') return <MileageRecord key={id} id={id} context={context} navigate={navigate} back={root} />
  return <MileageRegister context={context} navigate={navigate} finance={finance} />
}

function MileageRegister({ context, navigate, finance }: { context: MileageContext; navigate: (path: string) => void; finance: boolean }) {
  const { language } = useLanguage()
  const money = (amount: number) => new Intl.NumberFormat(language, { style: 'currency', currency: 'GBP' }).format(amount)
  const [scope, setScope] = useState(finance ? 'finance' : 'mine')
  const [status, setStatus] = useState(finance ? 'ready' : 'all')
  const [sort, setSort] = useState<{ id: string; direction: 'asc' | 'desc' } | null>({ id: 'trip_date', direction: 'desc' })
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [offset, setOffset] = useState(0)
  const [limit, setLimit] = useState(50)
  const [result, setResult] = useState<{ rows: MileageTrip[]; total: number }>({ rows: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => { setScope(finance ? 'finance' : 'mine'); setStatus(finance ? 'ready' : 'all'); setOffset(0); setResult({ rows: [], total: 0 }) }, [finance])
  useEffect(() => {
    let active = true; setLoading(true); setError('')
    const timer = setTimeout(() => mileageRequest<{ rows: MileageTrip[]; total: number }>('list', { scope, status: status === 'all' ? '' : status, search, from, to, offset, limit, sort: sort?.id, direction: sort?.direction })
      .then(data => { if (active) setResult(data) }).catch(error => { if (active) setError(message(error)) }).finally(() => { if (active) setLoading(false) }), 180)
    return () => { active = false; clearTimeout(timer) }
  }, [scope, status, search, from, to, offset, limit, sort, reload])
  const columns: DataTableColumn<MileageTrip>[] = [
    { id: 'trip_date', label: 'Date', kind: 'date', width: 125, cell: row => new Date(`${row.trip_date}T12:00:00`).toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' }), sortValue: row => row.trip_date },
    { id: 'route', label: 'Trip', kind: 'long-text', width: 300, cell: row => <div data-i18n-skip className="mileage-route-cell"><p>{row.origin} → {row.destination}</p><span>{row.purpose}</span></div>, exportValue: row => [row.origin, ...row.waypoints, row.destination, ...(row.round_trip ? [row.origin] : [])].join(' → ') },
    ...(scope !== 'mine' ? [{ id: 'employee_name', label: 'Employee', width: 170, cell: (row: MileageTrip) => <span data-i18n-skip>{row.employee_name}</span>, exportValue: (row: MileageTrip) => row.employee_name, sortValue: (row: MileageTrip) => row.employee_name }] : []),
    { id: 'distance_miles', label: 'Miles', kind: 'number', width: 90, cell: row => row.distance_miles.toLocaleString(language, { maximumFractionDigits: 2 }), sortValue: row => row.distance_miles },
    { id: 'amount', label: 'Claim', kind: 'number', width: 110, cell: row => money(row.amount), sortValue: row => row.amount },
    { id: 'status', label: 'Status', kind: 'status', width: 180, cell: row => <TripStatus status={row.status} />, exportValue: row => mileageStatusLabels[row.status] },
  ]
  const setFilter = (fn: () => void) => { fn(); setOffset(0) }
  return <div className="md-page md-page-stack mileage-page">
    <header className="mileage-header"><div><h1>{finance ? 'Mileage payments' : 'Trips & mileage'}</h1>{finance && <p>Pay approved claims, then record the payment reference.</p>}</div><div className="flex flex-wrap gap-2">{!finance && context.finance && <Button variant="outline" onClick={() => navigate('/finance/mileage')}>Mileage payments<ArrowRight data-icon="inline-end" /></Button>}{context.admin && <Button variant="ghost" aria-label="Mileage settings" onClick={() => navigate('/crm/trips/settings')}><Settings /></Button>}</div></header>
    <DataTable columns={columns} rows={result.rows} getRowKey={row => row.id} storageKey={`mileage-${scope}`} ariaLabel={finance ? 'Mileage payments' : 'Mileage claims'} onRowClick={row => navigate(`${finance ? '/finance/mileage' : '/crm/trips'}/${row.id}`)} rowAriaLabel={row => `View trip to ${row.destination}`} minimumWidth={700}
      toolbarTabs={!finance && context.approver ? <ToggleGroup type="single" aria-label="Trip queue" value={scope} onValueChange={value => { if (value) setFilter(() => { setScope(value); setStatus('all') }) }}><ToggleGroupItem value="mine">My trips</ToggleGroupItem><ToggleGroupItem value="approvals">Approvals</ToggleGroupItem></ToggleGroup> : undefined}
      toolbarSearch={<Input aria-label="Search trips" placeholder="Search trips" value={search} onChange={e => setFilter(() => setSearch(e.target.value))} />}
      toolbarFilters={<div className="mileage-register-filters"><Choice label="Trip status" id="trip-status" value={status} onChange={value => setFilter(() => setStatus(value))} options={[{ value: 'all', label: 'All statuses' }, ...Object.entries(mileageStatusLabels).filter(([key]) => finance ? ['ready', 'paid'].includes(key) : scope === 'approvals' ? key === 'pending' : true).map(([value, label]) => ({ value, label }))]} /><Input aria-label="Trips from date" type="date" value={from} onChange={e => setFilter(() => setFrom(e.target.value))} /><Input aria-label="Trips to date" type="date" value={to} onChange={e => setFilter(() => setTo(e.target.value))} /></div>}
      toolbarOptions={<Button variant="ghost" aria-label="Refresh trips" disabled={loading} onClick={() => setReload(v => v + 1)}>{loading ? <DotGridLoader size="sm" decorative /> : <RefreshCw />}</Button>}
      contentBeforeTable={error ? <ErrorNotice retry={() => setReload(v => v + 1)}>{error}</ErrorNotice> : undefined}
      emptyState={loading ? <DotGridLoaderPanel label="Loading trips" /> : <div className="mileage-empty"><EmptyStateIllustration variant="route" /><h2>{search || from || to || status !== 'all' ? 'No matching trips' : finance ? 'No claims ready for payment' : scope === 'approvals' ? 'No trips awaiting approval' : 'Your trips start here'}</h2>{!finance && scope === 'mine' && !search && <Button onClick={() => navigate('/crm/trips/new')}><Plus data-icon="inline-start" />New trip</Button>}</div>}
      serverSorting={{ value: sort, onChange: value => { setSort(value); setOffset(0) } }}
      pagination={{ offset, limit, total: result.total, loading, onOffsetChange: setOffset, onLimitChange: value => { setLimit(value); setOffset(0) } }} />
    <p className="mileage-hint">{result.total.toLocaleString(language)} {result.total === 1 ? 'trip' : 'trips'}{result.total > limit ? ' · Export selects from the current page.' : ''}</p>
  </div>
}

type TripDraft = {
  id: string; version?: number; trip_date: string; account_id: string; company_name: string; purpose: string; origin: string; destination: string;
  waypoints: string[]; round_trip: boolean; vehicle_type: MileageTrip['vehicle_type']; vehicle_name: string; company_car: boolean;
  fuel_type: string; engine_cc: string; charging: string; distance_source: 'manual' | 'google' | 'route'; distance_miles: string; distance_reason: string; route_quote_id: string;
}
function MileageForm({ context, navigate, trip, onCancel }: { context: MileageContext; navigate: (path: string) => void; trip?: MileageTrip; onCancel?: () => void }) {
  const { language } = useLanguage()
  const money = (amount: number) => new Intl.NumberFormat(language, { style: 'currency', currency: 'GBP' }).format(amount)
  const [draft, setDraft] = useState<TripDraft>(() => ({
    id: trip?.id ?? crypto.randomUUID(), version: trip?.version, trip_date: trip?.trip_date ?? today(), account_id: trip?.account_id ?? '', company_name: trip?.company_name ?? '', purpose: trip?.purpose ?? '', origin: trip?.origin ?? '', destination: trip?.destination ?? '', waypoints: trip?.waypoints ?? [], round_trip: trip?.round_trip ?? false,
    vehicle_type: trip?.vehicle_type ?? 'car', vehicle_name: trip?.vehicle_name ?? '', company_car: trip?.company_car ?? false, fuel_type: trip?.fuel_type ?? 'petrol', engine_cc: String(trip?.engine_cc ?? ''), charging: trip?.charging ?? 'home', distance_source: trip?.distance_source ?? 'route', distance_miles: String(trip?.distance_miles ?? ''), distance_reason: trip?.distance_reason ?? '', route_quote_id: trip?.route_quote_id ?? '',
  }))
  const [busy, setBusy] = useState<'preview' | 'save' | 'photo' | null>(null)
  const lock = useRef(false)
  const [error, setError] = useState('')
  const [rate, setRate] = useState<MileageRate | null>(null)
  const [companySearch, setCompanySearch] = useState(trip?.company_name ?? '')
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [companyError, setCompanyError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [leave, setLeave] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const revision = useRef(0)
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => mileageRequest<{ id: string; name: string }[]>('companies', { search: companySearch }).then(data => { if (active) { setCompanies(data); setCompanyError('') } }).catch(error => { if (active) setCompanyError(message(error)) }), 200)
    return () => { active = false; clearTimeout(timer) }
  }, [companySearch])
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault() }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [dirty])
  const patch = (values: Partial<TripDraft>, routeChanged = false) => { revision.current++; setDraft(previous => ({ ...previous, ...values, ...(routeChanged ? { route_quote_id: '', distance_miles: '' } : {}) })); setRate(null); setDirty(true); setError('') }
  const [step, setStep] = useState<'journey' | 'purpose' | 'route' | 'confirm'>('journey')
  const reviewing = step === 'route' || step === 'confirm'
  const focusStep = useCallback((node: HTMLFormElement | null) => {
    formRef.current = node
    if (!node) return
    node.closest('.md-scrollbar')?.scrollTo({ top: 0 })
    node.focus({ preventScroll: true })
  }, [])
  const [quote, setQuote] = useState<{ id: string; distance_miles: number; route_data: MileageRouteData | null } | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [retryRoute, setRetryRoute] = useState(0)
  const [override, setOverride] = useState(trip?.distance_source === 'manual')
  const [photos, setPhotos] = useState<MileagePhoto[]>([])
  const [photoError, setPhotoError] = useState('')
  const [photoRestoreFailed, setPhotoRestoreFailed] = useState(false)
  const [photoRetry, setPhotoRetry] = useState(0)
  const [photoLoading, setPhotoLoading] = useState(!!trip?.evidence_ids?.length)
  const [readings, setReadings] = useState<{ before: string; after: string; unit: 'miles' | 'km' }>({ before: '', after: '', unit: 'miles' })
  const [aiReading, setAiReading] = useState('')
  const [reviewedApproval, setReviewedApproval] = useState(context.settings.approval_required)
  const submissionKey = useRef(crypto.randomUUID())
  const routeKey = JSON.stringify({ origin: draft.origin.trim(), destination: draft.destination.trim(), waypoints: draft.waypoints.map(v => v.trim()), round_trip: draft.round_trip, vehicle_type: draft.vehicle_type })
  useEffect(() => {
    if (!reviewing) return
    let active = true
    setQuote(null); setRouteError(''); setRate(null)
    const input = JSON.parse(routeKey)
    if (!input.origin || !input.destination || input.waypoints.some((value: string) => !value)) { setRouteLoading(false); return }
    setRouteLoading(true)
    const timer = setTimeout(() => {
      calculateMileageRoute(input).then(result => { if (active) setQuote(result) })
        .catch(error => { if (active) setRouteError(message(error)) })
        .finally(() => { if (active) setRouteLoading(false) })
    }, 0)
    return () => { active = false; clearTimeout(timer) }
  }, [reviewing, routeKey, retryRoute])
  useEffect(() => {
    if (!trip?.evidence_ids?.length) return
    let active = true
    setPhotoLoading(true); setPhotoRestoreFailed(false); setPhotoError('')
    loadMileagePhotos(trip.id).then(data => { if (active) setPhotos(data) }).catch(error => { if (active) { setPhotoError(message(error)); setPhotoRestoreFailed(true) } }).finally(() => { if (active) setPhotoLoading(false) })
    return () => { active = false }
  }, [trip?.id, trip?.evidence_ids, photoRetry])
  const payload = { ...draft, origin: draft.origin.trim(), destination: draft.destination.trim(), waypoints: draft.waypoints.map(v => v.trim()),
    distance_source: override ? 'manual' : 'route', distance_miles: override ? draft.distance_miles : String(quote?.distance_miles ?? ''), route_quote_id: quote?.id ?? '', evidence_ids: photos.map(photo => photo.id) }
  const previewKey = JSON.stringify(payload)
  useEffect(() => {
    setRate(null); setError('')
    if (!reviewing || routeLoading || (!override && !quote) || (override && (!draft.distance_reason.trim() || !(Number(draft.distance_miles) > 0)))) return
    let active = true
    const timer = setTimeout(() => {
      mileageRequest<{ rate_snapshot: MileageRate }>('preview', JSON.parse(previewKey)).then(data => { if (active) setRate(data.rate_snapshot) }).catch(error => { if (active) setError(message(error)) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [reviewing, previewKey, routeLoading, override, quote])
  const exit = () => { if (onCancel) onCancel(); else navigate('/crm/trips') }
  const canConfirm = !!rate && !busy && !routeLoading && (override || !!quote) && !photoLoading && !photoRestoreFailed && !photoError
  const changeStep = async (next: string) => {
    if (lock.current || next === step) return
    const stepOrder = ['journey', 'purpose', 'route', 'confirm'] as const
    if (stepOrder.indexOf(next as typeof step) < stepOrder.indexOf(step)) {
      setStep(next as typeof step); setError(''); return
    }
    if (!formRef.current?.reportValidity()) return
    if (step === 'journey') {
      if (!draft.origin.trim() || !draft.destination.trim() || !draft.vehicle_name.trim() || draft.waypoints.some(value => !value.trim())) {
        setError('Enter the journey and vehicle details before continuing.'); return
      }
      setStep('purpose'); setError(''); return
    }
    if (step === 'purpose') {
      if (!draft.purpose.trim()) { setError('Enter the business purpose before reviewing the route.'); return }
      setBusy('preview'); lock.current = true
      try {
        const current = await mileageRequest<MileageContext>('context')
        setReviewedApproval(current.settings.approval_required); setStep('route'); setError('')
      } catch (error) { setError(message(error)) } finally { setBusy(null); lock.current = false }
      return
    }
    if (next === 'confirm' && !canConfirm) {
      formRef.current?.reportValidity()
      setError(routeLoading ? 'Wait for the route to finish calculating.' : 'Check the mileage and claim amount before continuing.'); return
    }
    setError(''); setStep(next as 'route' | 'confirm')
  }
  const submit = async () => {
    if (lock.current || step !== 'confirm') return
    if (!rate || photoLoading || photoRestoreFailed || photoError || routeLoading || (!override && !quote)) return
    lock.current = true; setBusy('save'); setError('')
    try {
      const saved = await mileageRequest<MileageTrip>('confirm', { ...payload, reviewed_amount: rate.amount, reviewed_approval: reviewedApproval, submission_key: submissionKey.current })
      setDirty(false); toast.success(saved.status === 'pending' ? 'Trip sent for approval' : 'Trip sent to accounts'); navigate(`/crm/trips/${saved.id}`)
      if (onCancel) onCancel()
    } catch (error) { setError(message(error)) } finally { lock.current = false; setBusy(null) }
  }
  const upload = async (kind: MileagePhoto['kind'], file?: File) => {
    if (!file || lock.current) return
    lock.current=true;setBusy('photo');setPhotoError('')
    try { const photo=await uploadMileagePhoto(draft.id,kind,file);setPhotos(previous=>[...previous.filter(item=>item.kind!==kind),photo]);setDirty(true) }
    catch(error){setPhotoError(message(error))}finally{lock.current=false;setBusy(null)}
  }
  const readPhoto = async (photo: MileagePhoto) => {
    if(lock.current)return
    lock.current=true;setBusy('photo');setPhotoError('')
    try {
      const result=await readMileagePhoto(photo.id)
      if(result.reading===null||!result.unit) {setAiReading('Luna could not read the odometer clearly. Enter the reading yourself.');return}
      setReadings(previous=>({...previous,[photo.kind]:String(result.reading),unit:result.unit!}))
      setAiReading('Luna suggested this reading. Check both readings and their unit against the photos before applying.')
    }catch(error){setPhotoError(message(error))}finally{lock.current=false;setBusy(null)}
  }
  return <>
    <WizardDialog open onOpenChange={open => { if (!open && !lock.current) { if (dirty) setLeave(true); else exit() } }}
      title={trip ? 'Edit trip' : 'New trip'} description="Plan the journey, add the visit details, then review your claim."
      steps={[
        { id: 'journey', label: 'Journey', complete: step !== 'journey' },
        { id: 'purpose', label: 'Visit', complete: reviewing },
        { id: 'route', label: 'Route', complete: step === 'confirm' && !!rate },
        { id: 'confirm', label: 'Summary' },
      ]}
      activeStepId={step} onStepChange={next => void changeStep(next)}
      submitLabel="Confirm and submit" onSubmit={() => void submit()} saving={busy === 'save'} submitDisabled={!canConfirm}
      bodyMinHeight={520} className={step === 'route' ? 'sm:max-w-[1040px]' : 'sm:max-w-[800px]'}>
    <form ref={focusStep} tabIndex={-1} aria-label={step === 'journey' ? 'Journey details' : step === 'purpose' ? 'Purpose and company' : step === 'route' ? 'Route and mileage' : 'Confirm claim'} onSubmit={event => { event.preventDefault(); if (step === 'confirm') void submit(); else void changeStep(step === 'journey' ? 'purpose' : step === 'purpose' ? 'route' : 'confirm') }} className="mileage-page mileage-wizard-body outline-none" aria-busy={!!busy}>
      {step === 'journey' && <div className="mileage-form-main"><fieldset disabled={!!busy || reviewing} className="mileage-fieldset"><legend>Journey</legend>
        <Field id="trip-date" label="Trip date"><Input id="trip-date" type="date" required max={today()} min="2020-04-06" value={draft.trip_date} onChange={e => patch({ trip_date: e.target.value })} /></Field>
        <div className="mileage-fields">
        <Field id="trip-origin" label="From"><Input id="trip-origin" placeholder="Address or postcode" required maxLength={500} value={draft.origin} onChange={e => patch({ origin: e.target.value }, true)} /></Field>
        <Field id="trip-destination" label="To"><Input id="trip-destination" placeholder="Address or postcode" required maxLength={500} value={draft.destination} onChange={e => patch({ destination: e.target.value }, true)} /></Field>
      </div>
      {draft.waypoints.map((stop, index) => <Field key={index} id={`trip-stop-${index}`} label={`Stop ${index + 1}`}><div className="flex gap-2"><Input id={`trip-stop-${index}`} required maxLength={500} value={stop} onChange={e => patch({ waypoints: draft.waypoints.map((value, i) => i === index ? e.target.value : value) }, true)} /><Button type="button" variant="ghost" aria-label={`Remove stop ${index + 1}`} onClick={() => patch({ waypoints: draft.waypoints.filter((_, i) => i !== index) }, true)}><X /></Button></div></Field>)}
      {draft.round_trip && <Field id="trip-return" label="Final stop · return to start"><Input id="trip-return" value={draft.origin} placeholder="Enter the starting address" readOnly /></Field>}
      <div className="mileage-form-row"><Button type="button" variant="ghost" disabled={draft.waypoints.length >= 10} onClick={() => patch({ waypoints: [...draft.waypoints, ''] }, true)}><Plus data-icon="inline-start" />Add stop</Button><label className="mileage-toggle mileage-return-toggle"><span className="mileage-tick"><input type="checkbox" checked={draft.round_trip} onChange={event => patch({ round_trip: event.target.checked }, true)} /><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 10.5 8.25 14.25 15.5 6" pathLength="1" /></svg></span>Return to start</label></div>
      </fieldset>
      <fieldset disabled={!!busy || reviewing} className="mileage-fieldset"><legend>Vehicle</legend><div className="mileage-fields">
        <Field id="trip-vehicle-type" label="Type"><Choice id="trip-vehicle-type" value={draft.vehicle_type} onChange={value => patch({ vehicle_type: value as MileageTrip['vehicle_type'], company_car: value === 'car' && draft.company_car }, true)} options={[{ value: 'car', label: 'Car or van' }, { value: 'motorcycle', label: 'Motorcycle' }, { value: 'bicycle', label: 'Bicycle' }]} /></Field>
        <Field id="trip-vehicle" label="Make / model"><Input id="trip-vehicle" required maxLength={120} value={draft.vehicle_name} onChange={e => patch({ vehicle_name: e.target.value })} /></Field>
      </div>
      {draft.vehicle_type === 'car' && <label className="mileage-toggle mileage-return-toggle"><span className="mileage-tick"><input type="checkbox" checked={draft.company_car} onChange={event => patch({ company_car: event.target.checked })} /><svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4.5 10.5 8.25 14.25 15.5 6" pathLength="1" /></svg></span>Company car</label>}
      {draft.company_car && <div className="mileage-fields"><Field id="trip-fuel" label="Fuel" hint="For a hybrid, choose its petrol or diesel fuel."><Choice description="trip-fuel-hint" id="trip-fuel" value={draft.fuel_type} onChange={value => patch({ fuel_type: value })} options={[{ value: 'petrol', label: 'Petrol' }, { value: 'diesel', label: 'Diesel' }, { value: 'electric', label: 'Electric' }]} /></Field>{draft.fuel_type === 'electric' ? <Field id="trip-charging" label="Charging"><Choice id="trip-charging" value={draft.charging} onChange={value => patch({ charging: value })} options={[{ value: 'home', label: 'Home' }, { value: 'public', label: 'Public' }]} /></Field> : <Field id="trip-engine" label="Engine size (cc)"><Input id="trip-engine" type="number" required min={1} max={10000} value={draft.engine_cc} onChange={e => patch({ engine_cc: e.target.value })} /></Field>}</div>}
      </fieldset>
      </div>}
      {step === 'purpose' && <div className="mileage-form-main">
        <h2>Why are you going, and who are you visiting?</h2>
        <fieldset disabled={!!busy} className="mileage-fieldset">
        <div className="mileage-company-field">
          <CompactCombobox
            label="Company (optional)"
            value={draft.company_name}
            options={companies.map(company => ({ id: company.id, value: company.name, label: company.name }))}
            placeholder="Search companies or type a name"
            allLabel="Matching companies"
            emptyLabel="No matching company. Keep typing to use this name."
            width="full"
            onValueChange={value => { setCompanySearch(value); patch({ account_id: '', company_name: value }) }}
            onOptionSelect={option => patch({ account_id: option.id ?? '', company_name: option.value })}
          />
          {companyError && <p role="alert" className="mileage-hint">{companyError}</p>}
        </div>
      <Field id="trip-purpose" label="Business purpose">
        <Textarea id="trip-purpose" required maxLength={2000} placeholder="For example, quarterly review with the customer" value={draft.purpose} onChange={e => patch({ purpose: e.target.value })} />
        <div role="group" aria-label="Suggested business purposes" className="flex flex-wrap gap-2">
          {[`Visiting ${draft.company_name.trim() || 'a customer'}`, 'Supplier meeting', 'Industry event'].map(purpose => (
            <Button key={purpose} type="button" variant="outline" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal rounded-lg text-left" onClick={() => patch({ purpose })}>
              <span data-i18n-skip className="min-w-0 break-words">{purpose}</span>
            </Button>
          ))}
        </div>
      </Field>
        </fieldset>
        <p className="mileage-hint">Next, check the calculated route and adjust the mileage if needed.</p>
      </div>}
      {step === 'route' && <div className="mileage-route-review">
        <section className="mileage-route-info" aria-label="Mileage and claim">
          <div className="mileage-route-totals" aria-live="polite">
            <div className="mileage-total"><span>{override ? 'Actual mileage' : 'Calculated mileage'}</span><strong>{override && Number(draft.distance_miles) > 0 ? Number(draft.distance_miles).toLocaleString(language, { maximumFractionDigits: 2 }) : !override && quote ? quote.distance_miles.toLocaleString(language, { maximumFractionDigits: 2 }) : '—'} <small>mi</small></strong></div>
            <div className="mileage-total"><span>Claim amount</span><strong>{rate ? money(rate.amount) : '—'}</strong></div>
          </div>
          <p className="mileage-hint mileage-purpose"><span className="sr-only">Journey: </span><span data-i18n-skip>{[draft.origin, ...draft.waypoints, draft.destination, ...(draft.round_trip ? [draft.origin] : [])].join(' → ')}</span></p>
          {routeLoading ? <DotGridLoaderPanel label="Calculating your route" /> : routeError ? <ErrorNotice retry={()=>setRetryRoute(value=>value+1)}>{routeError}<p>You can go back to edit the journey or override the mileage below.</p></ErrorNotice> : null}
          {rate && <details className="mileage-review-disclosure"><summary>How the claim is calculated</summary><RateBreakdown rate={rate} money={money} /></details>}
          <fieldset disabled={!!busy} className="mileage-fieldset mileage-override-fields">
            <label className="mileage-toggle"><Switch checked={override} onCheckedChange={value=>{setOverride(value);setRate(null);if(value && !draft.distance_miles)patch({distance_miles:String(quote?.distance_miles??'')})}} />Override mileage</label>
            {override && <>
              <Field id="trip-miles" label="Actual business miles"><Input id="trip-miles" type="number" required min="0.01" max="10000" step="0.01" value={draft.distance_miles} onChange={e=>patch({distance_miles:e.target.value})} /></Field>
              <Field id="trip-distance-reason" label="Reason for the override">
                <Textarea id="trip-distance-reason" required maxLength={1000} placeholder="Choose a reason below or enter your own" value={draft.distance_reason} onChange={e=>patch({distance_reason:e.target.value})} />
                <div role="group" aria-label="Suggested override reasons" className="flex flex-wrap gap-2">
                  {['Route calculation was incorrect', 'Road closure or diversion', 'Different route taken'].map(reason => <Button key={reason} type="button" variant="outline" size="sm" className="h-auto min-h-8 max-w-full whitespace-normal rounded-lg text-left" onClick={() => patch({ distance_reason: reason })}>{reason}</Button>)}
                </div>
              </Field>
              {quote && <p className="mileage-hint">Calculated route: {quote.distance_miles.toLocaleString(language, { maximumFractionDigits: 2 })} mi</p>}
            </>}
          </fieldset>
          {!rate && <p className="mileage-hint" role="status">{routeLoading ? 'The claim amount will appear once the route is calculated.' : override && (!draft.distance_reason.trim() || !(Number(draft.distance_miles) > 0)) ? 'Enter your actual mileage and choose or enter a reason.' : routeError && !override ? 'Enter actual mileage to continue without a calculated route.' : error ? 'Resolve the issue below to continue.' : 'Checking claim amount…'}</p>}
          <details className="mileage-review-disclosure">
            <summary>Odometer photos (optional){photos.length > 0 ? ` · ${photos.length} attached` : ''}</summary>
            <div className="mileage-form-main">
        <p className="mileage-hint">Attach photos from before and after the journey. Photos are private to people who can view this claim. Reading a photo with Luna sends it to the AI service for analysis.</p>
        <div className="mileage-fields">{(['before','after'] as const).map(kind=>{
          const photo=photos.find(item=>item.kind===kind)
          return <div key={kind} className="mileage-field"><label htmlFor={`photo-${kind}`}>{kind==='before'?'Before the trip':'After the trip'}</label>
            {photo && <><img className="mileage-evidence-image" src={photo.url} alt={`Odometer ${kind} the trip`} /><div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={()=>void readPhoto(photo)}>Read with Luna</Button><Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={()=>{setPhotos(previous=>previous.filter(item=>item.id!==photo.id));setPhotoError('')}}>Remove photo</Button></div></>}
            <Input id={`photo-${kind}`} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={!!busy || photoLoading || photoRestoreFailed} onChange={event=>{void upload(kind,event.target.files?.[0]);event.target.value=''}} />
          </div>
        })}</div>
        {(photos.length>0 || aiReading) && <><p className="mileage-hint" role="status">{aiReading || 'You can enter the odometer readings below or read them with Luna.'}</p><div className="mileage-fields">{(['before','after'] as const).map(kind=><Field key={kind} id={`reading-${kind}`} label={`${kind==='before'?'Before':'After'} reading`}><Input id={`reading-${kind}`} type="number" min="0" step="0.1" value={readings[kind]} onChange={event=>setReadings(previous=>({...previous,[kind]:event.target.value}))} /></Field>)}</div><Choice id="reading-unit" label="Odometer unit" value={readings.unit} onChange={value=>setReadings(previous=>({...previous,unit:value as 'miles'|'km'}))} options={[{value:'miles',label:'Miles'},{value:'km',label:'Kilometres'}]} /><Button type="button" variant="outline" disabled={!!busy || !readings.before || !readings.after || Number(readings.after)<=Number(readings.before)} onClick={()=>{setOverride(true);patch({distance_miles:((Number(readings.after)-Number(readings.before))/(readings.unit==='km'?1.609344:1)).toFixed(2),distance_reason:`Odometer: ${readings.before} to ${readings.after} ${readings.unit}. Readings reviewed by claimant.`})}}>Use reviewed odometer readings</Button></>}
            </div>
          </details>
        {photoError && <ErrorNotice>{photoError}<Button type="button" variant="ghost" onClick={()=>photoRestoreFailed ? setPhotoRetry(value=>value+1) : setPhotoError('')}>{photoRestoreFailed ? 'Retry loading photos' : 'Dismiss'}</Button></ErrorNotice>}
        </section>
        <section className="mileage-route-map-panel" aria-label="Calculated route">
          <MileageRouteMap route={quote?.route_data ?? null} />
          {quote?.route_data?.note && <p className="mileage-hint">{quote.route_data.note}</p>}
        </section>
      </div>}
      {step === 'confirm' && <div className="mileage-form-main">
        <h2>Review your claim</h2>
        <dl className="mileage-confirm-facts">
          <div><dt>Trip date</dt><dd>{new Date(`${draft.trip_date}T12:00:00`).toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
          {draft.company_name && <div><dt>Company</dt><dd data-i18n-skip>{draft.company_name}</dd></div>}
          <div><dt>Journey</dt><dd data-i18n-skip>{[draft.origin, ...draft.waypoints, draft.destination, ...(draft.round_trip ? [draft.origin] : [])].join(' → ')}</dd></div>
          <div><dt>Business purpose</dt><dd data-i18n-skip>{draft.purpose}</dd></div>
          <div><dt>Vehicle</dt><dd data-i18n-skip>{draft.vehicle_name}</dd></div>
          <div><dt>{override ? 'Actual mileage' : 'Calculated mileage'}</dt><dd>{Number(payload.distance_miles).toLocaleString(language, { maximumFractionDigits: 2 })} mi</dd></div>
          {override && <div><dt>Override reason</dt><dd data-i18n-skip>{draft.distance_reason}</dd></div>}
        </dl>
        {rate && <><div className="mileage-total"><span>Claim amount</span><strong>{money(rate.amount)}</strong></div><RateBreakdown rate={rate} money={money} /></>}
        <InlineNotice>{reviewedApproval ? 'Confirming creates the trip and sends it for approval. Accounts will receive it once approved.' : 'Confirming creates the trip and sends the claim to accounts for payment.'}</InlineNotice>
      </div>}
      {error && <ErrorNotice>{error}</ErrorNotice>}
    </form>
    </WizardDialog>
    <Dialog open={leave} onOpenChange={setLeave}><DialogContent className="mileage-modal" overlayClassName="mileage-modal-overlay"><DialogHeader><DialogTitle>Leave without saving?</DialogTitle><DialogDescription>Your changes to this trip will be lost.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setLeave(false)}>Keep editing</Button><Button variant="destructive" onClick={exit}>Leave trip</Button></DialogFooter></DialogContent></Dialog>
  </>
}

function MileageRecord({ id, context, navigate, back }: { id: string; context: MileageContext; navigate: (path: string) => void; back: string }) {
  const { language } = useLanguage()
  const money = (amount: number) => new Intl.NumberFormat(language, { style: 'currency', currency: 'GBP' }).format(amount)
  const [detail, setDetail] = useState<MileageDetail | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [dialog, setDialog] = useState<'reject' | 'pay' | null>(null)
  const actionButton = useRef<HTMLButtonElement | null>(null)
  const backButton = useRef<HTMLButtonElement>(null)
  const [note, setNote] = useState('')
  const lock = useRef(false)
  const mounted = useRef(true)
  const refresh = useCallback(async () => { try { const data = await mileageRequest<MileageDetail>('detail', { id }); if (mounted.current) { setDetail(data); setError('') } } catch (error) { if (mounted.current) setError(message(error)) } }, [id])
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false } }, [refresh])
  const act = async (action: 'submit' | 'approve' | 'reject' | 'pay') => {
    if (!detail || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const trip = await mileageRequest<MileageTrip>(action, { id, version: detail.trip.version, reason: note, reference: note })
      if (!mounted.current) return
      setDetail(previous => previous ? { ...previous, trip } : null); setDialog(null); setNote('')
      toast.success(action === 'submit' ? 'Claim submitted' : action === 'approve' ? 'Claim approved' : action === 'pay' ? 'Payment recorded' : 'Claim returned')
      await refresh()
    } catch (error) { if (mounted.current) setError(message(error)) } finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  if (!detail) return <div className="md-page mileage-page">{error ? <ErrorNotice retry={() => void refresh()}>{error}</ErrorNotice> : <DotGridLoaderPanel label="Loading trip" />}</div>
  const trip = detail.trip
  if (editing) return <MileageForm trip={trip} context={context} navigate={navigate} onCancel={() => { setEditing(false); void refresh() }} />
  const owned = trip.user_id === context.userId
  const editable = owned && ['draft', 'rejected'].includes(trip.status)
  const canDecide = context.approver && !owned && trip.status === 'pending'
  const steps = ['Recorded', ...(trip.approval_required ? ['Approval'] : []), 'Accounts', 'Paid']
  const step = trip.status === 'draft' || trip.status === 'rejected' ? 0 : trip.status === 'pending' ? 1 : trip.status === 'ready' ? steps.length - 2 : steps.length - 1
  return <div className="md-page md-page-stack mileage-page">
    <header className="mileage-header"><div className="flex items-start gap-3"><Button variant="ghost" ref={backButton} aria-label="Back to trips" onClick={() => navigate(back)}><ArrowLeft /></Button><div><h1 data-i18n-skip>Trip to {trip.destination}</h1><p data-i18n-skip>{trip.employee_name} · {new Date(`${trip.trip_date}T12:00:00`).toLocaleDateString(language, { day: 'numeric', month: 'long', year: 'numeric' })}</p></div></div><TripStatus status={trip.status} /></header>
    <ol className="mileage-progress" aria-label="Claim progress">{steps.map((label, index) => <li key={label} data-complete={index < step} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span>{label}</li>)}</ol>
    {trip.denial_reason && <ErrorNotice>Returned: {trip.denial_reason}</ErrorNotice>}
    {error && !dialog && <ErrorNotice retry={() => void refresh()}>{error}</ErrorNotice>}
    <div className="mileage-editor"><Surface className="mileage-detail-main"><h2>Journey</h2><ol className="mileage-stops">{[trip.origin, ...trip.waypoints, trip.destination, ...(trip.round_trip ? [trip.origin] : [])].map((stop, i) => <li key={i}><span>{i + 1}</span><p data-i18n-skip>{stop}</p></li>)}</ol><p data-i18n-skip className="mileage-purpose">{trip.purpose}</p>{detail.companyName && (trip.account_id ? <Button variant="link" onClick={() => navigate(`/crm/accounts/${trip.account_id}`)}><span data-i18n-skip>{detail.companyName}</span><ArrowRight data-icon="inline-end" /></Button> : <p data-i18n-skip className="mileage-company-name">{detail.companyName}</p>)}
      <MileageRouteMap route={trip.route_data} />
      <MileagePhotos trip={trip} />
      <Button asChild variant="outline"><a href={mileageMapLink(trip)} target="_blank" rel="noreferrer">Open Google Maps<ArrowRight data-icon="inline-end" /></a></Button>
      <p data-i18n-skip className="mileage-hint">{trip.distance_source !== 'manual' ? `Mileage calculated by ${trip.route_data?.provider ?? 'the route service'} when this trip was recorded.` : `Manually recorded mileage: ${trip.distance_reason}`}</p>
    </Surface><Surface className="mileage-claim-panel"><div className="mileage-total"><span>{trip.status === 'draft' ? 'Estimated claim' : 'Claim amount'}</span><strong>{money(trip.amount)}</strong></div><p data-i18n-skip className="tabular-nums">{trip.distance_miles.toLocaleString(language)} miles · {trip.vehicle_name}</p><RateBreakdown rate={trip.rate_snapshot} money={money} />
      {trip.status === 'draft' && <p className="mileage-hint">Your tax-year mileage and rate are checked again on submission.</p>}
      {trip.status === 'paid' && <dl className="mileage-facts"><dt>Payment reference</dt><dd data-i18n-skip>{trip.payment_reference}</dd><dt>Recorded</dt><dd>{new Date(trip.paid_at!).toLocaleString(language)}</dd></dl>}
      <div className="mileage-record-actions">{editable && <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>Edit trip</Button>}{owned && trip.status === 'draft' && <Button disabled={busy} onClick={() => void act('submit')}>{busy ? 'Submitting…' : 'Submit claim'}</Button>}{canDecide && <><Button disabled={busy} onClick={() => void act('approve')}>{busy ? 'Saving…' : 'Approve claim'}</Button><Button variant="outline" disabled={busy} onClick={event => { actionButton.current = event.currentTarget; setError(''); setNote(''); setDialog('reject') }}>Return for changes</Button></>}{context.finance && trip.status === 'ready' && <Button disabled={busy} onClick={event => { actionButton.current = event.currentTarget; setError(''); setNote(''); setDialog('pay') }}>Mark as paid</Button>}</div>
      <h2>History</h2><ol className="mileage-history">{detail.events.map(event => <li key={event.id}><p>{{ saved: 'Trip saved', submit: 'Claim submitted', approve: 'Claim approved', reject: 'Claim returned', pay: 'Payment recorded' }[event.action] || event.action}</p><span data-i18n-skip>{event.actor_name} · {new Date(event.created_at).toLocaleString(language)}</span>{event.detail.reason && <p data-i18n-skip>{event.detail.reason}</p>}</li>)}</ol>
    </Surface></div>
    <Dialog open={!!dialog} onOpenChange={open => { if (!open && !busy) { setDialog(null); setError('') } }}><DialogContent className="mileage-modal" overlayClassName="mileage-modal-overlay" onCloseAutoFocus={event => { event.preventDefault(); (actionButton.current?.isConnected ? actionButton.current : backButton.current)?.focus() }}><DialogHeader><DialogTitle>{dialog === 'pay' ? 'Record payment' : 'Return this claim'}</DialogTitle><DialogDescription>{dialog === 'pay' ? `Confirm that ${money(trip.amount)} has been paid to ${trip.employee_name}. This records the payment; it does not send money.` : 'Tell the employee what needs changing before they resubmit.'}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); if (dialog) void act(dialog) }} className="mileage-dialog-form"><Field id="mileage-action-note" label={dialog === 'pay' ? 'Payment reference' : 'Reason'}><Textarea id="mileage-action-note" required maxLength={dialog === 'pay' ? 200 : 2000} value={note} onChange={e => setNote(e.target.value)} disabled={busy} /></Field>{error && <ErrorNotice>{error}</ErrorNotice>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" disabled={busy || !note.trim()}>{busy ? 'Saving…' : dialog === 'pay' ? 'Confirm payment' : 'Return claim'}</Button></DialogFooter></form></DialogContent></Dialog>
  </div>
}

function MileagePhotos({ trip }: { trip: MileageTrip }) {
  const [photos,setPhotos]=useState<MileagePhoto[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  if(!trip.evidence_ids?.length)return null
  const open=async()=>{setLoading(true);setError('');try{setPhotos(await loadMileagePhotos(trip.id))}catch(error){setError(message(error))}finally{setLoading(false)}}
  return <div className="mileage-field"><Button type="button" variant="outline" disabled={loading} onClick={()=>void open()}>{loading?'Opening photos…':photos.length?'Refresh photo links':'View odometer photos'}</Button>{error && <ErrorNotice>{error}</ErrorNotice>}<div className="mileage-fields">{photos.map(photo=><figure key={photo.id}><img className="mileage-evidence-image" src={photo.url} alt={`Odometer ${photo.kind} the trip`} /><figcaption>{photo.kind==='before'?'Before the trip':'After the trip'}</figcaption></figure>)}</div></div>
}

function MileageSettings({ context, onSaved, navigate }: { context: MileageContext; onSaved: (context: MileageContext) => void; navigate: (path: string) => void }) {
  const [approval, setApproval] = useState(context.settings.approval_required)
  const [approvers, setApprovers] = useState(context.settings.approver_ids)
  const [electric, setElectric] = useState(String(context.settings.electric_override_pence ?? ''))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [openingUser, setOpeningUser] = useState(context.users[0]?.id ?? '')
  const [year, setYear] = useState(new Date().getFullYear() - (today().slice(5) < '04-06' ? 1 : 0))
  const [miles, setMiles] = useState('')
  const lock = useRef(false)
  if (!context.admin) return <div className="md-page mileage-page"><ErrorNotice>Only administrators can change mileage settings.</ErrorNotice></div>
  const save = async (action: 'settings' | 'opening_balance') => {
    if (lock.current) return; lock.current = true; setBusy(true); setError('')
    try {
      const next = await mileageRequest<MileageContext>(action, action === 'settings' ? { version: context.settings.version, approval_required: approval, approver_ids: approvers, electric_override_pence: electric || null } : { user_id: openingUser, tax_year: year, miles: Number(miles) })
      onSaved(next); toast.success(action === 'settings' ? 'Mileage settings saved' : 'Prior mileage saved')
    } catch (error) { setError(message(error)) } finally { lock.current = false; setBusy(false) }
  }
  return <div className="md-page md-page-stack mileage-page"><header className="mileage-header"><div className="flex items-center gap-3"><Button variant="ghost" aria-label="Back to trips" onClick={() => navigate('/crm/trips')}><ArrowLeft /></Button><h1>Mileage settings</h1></div></header>{error && <ErrorNotice>{error}</ErrorNotice>}<div className="mileage-editor">
    <Surface><form className="mileage-dialog-form" onSubmit={event => { event.preventDefault(); void save('settings') }}><fieldset className="mileage-fieldset" disabled={busy}><legend>Approval</legend><label className="mileage-toggle"><Switch checked={approval} onCheckedChange={setApproval} />Require approval before payment</label><p className="mileage-hint">Applies to new submissions. Pending claims still need approval after this is switched off.</p><fieldset className="mileage-fieldset"><legend>Approvers</legend>{context.users.map(user => <label className="mileage-toggle" key={user.id}><Checkbox checked={approvers.includes(user.id)} onCheckedChange={checked => setApprovers(previous => checked === true ? [...previous, user.id] : previous.filter(id => id !== user.id))} />{user.name}</label>)}</fieldset><p className="mileage-hint">Approvers cannot approve their own claims. Workspace administrators can review other employees’ claims.</p><Field id="mileage-electric-rate" label="Electric company-car rate (optional)" hint="Pence per mile. Leave blank to use date-effective HMRC rates; an override is labelled as your workspace rate."><Input aria-describedby="mileage-electric-rate-hint" id="mileage-electric-rate" type="number" min="0.01" max="100" step="0.01" value={electric} onChange={e => setElectric(e.target.value)} /></Field></fieldset><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button></form></Surface>
    <Surface><form className="mileage-dialog-form" onSubmit={event => { event.preventDefault(); void save('opening_balance') }}><fieldset className="mileage-fieldset" disabled={busy}><legend>Prior business mileage</legend><p className="mileage-hint">Enter personal-car miles already claimed elsewhere. Set this before the employee’s first submission for the tax year.</p><Field id="mileage-opening-user" label="Employee"><Choice id="mileage-opening-user" value={openingUser} onChange={setOpeningUser} options={context.users.map(user => ({ value: user.id, label: user.name }))} /></Field><Field id="mileage-year" label="Tax year starting 6 April"><Input id="mileage-year" type="number" min={2020} max={2100} required value={year} onChange={e => setYear(Number(e.target.value))} /></Field><Field id="mileage-opening-miles" label="Prior miles"><Input id="mileage-opening-miles" type="number" min="0" max="1000000" step="0.01" required value={miles} onChange={e => setMiles(e.target.value)} /></Field><p className="mileage-hint">Saved: {context.openingBalances.find(balance => balance.user_id === openingUser && balance.tax_year === year)?.miles ?? 0} miles</p></fieldset><Button type="submit" variant="outline" disabled={busy || !openingUser}>{busy ? 'Saving…' : 'Save prior mileage'}</Button></form></Surface>
    </div></div>
}
