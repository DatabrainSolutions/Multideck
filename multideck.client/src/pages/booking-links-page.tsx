import { useCallback, useEffect, useRef, useState } from "react"
import { CalendarDays, CirclePause as Pause, CirclePlay as Play, Copy, Eye, Link2 as Link, MoreHorizontal, Plus, Trash2, TriangleAlert } from "@/components/icons/hugeicons"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { BookingHostPicker, BookingLinkKindPicker, BookingQuestionBuilder, defaultBookingQuestions } from "@/components/multideck/booking-link-builder"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { MeetingProviderMark, meetingProviderLabels } from "@/components/multideck/meeting-provider-mark"
import { PublicBookingPage } from "@/pages/public-booking-page"
import { getTenantBranding } from "@/lib/tenant-branding-api"
import { getSupabaseSession } from "@/lib/supabase"
import { summarizeAuthUser } from "@/lib/auth-user"
import type { PublicBranding } from "@/lib/public-brand-theme"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { WorkingHoursEditor, defaultWorkingHours } from "@/components/multideck/working-hours-editor"
import { bookingLinkKindLabels, createBookingLink, getCalendarWorkspace, updateBookingLink, type BookingLink, type BookingLinkKind, type BookingQuestion, type CalendarConnection, type CalendarProvider } from "@/lib/calendar-api"
import { subscribeTopBarAction, topBarActionEvents } from "@/lib/top-bar-action-events"
import { cn } from "@/lib/utils"

const providers: CalendarProvider[] = ["google_meet", "microsoft_teams", "zoom", "phone", "in_person", "multideck"]
const drawerSections = ["Details", "Form", "Availability"] as const
type DrawerSection = (typeof drawerSections)[number]
const fieldLabel = "grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]"
const compactLabel = "grid gap-1.5 text-[11px] font-medium text-[var(--md-text)]"

function providerConnected(connections: CalendarConnection[], next: CalendarProvider) {
  const code = next === "google_meet" ? "google" : next === "microsoft_teams" ? "microsoft" : next === "zoom" ? "zoom" : null
  return !code || connections.some((connection) => connection.provider === code && connection.status === "connected")
}

/** Two fields and you are in: name the link, pick how it is shared, customise afterwards. */
function NewBookingLinkDialog({ open, connections, onClose, onCreated }: { open: boolean; connections: CalendarConnection[]; onClose: () => void; onCreated: (link: BookingLink) => void }) {
  const [title, setTitle] = useState("")
  const [kind, setKind] = useState<BookingLinkKind>("one_on_one")
  const [hostUserIds, setHostUserIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const defaultProvider: CalendarProvider = providers.find((next) => next !== "multideck" && next !== "phone" && next !== "in_person" && providerConnected(connections, next)) ?? "multideck"
  useEffect(() => { if (open) { setTitle(""); setKind("one_on_one"); setHostUserIds([]); setError(null) } }, [open])
  async function create() {
    if (!title.trim()) { setError("Give the booking link a name."); return }
    if (kind !== "one_on_one" && !hostUserIds.length) { setError("Add at least one colleague to share this link."); return }
    setSaving(true); setError(null)
    try {
      const link = await createBookingLink({ title, description: null, location: null, durationMinutes: 30, provider: defaultProvider, kind, hostUserIds, questions: defaultBookingQuestions })
      toast.success("Booking link created", { description: "Now tailor the form and availability." })
      onCreated(link)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The booking link could not be created.") } finally { setSaving(false) }
  }
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose() }}>
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader><DialogTitle>New booking link</DialogTitle><DialogDescription>Name it and choose who takes the bookings. Everything else can be tuned afterwards.</DialogDescription></DialogHeader>
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void create() }}>
        <label className={fieldLabel}>Name<Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. 30-minute discovery call" className="h-10 rounded-[var(--md-radius-lg)]" /></label>
        <div className="grid gap-2"><span className="text-[12px] font-medium text-[var(--md-ink)]">Who takes bookings</span><BookingLinkKindPicker value={kind} onChange={(next) => { setKind(next); if (next === "one_on_one") setHostUserIds([]) }} /></div>
        {kind !== "one_on_one" ? <BookingHostPicker value={hostUserIds} onChange={setHostUserIds} kind={kind} provider={defaultProvider} /> : null}
        {error ? <p role="alert" className="flex gap-2 rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-red)_8%,var(--md-surface))] p-2.5 text-[11px] text-[var(--md-red)]"><TriangleAlert className="size-3.5 shrink-0" />{error}</p> : null}
        <DialogFooter><Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create and customise"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
}

