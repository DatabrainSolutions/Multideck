import { useCallback, useEffect, useRef, useState } from "react"
import { Archive, CalendarDays, CirclePause as Pause, CirclePlay as Play, Copy, Eye, Link2 as Link, MoreHorizontal, Plus, Trash2, TriangleAlert } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { MeetingProviderMark, meetingProviderLabels } from "@/components/multideck/meeting-provider-mark"
import { SideDrawer } from "@/components/multideck/side-drawer"
import { WorkingHoursEditor, defaultWorkingHours } from "@/components/multideck/working-hours-editor"
import { createBookingLink, getCalendarWorkspace, updateBookingLink, type BookingLink, type BookingQuestion, type CalendarConnection, type CalendarProvider } from "@/lib/calendar-api"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { cn } from "@/lib/utils"

const providers: CalendarProvider[] = ["google_meet", "microsoft_teams", "zoom", "phone", "in_person", "multideck"]
const builtInQuestions: BookingQuestion[] = [
  { id: "company", label: "Company", type: "short_text", builtIn: true },
  { id: "phone", label: "Phone", type: "short_text", builtIn: true },
  { id: "notes", label: "What would you like to discuss?", type: "long_text", builtIn: true },
]

function BookingLinkDrawer({ open, value, connections, restoreFocusTo, navigate, onClose, onSaved }: { open: boolean; value: BookingLink | null; connections: CalendarConnection[]; restoreFocusTo?: HTMLElement | null; navigate: (path: string) => void; onClose: () => void; onSaved: (link: BookingLink) => void }) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [slug, setSlug] = useState("")
  const [duration, setDuration] = useState("30")
  const [provider, setProvider] = useState<CalendarProvider>("multideck")
  const [location, setLocation] = useState("")
  const [overrideAvailability, setOverrideAvailability] = useState(false)
  const [availability, setAvailability] = useState<NonNullable<BookingLink["availability"]>>(defaultWorkingHours)
  const [minimumNotice, setMinimumNotice] = useState("120")
  const [horizon, setHorizon] = useState("60")
  const [bufferBefore, setBufferBefore] = useState("15")
  const [bufferAfter, setBufferAfter] = useState("15")
  const [rescheduleCutoff, setRescheduleCutoff] = useState("120")
  const [cancellationCutoff, setCancellationCutoff] = useState("120")
  const [questions, setQuestions] = useState<BookingQuestion[]>(builtInQuestions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setTitle(value?.title ?? ""); setDescription(value?.description ?? ""); setSlug(value?.slug ?? ""); setDuration(String(value?.durationMinutes ?? 30)); setProvider(value?.provider ?? "multideck"); setLocation(value?.location ?? "")
    setOverrideAvailability(Boolean(value && (value.availability || value.minimumNoticeMinutes !== null || value.bookingHorizonDays !== null || value.bufferBeforeMinutes !== null || value.bufferAfterMinutes !== null)))
    setAvailability(value?.availability ?? defaultWorkingHours)
    setMinimumNotice(String(value?.minimumNoticeMinutes ?? 120)); setHorizon(String(value?.bookingHorizonDays ?? 60)); setBufferBefore(String(value?.bufferBeforeMinutes ?? 15)); setBufferAfter(String(value?.bufferAfterMinutes ?? 15))
    setRescheduleCutoff(String(value?.rescheduleCutoffMinutes ?? 120)); setCancellationCutoff(String(value?.cancellationCutoffMinutes ?? 120))
    setQuestions(value ? value.questions ?? [] : builtInQuestions)
    setError(null)
  }, [open, value])
  function connected(next: CalendarProvider) { const code = next === "google_meet" ? "google" : next === "microsoft_teams" ? "microsoft" : next === "zoom" ? "zoom" : null; return !code || connections.some((connection) => connection.provider === code && connection.status === "connected") }
  function toggleQuestion(question: BookingQuestion, enabled: boolean) {
    setQuestions((current) => enabled ? [...current.filter((item) => item.id !== question.id), question] : current.filter((item) => item.id !== question.id))
  }
  function patchQuestion(id: string, patch: Partial<BookingQuestion>) {
    setQuestions((current) => current.map((question) => question.id === id ? { ...question, ...patch } : question))
  }
  function addQuestion() {
    setQuestions((current) => [...current, { id: `question-${crypto.randomUUID().slice(0, 8)}`, label: "", type: "short_text", required: false }])
  }
  async function save() {
    if (!title.trim()) { setError("Add a title for this booking link."); return }
    if (!connected(provider)) { setError(`${meetingProviderLabels[provider]} needs to be connected first.`); return }
    setSaving(true); setError(null)
    try {
      const input = { title, description, durationMinutes: Number(duration), provider, location, questions, slug, availability: overrideAvailability ? availability : null, minimumNoticeMinutes: overrideAvailability ? Number(minimumNotice) : null, bookingHorizonDays: overrideAvailability ? Number(horizon) : null, bufferBeforeMinutes: overrideAvailability ? Number(bufferBefore) : null, bufferAfterMinutes: overrideAvailability ? Number(bufferAfter) : null, rescheduleCutoffMinutes: Number(rescheduleCutoff), cancellationCutoffMinutes: Number(cancellationCutoff) }
      const result = value ? await updateBookingLink(value.id, input) : await createBookingLink(input)
      onSaved(result); toast.success(value ? "Booking link updated" : "Booking link created"); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The booking link could not be saved.") } finally { setSaving(false) }
  }
  return <SideDrawer open={open} onClose={onClose} eyebrow="Calendar" title={value ? "Edit booking link" : "New booking link"} icon={Link} restoreFocusTo={restoreFocusTo}>
    <div className="grid gap-3"><div className="grid gap-4 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]"><label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">Meeting title<Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. 30-minute discovery call" className="h-10 rounded-[var(--md-radius-lg)]" /></label><label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">Description<Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will you cover?" className="min-h-24 rounded-[var(--md-radius-lg)]" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">Duration<Select value={duration} onValueChange={setDuration}><SelectTrigger className="h-10 rounded-[var(--md-radius-lg)]"><SelectValue /></SelectTrigger><SelectContent>{[15, 30, 45, 60, 90, 120].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>)}</SelectContent></Select></label>{!value ? <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">Link address<Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="discovery-call" className="h-10 rounded-[var(--md-radius-lg)]" /><span className="text-[10.5px] font-normal text-[var(--md-subtle)]">Leave blank to create it from the title.</span></label> : null}</div></div>
      <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]"><p className="text-[12px] font-medium text-[var(--md-ink)]">Meeting type</p><p className="mt-1 text-[11px] leading-5 text-[var(--md-subtle)]">The visitor sees one native booking flow. The provider only supplies the join details.</p><div className="mt-3 grid grid-cols-2 gap-2">{providers.map((next) => <button key={next} type="button" aria-pressed={provider === next} aria-label={`${meetingProviderLabels[next]}${connected(next) ? "" : ", not connected"}`} onClick={() => connected(next) ? setProvider(next) : setError(`${meetingProviderLabels[next]} is not connected. Open Settings → Integrations first.`)} className={cn("flex min-h-11 items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-start text-[11px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]", provider === next && "bg-[var(--md-accent-a10)] text-[var(--md-ink)] shadow-[inset_0_0_0_1px_var(--md-accent-a28)]", !connected(next) && "opacity-55")}><MeetingProviderMark provider={next} /><span className="truncate">{meetingProviderLabels[next]}</span></button>)}</div>{(provider === "phone" || provider === "in_person") ? <label className="mt-3 grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">{provider === "phone" ? "Phone number" : "Location"}<Input value={location} onChange={(event) => setLocation(event.target.value)} className="h-10 rounded-[var(--md-radius-lg)]" /></label> : null}</div>
      <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[12px] font-medium text-[var(--md-ink)]">Available times</p><p className="mt-1 text-[11px] leading-5 text-[var(--md-subtle)]">Inherit from your <button type="button" onClick={() => navigate("/settings?tab=availability")} className="font-medium text-[var(--md-accent)] hover:underline">availability settings</button>, or tailor this meeting type.</p></div><Switch checked={overrideAvailability} onCheckedChange={setOverrideAvailability} aria-label="Override your availability for this link" /></div>
        {overrideAvailability ? <div className="mt-4 grid gap-2">
          <WorkingHoursEditor value={availability} onChange={setAvailability} className="-mx-2" />
          <div className="mt-2 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-[11px] font-medium text-[var(--md-text)]">Minimum notice<Select value={minimumNotice} onValueChange={setMinimumNotice}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{[[0,"None"],[60,"1 hour"],[120,"2 hours"],[240,"4 hours"],[1440,"1 day"]].map(([minutes,label]) => <SelectItem key={minutes} value={String(minutes)}>{label}</SelectItem>)}</SelectContent></Select></label><label className="grid gap-1.5 text-[11px] font-medium text-[var(--md-text)]">Booking horizon<Select value={horizon} onValueChange={setHorizon}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{[14,30,60,90,180].map((days) => <SelectItem key={days} value={String(days)}>{days} days</SelectItem>)}</SelectContent></Select></label><label className="grid gap-1.5 text-[11px] font-medium text-[var(--md-text)]">Buffer before<Select value={bufferBefore} onValueChange={setBufferBefore}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{[0,10,15,30,60].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes ? `${minutes} minutes` : "None"}</SelectItem>)}</SelectContent></Select></label><label className="grid gap-1.5 text-[11px] font-medium text-[var(--md-text)]">Buffer after<Select value={bufferAfter} onValueChange={setBufferAfter}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{[0,10,15,30,60].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes ? `${minutes} minutes` : "None"}</SelectItem>)}</SelectContent></Select></label></div>
        </div> : null}
      </div>
      <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]">
        <p className="text-[12px] font-medium text-[var(--md-ink)]">Visitor details</p><p className="mt-1 text-[11px] leading-5 text-[var(--md-subtle)]">Name and email are always required. Ask only for what the meeting needs.</p>
        <div className="mt-3 grid gap-2">{builtInQuestions.map((question) => { const selected = questions.find((item) => item.id === question.id); return <div key={question.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2.5"><span className="text-[11px] font-medium text-[var(--md-text)]">{question.label}</span><label className="flex items-center gap-2 text-[10.5px] text-[var(--md-subtle)]"><Switch size="sm" aria-label={`Require ${question.label}`} checked={Boolean(selected?.required)} disabled={!selected} onCheckedChange={(required) => selected && patchQuestion(question.id, { required })} />Required</label><Switch checked={Boolean(selected)} onCheckedChange={(enabled) => toggleQuestion(question, enabled)} aria-label={`Ask for ${question.label}`} /></div> })}</div>
        <div className="mt-3 grid gap-2">{questions.filter((question) => !question.builtIn).map((question) => <div key={question.id} className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 sm:grid-cols-[1fr_116px_auto_auto] sm:items-center"><Input aria-label="Question label" value={question.label} onChange={(event) => patchQuestion(question.id, { label: event.target.value })} placeholder="Question" className="h-9 rounded-[var(--md-radius-md)]" /><Select value={question.type ?? "short_text"} onValueChange={(type) => patchQuestion(question.id, { type: type as BookingQuestion["type"] })}><SelectTrigger aria-label={`${question.label || "Question"} answer type`} className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="short_text">Short answer</SelectItem><SelectItem value="long_text">Long answer</SelectItem></SelectContent></Select><label className="flex items-center gap-2 text-[10.5px] text-[var(--md-subtle)]"><Switch size="sm" aria-label={`Require ${question.label || "this question"}`} checked={Boolean(question.required)} onCheckedChange={(required) => patchQuestion(question.id, { required })} />Required</label><Button type="button" variant="ghost" size="icon" aria-label={`Remove ${question.label || "question"}`} className="size-8 rounded-[var(--md-radius-md)]" onClick={() => setQuestions((current) => current.filter((item) => item.id !== question.id))}><Trash2 className="size-3.5" /></Button></div>)}</div>
        <Button type="button" variant="ghost" size="sm" onClick={addQuestion} disabled={questions.length >= 10} className="mt-3 h-8 rounded-[var(--md-radius-md)]"><Plus className="size-3.5" />Add question</Button><p className="mt-3 text-[10.5px] leading-5 text-[var(--md-subtle)]">A selected time is held for ten minutes while the visitor verifies their email.</p>
      </div>
      <div className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-line)]"><p className="text-[12px] font-medium text-[var(--md-ink)]">Changes and cancellations</p><p className="mt-1 text-[11px] leading-5 text-[var(--md-subtle)]">Choose how close to the meeting an attendee may make a self-service change.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-[11px] font-medium text-[var(--md-text)]">Reschedule cut-off<Select value={rescheduleCutoff} onValueChange={setRescheduleCutoff}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{[[0,"Any time"],[60,"1 hour before"],[120,"2 hours before"],[240,"4 hours before"],[1440,"1 day before"]].map(([minutes,label]) => <SelectItem key={minutes} value={String(minutes)}>{label}</SelectItem>)}</SelectContent></Select></label><label className="grid gap-1.5 text-[11px] font-medium text-[var(--md-text)]">Cancellation cut-off<Select value={cancellationCutoff} onValueChange={setCancellationCutoff}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{[[0,"Any time"],[60,"1 hour before"],[120,"2 hours before"],[240,"4 hours before"],[1440,"1 day before"]].map(([minutes,label]) => <SelectItem key={minutes} value={String(minutes)}>{label}</SelectItem>)}</SelectContent></Select></label></div></div>
      {error ? <div role="alert" className="flex gap-2 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_8%,var(--md-surface))] p-3 text-[11px] text-[var(--md-red)]"><TriangleAlert className="size-3.5 shrink-0" />{error}</div> : null}<div className="sticky bottom-0 flex justify-end gap-2 rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_94%,transparent)] p-2 shadow-[var(--md-shadow-line)] backdrop-blur-xl"><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : value ? "Save changes" : "Create booking link"}</Button></div></div>
  </SideDrawer>
}

export function BookingLinksPage({ navigate }: { navigate: (path: string) => void }) {
  const [links, setLinks] = useState<BookingLink[]>([])
  const [connections, setConnections] = useState<CalendarConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<BookingLink | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<BookingLink | null>(null)
  const [archiving, setArchiving] = useState(false)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const load = useCallback(() => { setLoading(true); setError(null); const now = new Date(); void getCalendarWorkspace(now.toISOString(), new Date(now.getTime() + 86_400_000).toISOString()).then((workspace) => { setLinks(workspace.bookingLinks); setConnections(workspace.connections) }).catch((reason) => setError(reason instanceof Error ? reason.message : "Booking links could not be loaded.")).finally(() => setLoading(false)) }, [])
  const openDrawer = useCallback((link: BookingLink | null) => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    setEditing(link)
    setDrawerOpen(true)
  }, [])
  useEffect(load, [load])
  useEffect(() => subscribeTopBarAction(topBarActionEvents.createBookingLink, () => openDrawer(null)), [openDrawer])
  async function copy(link: BookingLink) { await navigator.clipboard.writeText(`${window.location.origin}${link.path}`); toast.success("Booking link copied", { description: "It is ready to paste into an email or message." }) }
  async function toggle(link: BookingLink) { try { const result = await updateBookingLink(link.id, { status: link.status === "active" ? "paused" : "active" }); setLinks((current) => current.map((item) => item.id === result.id ? result : item)); toast.success(result.status === "active" ? "Booking link is active" : "Booking link paused") } catch (reason) { toast.error(reason instanceof Error ? reason.message : "The booking link could not be changed.") } }
  async function archive() {
    if (!archiveTarget) return
    setArchiving(true)
    try {
      await updateBookingLink(archiveTarget.id, { status: "archived" })
      setLinks((current) => current.filter((item) => item.id !== archiveTarget.id))
      toast.success("Booking link archived", { description: "Its public page is no longer available." })
      setArchiveTarget(null)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The booking link could not be archived.")
    } finally {
      setArchiving(false)
    }
  }
  return <main className="grid gap-[var(--md-page-stack-gap)]"><section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-medium uppercase tracking-[.08em] text-[var(--md-subtle)]">Calendar</p><h1 className="mt-1 text-[24px] font-medium tracking-[-.02em] text-[var(--md-ink)]">Booking links</h1><p className="mt-1 max-w-2xl text-[13px] leading-6 text-[var(--md-text)]">Reusable personal meeting types that only offer times you are genuinely free.</p></div><Button variant="ghost" onClick={() => navigate("/calendar")} className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"><CalendarDays className="size-3.5" />Back to Calendar</Button></section>
    {loading ? <div className="grid min-h-72 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"><DotGridLoader label="Loading booking links…" /></div> : error ? <div role="alert" className="grid min-h-64 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-8 text-center shadow-[var(--md-shadow-line)]"><div><TriangleAlert className="mx-auto size-5 text-[var(--md-red)]" /><p className="mt-3 text-[12px] text-[var(--md-text)]">{error}</p><Button className="mt-4" onClick={load}>Try again</Button></div></div> : !links.length ? <div className="grid min-h-72 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-8 text-center shadow-[var(--md-shadow-line)]"><div className="max-w-sm"><Link className="mx-auto size-6 text-[var(--md-accent)]" /><p className="mt-4 text-[14px] font-medium text-[var(--md-ink)]">No booking links yet</p><p className="mt-2 text-[12px] leading-5 text-[var(--md-subtle)]">Create a meeting type once, then share a company-branded link whenever someone needs time with you.</p><Button className="mt-5" onClick={() => openDrawer(null)}><Plus className="size-4" />New booking link</Button></div></div> : <div className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"><div className="hidden grid-cols-[minmax(0,1fr)_90px_150px_120px_310px] gap-3 border-b border-[var(--md-line)] px-4 py-3 text-[10px] font-medium uppercase tracking-[.06em] text-[var(--md-subtle)] lg:grid"><span>Meeting type</span><span>Duration</span><span>Provider</span><span>Status</span><span className="text-end">Actions</span></div><div className="divide-y divide-[var(--md-line)]">{links.map((link) => <article key={link.id} className="grid gap-3 px-4 py-4 transition-colors hover:bg-[var(--md-hover)] lg:grid-cols-[minmax(0,1fr)_90px_150px_120px_310px] lg:items-center"><div className="min-w-0"><p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{link.title}</p><p className="mt-1 truncate text-[10.5px] text-[var(--md-subtle)]">{link.path}</p></div><p className="text-[11px] tabular-nums text-[var(--md-text)]">{link.durationMinutes} min</p><div className="flex items-center gap-2 text-[11px] text-[var(--md-text)]"><MeetingProviderMark provider={link.provider} className="size-4" />{meetingProviderLabels[link.provider]}</div><span className={cn("w-fit rounded-full px-2 py-1 text-[10px] font-medium capitalize", link.status === "active" ? "bg-[var(--md-accent-a10)] text-[var(--md-accent)]" : "bg-[var(--md-surface-tint)] text-[var(--md-subtle)]")}>{link.status}</span><div className="flex flex-wrap justify-start gap-1.5 lg:justify-end"><Button variant="ghost" size="sm" onClick={() => void copy(link)} className="h-8 rounded-[var(--md-radius-md)]"><Copy className="size-3.5" />Copy link</Button><Button variant="ghost" size="sm" onClick={() => navigate(link.path)} className="h-8 rounded-[var(--md-radius-md)]"><Eye className="size-3.5" />Preview</Button><Button variant="ghost" size="sm" onClick={() => openDrawer(link)} className="h-8 rounded-[var(--md-radius-md)]">Edit</Button><Button variant="ghost" size="icon" aria-label={link.status === "active" ? "Pause booking link" : "Activate booking link"} onClick={() => void toggle(link)} className="size-8 rounded-[var(--md-radius-md)]">{link.status === "active" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More booking link actions" className="size-8 rounded-[var(--md-radius-md)]"><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem variant="destructive" onSelect={() => setArchiveTarget(link)}><Archive className="size-3.5" />Archive booking link</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></article>)}</div></div>}
    <BookingLinkDrawer open={drawerOpen} value={editing} connections={connections} restoreFocusTo={restoreFocusRef.current} navigate={navigate} onClose={() => setDrawerOpen(false)} onSaved={(link) => setLinks((current) => current.some((item) => item.id === link.id) ? current.map((item) => item.id === link.id ? link : item) : [link, ...current])} />
    <Dialog open={Boolean(archiveTarget)} onOpenChange={(open) => { if (!open && !archiving) setArchiveTarget(null) }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle>Archive this booking link?</DialogTitle><DialogDescription>People with the link will no longer be able to book it. Existing meetings are unchanged.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setArchiveTarget(null)} disabled={archiving}>Keep booking link</Button><Button variant="destructive" onClick={() => void archive()} disabled={archiving}>{archiving ? "Archiving…" : "Archive booking link"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
}
