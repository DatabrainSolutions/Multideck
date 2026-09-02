import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Check, Clock3, ExternalLink, RefreshCw, ShieldCheck, Trash2, TriangleAlert, Video } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { AvailabilityPicker } from "@/components/multideck/availability-picker"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { MeetingProviderMark, meetingProviderLabels } from "@/components/multideck/meeting-provider-mark"
import { PublicBrandIdentity } from "@/components/multideck/public-brand-identity"
import { downloadMeetingCalendarFile, getManagedMeeting, getManagedMeetingSlots, manageMeeting, type ManagedMeeting } from "@/lib/calendar-api"
import { publicBrandTheme } from "@/lib/public-brand-theme"
import { startPublicBrandRefresh } from "@/lib/public-brand-refresh"

export function MeetingManagePage({ token }: { token: string }) {
  const [state, setState] = useState<ManagedMeeting | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [slots, setSlots] = useState<string[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [alternatives, setAlternatives] = useState<string[]>([])

  function load() {
    setLoading(true); setError(null)
    void getManagedMeeting(token).then(setState).catch((reason) => setError(reason instanceof Error ? reason.message : "This meeting could not be loaded.")).finally(() => setLoading(false))
  }
  useEffect(load, [token])

  const meetingLoaded = Boolean(state)
  useEffect(() => {
    if (!meetingLoaded) return
    return startPublicBrandRefresh(
      () => getManagedMeeting(token),
      ({ branding }) => setState((current) => current && JSON.stringify(current.branding) !== JSON.stringify(branding) ? { ...current, branding } : current),
    )
  }, [meetingLoaded, token])

  const meetingStartAt = state?.meeting.startAt
  useEffect(() => {
    if (!rescheduling || !meetingStartAt) return
    setSlotsLoading(true)
    setError(null)
    void getManagedMeetingSlots(token, new Date().toISOString(), new Date(Date.now() + 28 * 86_400_000).toISOString()).then((result) => setSlots(result.slots.filter((slot) => slot !== meetingStartAt))).catch((reason) => setError(reason instanceof Error ? reason.message : "Available times could not be loaded.")).finally(() => setSlotsLoading(false))
  }, [rescheduling, meetingStartAt, token])

  const brand = state?.branding
  const style = useMemo(() => ({
    ...publicBrandTheme(brand),
    "--manage-bg": "var(--brand-bg)",
    "--manage-surface": "var(--brand-surface)",
    "--manage-ink": "var(--brand-ink)",
    "--manage-accent": "var(--brand-accent)",
    "--manage-radius": "var(--brand-radius)",
    // Shared buttons remain inside the same public contract. These scoped
    // shadcn aliases do not change the application or the visitor's theme.
    "--background": "var(--brand-bg)",
    "--foreground": "var(--brand-ink)",
    "--card": "var(--brand-surface)",
    "--popover": "var(--brand-surface)",
    "--primary": "var(--brand-accent)",
    "--primary-foreground": "var(--brand-accent-ink)",
    "--secondary": "var(--brand-tint)",
    "--muted": "var(--brand-tint)",
    "--muted-foreground": "var(--brand-text)",
    "--border": "var(--brand-line)",
    "--input": "var(--brand-line)",
    "--ring": "var(--brand-accent)",
    "--md-red": "var(--brand-danger)",
  }) as React.CSSProperties, [brand])

  async function action(input: Record<string, unknown>, success: string) {
    setSaving(true); setError(null); setNotice(null)
    try {
      const result = await manageMeeting(token, input)
      setNotice(result.finalising ? "The provider is confirming this change. The previous meeting details remain in place until it succeeds." : success)
      setRescheduling(false); setConfirmCancel(false); load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The meeting could not be changed.") } finally { setSaving(false) }
  }

  async function submitReschedule() {
    if (!state) return
    const choices = state.meeting.attendeeCount > 1 ? alternatives : selected ? [selected] : []
    if (!choices.length) { setError("Choose at least one alternative time."); return }
    const duration = Date.parse(state.meeting.endAt) - Date.parse(state.meeting.startAt)
    await action({ action: "reschedule", proposedTimes: choices.map((startAt) => ({ startAt, endAt: new Date(Date.parse(startAt) + duration).toISOString() })) }, state.meeting.attendeeCount > 1 ? "Your alternatives were sent to the organiser. The original meeting remains confirmed." : "The meeting time was updated.")
  }

  if (loading && !state) return <main className="grid min-h-screen place-items-center" style={{ ...publicBrandTheme(null), background: "var(--brand-bg)", color: "var(--brand-ink)" }}><DotGridLoader label="Loading meeting details…" /></main>

  return <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-14 [&_button]:rounded-[var(--brand-control-radius)]" style={{ ...style, background: "var(--manage-bg)", color: "var(--manage-ink)" }}><div className="mx-auto w-full max-w-[720px]"><header className="mb-6 flex items-center justify-between gap-4"><PublicBrandIdentity key={brand?.logoUrl ?? "no-logo"} brand={brand} /><span className="shrink-0 rounded-full px-3 py-1.5 text-[10.5px] font-medium" style={{ background: "color-mix(in srgb,var(--manage-surface) 88%,transparent)", boxShadow: "0 0 0 1px color-mix(in srgb,var(--manage-ink) 8%,transparent)" }}><ShieldCheck className="me-1 inline size-3" />{state?.localPreview ? "Local attendee preview" : "Private attendee link"}</span></header>
    {error && !state ? <section role="alert" className="grid min-h-72 place-items-center p-8 text-center" style={{ borderRadius: "var(--manage-radius)", background: "var(--manage-surface)", boxShadow: "0 18px 60px rgba(11,20,19,.09)" }}><div><TriangleAlert className="mx-auto size-6 text-[var(--md-red)]" /><h1 className="mt-4 text-[19px] font-medium">This management link is unavailable</h1><p className="mt-2 text-[12px] opacity-65">{error}</p></div></section> : state ? <section className="overflow-hidden" style={{ borderRadius: "var(--manage-radius)", background: "var(--manage-surface)", boxShadow: "0 18px 60px rgba(11,20,19,.09)" }}>
      <div className="border-b px-5 py-5 sm:px-7" style={{ borderColor: "color-mix(in srgb,var(--manage-ink) 8%,transparent)" }}><div className="flex items-start gap-3"><MeetingProviderMark provider={state.meeting.provider === "calendar" ? "multideck" : state.meeting.provider} className="mt-0.5 size-7" /><div className="min-w-0"><p className="text-[11px] font-medium uppercase tracking-[.07em] opacity-55">Meeting</p><h1 className="mt-1 text-[22px] font-medium tracking-[-.02em]">{state.meeting.title}</h1><p className="mt-2 text-[11px] opacity-60">{meetingProviderLabels[state.meeting.provider === "calendar" ? "multideck" : state.meeting.provider]}</p></div></div></div>
      <div className="grid gap-5 px-5 py-5 sm:px-7 sm:py-7"><div className="grid gap-3 rounded-[calc(var(--manage-radius)-6px)] p-4" style={{ background: "color-mix(in srgb,var(--manage-ink) 4%,var(--manage-surface))" }}><p className="flex items-center gap-2 text-[12px]"><CalendarDays className="size-4" style={{ color: "var(--manage-accent)" }} />{new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: state.meeting.timeZone }).format(new Date(state.meeting.startAt))}</p><p className="flex items-center gap-2 text-[12px]"><Clock3 className="size-4" style={{ color: "var(--manage-accent)" }} />{Math.round((Date.parse(state.meeting.endAt) - Date.parse(state.meeting.startAt)) / 60_000)} minutes · {state.meeting.timeZone}</p>{state.meeting.location ? <p className="text-[12px] opacity-70">{state.meeting.location}</p> : null}{state.meeting.agenda ? <p className="border-t pt-3 text-[12px] leading-5 opacity-70" style={{ borderColor: "color-mix(in srgb,var(--manage-ink) 8%,transparent)" }}>{state.meeting.agenda}</p> : null}</div>
        {state.meeting.status === "provisioning" || state.meeting.status === "sync_pending" ? <div className="rounded-[calc(var(--manage-radius)-6px)] bg-[var(--md-amber-a08)] p-3 text-[11px] leading-5 text-[var(--md-amber)]">The provider is confirming a change. Until it succeeds, the last confirmed meeting details remain authoritative.</div> : null}{state.meeting.status === "sync_failed" ? <div className="rounded-[calc(var(--manage-radius)-6px)] bg-[color-mix(in_srgb,var(--md-red)_8%,var(--manage-surface))] p-3 text-[11px] leading-5 text-[var(--md-red)]">{state.meeting.syncError || "The provider could not complete the change. The previous confirmed meeting is still in place."}</div> : null}
        <div><p className="text-[11px] font-medium uppercase tracking-[.06em] opacity-55">Your response</p><div className="mt-2 flex flex-wrap gap-2">{(["accepted", "tentative", "declined"] as const).map((response) => <button key={response} type="button" aria-pressed={state.participant.response === response} disabled={saving} onClick={() => void action({ action: "rsvp", response }, `Your response is now ${response}.`)} className="h-9 rounded-full px-3 text-[11px] font-medium capitalize shadow-[var(--md-shadow-line)] transition-[background,color,transform] active:scale-[.98]" style={{ background: state.participant.response === response ? "var(--manage-accent)" : "color-mix(in srgb,var(--manage-ink) 5%,var(--manage-surface))", color: state.participant.response === response ? "var(--brand-accent-ink)" : "var(--manage-ink)" }}>{state.participant.response === response ? <Check className="me-1 inline size-3" /> : null}{response}</button>)}</div></div>
        {rescheduling ? <div className="grid gap-3"><div><h2 className="text-[15px] font-medium">{state.meeting.attendeeCount > 1 ? "Propose up to three alternatives" : "Choose a new time"}</h2><p className="mt-1 text-[11px] leading-5 opacity-60">{state.meeting.attendeeCount > 1 ? "The original meeting stays confirmed until the organiser approves one." : "Only genuinely free times with the same duration are shown."}</p></div><AvailabilityPicker slots={slots.filter((slot) => !alternatives.includes(slot))} selected={selected} onSelect={setSelected} timeZone={state.meeting.timeZone || "Europe/London"} loading={slotsLoading} emptyTitle="No alternative times" emptyHint="Nothing else is free with the same duration in the booking window. Contact the organiser if none of this works." />{state.meeting.attendeeCount > 1 && selected ? <Button variant="ghost" disabled={alternatives.length >= 3} onClick={() => { setAlternatives((current) => [...current, selected]); setSelected(null) }}>Add this alternative</Button> : null}{alternatives.length ? <div className="grid gap-2">{alternatives.map((slot) => <div key={slot} className="flex items-center justify-between rounded-[calc(var(--manage-radius)-8px)] px-3 py-2 text-[11px]" style={{ background: "color-mix(in srgb,var(--manage-ink) 4%,var(--manage-surface))" }}><span>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: state.meeting.timeZone }).format(new Date(slot))}</span><button type="button" aria-label="Remove alternative" onClick={() => setAlternatives((current) => current.filter((value) => value !== slot))}><Trash2 className="size-3.5" /></button></div>)}</div> : null}<div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setRescheduling(false)}>Keep current time</Button><Button disabled={saving || slotsLoading || (!selected && !alternatives.length)} onClick={() => void submitReschedule()} style={{ background: "var(--manage-accent)" }}>{saving ? "Submitting…" : state.meeting.attendeeCount > 1 ? "Send alternatives" : "Confirm new time"}</Button></div></div> : null}
        {error ? <p role="alert" className="text-[11px] text-[var(--md-red)]">{error}</p> : null}{notice ? <p role="status" className="rounded-[calc(var(--manage-radius)-6px)] p-3 text-[11px]" style={{ background: "color-mix(in srgb,var(--manage-accent) 9%,var(--manage-surface))", color: "var(--manage-accent)" }}>{notice}</p> : null}
        {!state.permissions.canReschedule || !state.permissions.canCancel ? <p className="text-[10.5px] leading-5 opacity-55">{!state.permissions.canReschedule && !state.permissions.canCancel ? "The rescheduling and cancellation windows have closed. Contact the organiser if you need help." : !state.permissions.canReschedule ? "The rescheduling window has closed." : "The cancellation window has closed."}</p> : null}
        {!rescheduling ? <div className="flex flex-col gap-2 border-t pt-5 sm:flex-row sm:flex-wrap" style={{ borderColor: "color-mix(in srgb,var(--manage-ink) 8%,transparent)" }}>{state.meeting.joinUrl && state.meeting.status === "confirmed" ? <Button asChild className="sm:me-auto" style={{ background: "var(--manage-accent)" }}><a href={state.meeting.joinUrl} target="_blank" rel="noreferrer"><Video className="size-4" />Join meeting<ExternalLink className="size-3" /></a></Button> : null}<Button variant="ghost" onClick={() => downloadMeetingCalendarFile(state.meeting)}><CalendarDays className="size-4" />Add to calendar</Button><Button variant="ghost" onClick={() => setRescheduling(true)} disabled={!state.permissions.canReschedule}><RefreshCw className="size-4" />Reschedule</Button>{confirmCancel ? <><Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep meeting</Button><Button variant="ghost" disabled={saving || !state.permissions.canCancel} onClick={() => void action({ action: "cancel_attendance" }, state.meeting.attendeeCount > 1 ? "Your attendance was cancelled." : "The meeting was cancelled.")} className="text-[var(--md-red)]">{saving ? "Cancelling…" : state.meeting.attendeeCount > 1 ? "Confirm I cannot attend" : "Confirm cancellation"}</Button></> : <Button variant="ghost" disabled={!state.permissions.canCancel} onClick={() => setConfirmCancel(true)} className="text-[var(--md-red)]">{state.meeting.attendeeCount > 1 ? "Cancel my attendance" : "Cancel meeting"}</Button>}</div> : null}
      </div>
    </section> : null}<footer className="mt-5 text-center text-[10.5px] opacity-50">{brand ? `${brand.displayName} · Meeting management powered by Multideck` : "Multideck · Secure meeting management"}</footer></div></main>
}