function BookingLinkEditor({ open, value, connections, restoreFocusTo, navigate, onClose, onSaved }: { open: boolean; value: BookingLink | null; connections: CalendarConnection[]; restoreFocusTo?: HTMLElement | null; navigate: (path: string) => void; onClose: () => void; onSaved: (link: BookingLink) => void }) {
  const [section, setSection] = useState<DrawerSection>("Details")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [slug, setSlug] = useState("")
  const [duration, setDuration] = useState("30")
  const [kind, setKind] = useState<BookingLinkKind>("one_on_one")
  const [hostUserIds, setHostUserIds] = useState<string[]>([])
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
  const [questions, setQuestions] = useState<BookingQuestion[]>(defaultBookingQuestions)
  const [brand, setBrand] = useState<PublicBranding | null>(null)
  const [organiser, setOrganiser] = useState("")
  const [brandLoading, setBrandLoading] = useState(true)
  const [brandError, setBrandError] = useState<string | null>(null)
  const [brandAttempt, setBrandAttempt] = useState(0)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setBrandLoading(true); setBrandError(null); setBrand(null)
    void (async () => {
      const session = await getSupabaseSession()
      if (!session) throw new Error("Sign in to load the saved company branding.")
      const saved = await getTenantBranding(session.access_token)
      if (cancelled) return
      setBrand(saved.configured ? saved : null)
      setOrganiser(summarizeAuthUser(session.user).name ?? "")
    })().catch(() => {
      if (!cancelled) setBrandError("The saved company branding could not be loaded. Your form changes are still here.")
    }).finally(() => { if (!cancelled) setBrandLoading(false) })
    return () => { cancelled = true }
  }, [open, brandAttempt])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setSection("Details")
    setTitle(value?.title ?? ""); setDescription(value?.description ?? ""); setSlug(value?.slug ?? ""); setDuration(String(value?.durationMinutes ?? 30)); setProvider(value?.provider ?? "multideck"); setLocation(value?.location ?? "")
    setKind(value?.kind ?? "one_on_one"); setHostUserIds(value?.hosts.map((host) => host.userId) ?? [])
    setOverrideAvailability(Boolean(value && (value.availability || value.minimumNoticeMinutes !== null || value.bookingHorizonDays !== null || value.bufferBeforeMinutes !== null || value.bufferAfterMinutes !== null)))
    setAvailability(value?.availability ?? defaultWorkingHours)
    setMinimumNotice(String(value?.minimumNoticeMinutes ?? 120)); setHorizon(String(value?.bookingHorizonDays ?? 60)); setBufferBefore(String(value?.bufferBeforeMinutes ?? 15)); setBufferAfter(String(value?.bufferAfterMinutes ?? 15))
    setRescheduleCutoff(String(value?.rescheduleCutoffMinutes ?? 120)); setCancellationCutoff(String(value?.cancellationCutoffMinutes ?? 120))
    setQuestions(value ? value.questions ?? [] : defaultBookingQuestions)
    setError(null)
  }, [open, value])
  const connected = (next: CalendarProvider) => providerConnected(connections, next)
  const shared = kind !== "one_on_one"
  const customCount = questions.length
  const requiredCount = questions.filter((question) => question.required).length
  async function save() {
    if (!title.trim()) { setSection("Details"); setError("Add a title for this booking link."); return }
    if (!connected(provider)) { setSection("Details"); setError(`${meetingProviderLabels[provider]} needs to be connected first.`); return }
    if (shared && !hostUserIds.length) { setSection("Details"); setError("Shared booking links need at least one colleague besides you."); return }
    const blank = questions.find((question) => !question.builtIn && !question.label.trim())
    if (blank) { setSection("Form"); setError("Every custom question needs wording."); return }
    const emptyChoice = questions.find((question) => question.type === "select" && !(question.options?.length))
    if (emptyChoice) { setSection("Form"); setError(`Add at least one choice to “${emptyChoice.label}”.`); return }
    setSaving(true); setError(null)
    try {
      const input = { title, description, durationMinutes: Number(duration), provider, location, kind, hostUserIds: shared ? hostUserIds : [], questions, slug, availability: overrideAvailability ? availability : null, minimumNoticeMinutes: overrideAvailability ? Number(minimumNotice) : null, bookingHorizonDays: overrideAvailability ? Number(horizon) : null, bufferBeforeMinutes: overrideAvailability ? Number(bufferBefore) : null, bufferAfterMinutes: overrideAvailability ? Number(bufferAfter) : null, rescheduleCutoffMinutes: Number(rescheduleCutoff), cancellationCutoffMinutes: Number(cancellationCutoff) }
      const result = value ? await updateBookingLink(value.id, input) : await createBookingLink(input)
      onSaved(result); toast.success(value ? "Booking link updated" : "Booking link created"); onClose()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The booking link could not be saved.") } finally { setSaving(false) }
  }
  const cutoffOptions = [[0, "Any time"], [60, "1 hour before"], [120, "2 hours before"], [240, "4 hours before"], [1440, "1 day before"]] as const
  return <Dialog open={open} onOpenChange={(next) => { if (!next && !saving) onClose() }}>
    <DialogContent
      className={cn("flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-0", section === "Form" ? "sm:max-w-[1180px]" : "sm:max-w-[620px]")}
      showCloseButton={!saving}
      onEscapeKeyDown={(event) => { if (saving) event.preventDefault() }}
      onPointerDownOutside={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => { if (restoreFocusTo?.isConnected) { event.preventDefault(); restoreFocusTo.focus({ preventScroll: true }) } }}
    >
      <DialogHeader className="shrink-0 px-5 pt-5 pb-4 text-start">
        <p className="flex items-center gap-2 text-[11px] text-[var(--md-subtle)]"><Link className="size-3.5" />Calendar</p>
        <DialogTitle className="pe-8 text-[22px] font-medium tracking-tight">{value ? "Edit booking link" : "New booking link"}</DialogTitle>
        <DialogDescription className="text-[12px]">Shape the meeting, the questions and when people can book.</DialogDescription>
      </DialogHeader>
      <div className="shrink-0 px-5 pb-4"><SegmentedControl options={drawerSections} value={section} onChange={(next) => { setSection(next); setError(null) }} ariaLabel="Booking link settings" className="w-full [&>button]:flex-1" /></div>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-5">
      {section === "Details" ? <div className="grid gap-3">
        <div className="grid gap-4 pb-5">
          <label className={fieldLabel}>Name<Input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. 30-minute discovery call" className="h-10 rounded-[var(--md-radius-lg)]" /></label>
          <label className={fieldLabel}>Description<Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What will you cover?" className="min-h-20 rounded-[var(--md-radius-lg)]" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={fieldLabel}>Duration<Select value={duration} onValueChange={setDuration}><SelectTrigger className="h-10 rounded-[var(--md-radius-lg)]"><SelectValue /></SelectTrigger><SelectContent>{[15, 30, 45, 60, 90, 120].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>)}</SelectContent></Select></label>
            {!value ? <label className={fieldLabel}>Link address<Input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="discovery-call" className="h-10 rounded-[var(--md-radius-lg)]" /><span className="text-[10.5px] font-normal text-[var(--md-subtle)]">Leave blank to create it from the name.</span></label> : <div className={fieldLabel}>Link address<p className="flex h-10 items-center truncate rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[12px] font-normal text-[var(--md-text)]">{value.path}</p></div>}
          </div>
        </div>
        <div className="grid gap-3 py-4 shadow-[var(--md-stroke-top)]">
          <div><p className="text-[12px] font-medium text-[var(--md-ink)]">Who takes bookings</p><p className="mt-1 text-[11px] leading-5 text-[var(--md-subtle)]">{shared ? kind === "round_robin" ? "Visitors see every host's free time. The least-booked free host takes each meeting." : "Visitors only see times when every host is free, and everyone is invited." : "Only your free time is offered."}</p></div>
          <BookingLinkKindPicker value={kind} onChange={(next) => { setKind(next); if (next === "one_on_one") setHostUserIds([]) }} />
          {shared ? <BookingHostPicker value={hostUserIds} onChange={setHostUserIds} kind={kind} provider={provider} /> : null}
        </div>
        <div className="py-4 shadow-[var(--md-stroke-top)]">
          <p className="text-[12px] font-medium text-[var(--md-ink)]">Meeting provider</p><p className="mt-1 text-[11px] leading-5 text-[var(--md-subtle)]">The visitor sees one native booking flow. The provider only supplies the join details.</p>
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">{providers.map((next) => <button key={next} type="button" aria-pressed={provider === next} aria-label={`${meetingProviderLabels[next]}${connected(next) ? "" : ", not connected"}`} onClick={() => connected(next) ? setProvider(next) : setError(`${meetingProviderLabels[next]} is not connected. Open Settings → Integrations first.`)} className={cn("flex min-h-10 items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-2.5 text-start text-[11px] text-[var(--md-text)] transition-colors hover:bg-[var(--md-hover)]", provider === next && "bg-[var(--md-accent-a10)] text-[var(--md-ink)] shadow-[inset_0_0_0_1px_var(--md-accent-a28)] hover:bg-[var(--md-accent-a10)]", !connected(next) && "opacity-55")}><MeetingProviderMark provider={next} /><span className="truncate">{meetingProviderLabels[next]}</span></button>)}</div>
          {(provider === "phone" || provider === "in_person") ? <label className={cn(fieldLabel, "mt-3")}>{provider === "phone" ? "Phone number" : "Location"}<Input value={location} onChange={(event) => setLocation(event.target.value)} className="h-10 rounded-[var(--md-radius-lg)]" /></label> : null}
        </div>
      </div> : null}
      {section === "Form" ? <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section aria-label="Form settings" className="min-w-0 py-1">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[14px] font-medium text-[var(--md-ink)]">Booking form</p><p className="mt-1 text-[11px] leading-5 text-[var(--md-subtle)]">Ask only for what the meeting needs. Required answers block the booking until filled in.</p></div><p className="shrink-0 text-[10.5px] tabular-nums text-[var(--md-subtle)]">{customCount} question{customCount === 1 ? "" : "s"} · {requiredCount} required</p></div>
        <BookingQuestionBuilder value={questions} onChange={setQuestions} disabled={saving} className="mt-3" />
        <p className="mt-3 text-[10.5px] leading-5 text-[var(--md-subtle)]">A selected time is held for ten minutes while the visitor verifies their email.</p>
        </section>
        <section aria-label="Live booking form preview" className="min-w-0 overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div><p className="text-[12px] font-medium text-[var(--md-ink)]">Live preview</p><p className="mt-0.5 text-[10.5px] text-[var(--md-subtle)]">Customer form · optional fields expanded</p></div>
            {!brandLoading && !brandError ? <span className="text-[10.5px] text-[var(--md-subtle)]">{brand ? brand.displayName : "Multideck default"}</span> : null}
          </div>
          {brandLoading ? <div className="grid min-h-72 place-items-center"><DotGridLoader label="Loading company branding…" /></div>
            : brandError ? <div role="alert" className="grid gap-3 p-5 text-[12px] text-[var(--md-text)]"><p>{brandError}</p><Button variant="outline" className="w-fit" onClick={() => setBrandAttempt((attempt) => attempt + 1)}>Try again</Button></div>
            : <PublicBookingPage organiserSlug="" bookingSlug="" preview={{ title: title || "Meeting name", description, durationMinutes: Number(duration), provider, location, questions, kind, organiser: { name: organiser }, hostNames: value?.hosts.filter((host) => hostUserIds.includes(host.userId)).map((host) => host.name), status: "preview", branding: brand, workspaceName: brand?.displayName ?? "Multideck" }} />}
        </section>
      </div> : null}
      {section === "Availability" ? <div className="grid gap-3">
        <div className="py-4 shadow-[var(--md-stroke-top)]">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[12px] font-medium text-[var(--md-ink)]">Available times</p><p className="mt-1 text-[11px] leading-5 text-[var(--md-subtle)]">{shared ? "Each host's own " : "Inherit from your "}<button type="button" onClick={() => navigate("/settings?tab=availability")} className="font-medium text-[var(--md-accent)] hover:underline">availability settings</button>{shared ? " apply. Tailored hours below narrow every host." : ", or tailor this meeting type."}</p></div><Switch checked={overrideAvailability} onCheckedChange={setOverrideAvailability} aria-label="Override availability for this link" /></div>
          {overrideAvailability ? <div className="mt-4 grid gap-2">
            <WorkingHoursEditor value={availability} onChange={setAvailability} className="-mx-2" />
            <div className="mt-2 grid gap-3 sm:grid-cols-2"><label className={compactLabel}>Minimum notice<Select value={minimumNotice} onValueChange={setMinimumNotice}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{[[0,"None"],[60,"1 hour"],[120,"2 hours"],[240,"4 hours"],[1440,"1 day"]].map(([minutes,label]) => <SelectItem key={minutes} value={String(minutes)}>{label}</SelectItem>)}</SelectContent></Select></label><label className={compactLabel}>Booking horizon<Select value={horizon} onValueChange={setHorizon}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{[14,30,60,90,180].map((days) => <SelectItem key={days} value={String(days)}>{days} days</SelectItem>)}</SelectContent></Select></label><label className={compactLabel}>Buffer before<Select value={bufferBefore} onValueChange={setBufferBefore}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{[0,10,15,30,60].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes ? `${minutes} minutes` : "None"}</SelectItem>)}</SelectContent></Select></label><label className={compactLabel}>Buffer after<Select value={bufferAfter} onValueChange={setBufferAfter}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{[0,10,15,30,60].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes ? `${minutes} minutes` : "None"}</SelectItem>)}</SelectContent></Select></label></div>
          </div> : null}
        </div>
        <div className="py-4 shadow-[var(--md-stroke-top)]"><p className="text-[12px] font-medium text-[var(--md-ink)]">Changes and cancellations</p><p className="mt-1 text-[11px] leading-5 text-[var(--md-subtle)]">How close to the meeting an attendee may make a self-service change.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className={compactLabel}>Reschedule cut-off<Select value={rescheduleCutoff} onValueChange={setRescheduleCutoff}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{cutoffOptions.map(([minutes,label]) => <SelectItem key={minutes} value={String(minutes)}>{label}</SelectItem>)}</SelectContent></Select></label><label className={compactLabel}>Cancellation cut-off<Select value={cancellationCutoff} onValueChange={setCancellationCutoff}><SelectTrigger className="h-9 rounded-[var(--md-radius-md)]"><SelectValue /></SelectTrigger><SelectContent>{cutoffOptions.map(([minutes,label]) => <SelectItem key={minutes} value={String(minutes)}>{label}</SelectItem>)}</SelectContent></Select></label></div></div>
      </div> : null}
      </div>
      <div className="shrink-0 px-5 py-4 shadow-[var(--md-stroke-top)]">
      {error ? <div role="alert" className="flex gap-2 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red)_8%,var(--md-surface))] p-3 text-[11px] text-[var(--md-red)]"><TriangleAlert className="size-3.5 shrink-0" />{error}</div> : null}
      <div className={cn("flex justify-end gap-2", error && "mt-3")}><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : value ? "Save changes" : "Create booking link"}</Button></div>
    </div>
    </DialogContent>
  </Dialog>
}

export function BookingLinksPage({ navigate }: { navigate: (path: string) => void }) {
  const [links, setLinks] = useState<BookingLink[]>([])
  const [connections, setConnections] = useState<CalendarConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<BookingLink | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BookingLink | null>(null)
  const [deleting, setDeleting] = useState(false)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const load = useCallback(() => { setLoading(true); setError(null); const now = new Date(); void getCalendarWorkspace(now.toISOString(), new Date(now.getTime() + 86_400_000).toISOString()).then((workspace) => { setLinks(workspace.bookingLinks); setConnections(workspace.connections) }).catch((reason) => setError(reason instanceof Error ? reason.message : "Booking links could not be loaded.")).finally(() => setLoading(false)) }, [])
  const openDrawer = useCallback((link: BookingLink | null) => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    setEditing(link)
    setDrawerOpen(true)
  }, [])
  const startCreate = useCallback(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
    setCreating(true)
  }, [])
  const upsert = useCallback((link: BookingLink) => setLinks((current) => current.some((item) => item.id === link.id) ? current.map((item) => item.id === link.id ? link : item) : [link, ...current]), [])
  useEffect(load, [load])
  useEffect(() => subscribeTopBarAction(topBarActionEvents.createBookingLink, startCreate), [startCreate])
  async function copy(link: BookingLink) { await navigator.clipboard.writeText(`${window.location.origin}${link.path}`); toast.success("Booking link copied", { description: "It is ready to paste into an email or message." }) }
  async function toggle(link: BookingLink) { try { const result = await updateBookingLink(link.id, { status: link.status === "active" ? "paused" : "active" }); setLinks((current) => current.map((item) => item.id === result.id ? result : item)); toast.success(result.status === "active" ? "Booking link is active" : "Booking link paused") } catch (reason) { toast.error(reason instanceof Error ? reason.message : "The booking link could not be changed.") } }
  async function deleteLink() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      // Soft-delete using the existing API status so past meetings keep their source history.
      await updateBookingLink(deleteTarget.id, { status: "archived" })
      setLinks((current) => current.filter((item) => item.id !== deleteTarget.id))
      toast.success("Booking link deleted", { description: "Its public page is no longer available." })
      setDeleteTarget(null)
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "The booking link could not be deleted.")
    } finally {
      setDeleting(false)
    }
  }
  return <main className="grid gap-[var(--md-page-stack-gap)]"><section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-medium uppercase tracking-[.08em] text-[var(--md-subtle)]">Calendar</p><h1 className="mt-1 text-[24px] font-medium tracking-[-.02em] text-[var(--md-ink)]">Booking links</h1><p className="mt-1 max-w-2xl text-[13px] leading-6 text-[var(--md-text)]">Reusable personal meeting types that only offer times you are genuinely free.</p></div><Button variant="ghost" onClick={() => navigate("/calendar")} className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"><CalendarDays className="size-3.5" />Back to Calendar</Button></section>
    {loading ? <div className="grid min-h-72 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"><DotGridLoader label="Loading booking links…" /></div> : error ? <div role="alert" className="grid min-h-64 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-8 text-center shadow-[var(--md-shadow-line)]"><div><TriangleAlert className="mx-auto size-5 text-[var(--md-red)]" /><p className="mt-3 text-[12px] text-[var(--md-text)]">{error}</p><Button className="mt-4" onClick={load}>Try again</Button></div></div> : !links.length ? <div className="grid min-h-72 place-items-center rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-8 text-center shadow-[var(--md-shadow-line)]"><div className="max-w-sm"><Link className="mx-auto size-6 text-[var(--md-accent)]" /><p className="mt-4 text-[14px] font-medium text-[var(--md-ink)]">No booking links yet</p><p className="mt-2 text-[12px] leading-5 text-[var(--md-subtle)]">Create a meeting type once, then share a company-branded link whenever someone needs time with you.</p><Button className="mt-5" onClick={startCreate}><Plus className="size-4" />New booking link</Button></div></div> : <div className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"><div className="hidden grid-cols-[minmax(0,1fr)_150px_90px_150px_120px_310px] gap-3 border-b border-[var(--md-line)] px-4 py-3 text-[10px] font-medium uppercase tracking-[.06em] text-[var(--md-subtle)] lg:grid"><span>Booking link</span><span>Hosts</span><span>Duration</span><span>Provider</span><span>Status</span><span className="text-end">Actions</span></div><div className="divide-y divide-[var(--md-line)]">{links.map((link) => <article key={link.id} className="grid gap-3 px-4 py-4 transition-colors hover:bg-[var(--md-hover)] lg:grid-cols-[minmax(0,1fr)_150px_90px_150px_120px_310px] lg:items-center"><div className="min-w-0"><p className="truncate text-[13px] font-medium text-[var(--md-ink)]">{link.title}</p><p className="mt-1 truncate text-[10.5px] text-[var(--md-subtle)]">{link.path}</p></div><div className="min-w-0 text-[11px] text-[var(--md-text)]"><p className="truncate">{bookingLinkKindLabels[link.kind].label}</p>{link.kind !== "one_on_one" ? <p className="mt-0.5 truncate text-[10.5px] text-[var(--md-subtle)]">{link.hosts.length} host{link.hosts.length === 1 ? "" : "s"} · {link.hosts.map((host) => host.name.split(" ")[0]).join(", ")}</p> : null}</div><p className="text-[11px] tabular-nums text-[var(--md-text)]">{link.durationMinutes} min</p><div className="flex items-center gap-2 text-[11px] text-[var(--md-text)]"><MeetingProviderMark provider={link.provider} className="size-4" />{meetingProviderLabels[link.provider]}</div><span className={cn("w-fit rounded-full px-2 py-1 text-[10px] font-medium capitalize", link.status === "active" ? "bg-[var(--md-accent-a10)] text-[var(--md-accent)]" : "bg-[var(--md-surface-tint)] text-[var(--md-subtle)]")}>{link.status}</span><div className="flex flex-wrap justify-start gap-1.5 lg:justify-end"><Button variant="ghost" size="sm" onClick={() => void copy(link)} className="h-8 rounded-[var(--md-radius-md)]"><Copy className="size-3.5" />Copy link</Button><Button variant="ghost" size="sm" onClick={() => navigate(link.path)} className="h-8 rounded-[var(--md-radius-md)]"><Eye className="size-3.5" />Preview</Button><Button variant="ghost" size="sm" onClick={() => openDrawer(link)} className="h-8 rounded-[var(--md-radius-md)]">Edit</Button><Button variant="ghost" size="icon" aria-label={link.status === "active" ? "Pause booking link" : "Activate booking link"} onClick={() => void toggle(link)} className="size-8 rounded-[var(--md-radius-md)]">{link.status === "active" ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}</Button><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More booking link actions" className="size-8 rounded-[var(--md-radius-md)]"><MoreHorizontal className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem variant="destructive" onSelect={() => setDeleteTarget(link)}><Trash2 className="size-3.5" />Delete booking link</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></article>)}</div></div>}
    <NewBookingLinkDialog open={creating} connections={connections} onClose={() => setCreating(false)} onCreated={(link) => { upsert(link); setCreating(false); setEditing(link); setDrawerOpen(true) }} />
    <BookingLinkEditor open={drawerOpen} value={editing} connections={connections} restoreFocusTo={restoreFocusRef.current} navigate={navigate} onClose={() => setDrawerOpen(false)} onSaved={upsert} />
    <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !deleting) setDeleteTarget(null) }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle>Delete this booking link?</DialogTitle><DialogDescription>People with the link will no longer be able to book it. Existing meetings are unchanged.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>Keep booking link</Button><Button variant="destructive" onClick={() => void deleteLink()} disabled={deleting}>{deleting ? "Deleting…" : "Delete booking link"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </main>
}
