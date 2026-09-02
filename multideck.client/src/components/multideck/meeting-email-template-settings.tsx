import { useEffect, useMemo, useState } from "react"
import { Check, Mail, RefreshCw, Send, TriangleAlert } from "@/components/icons/hugeicons"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { SettingsPanel } from "@/components/multideck/settings-components"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  getMeetingEmailTemplates,
  meetingEmailTemplateVariables,
  resetMeetingEmailTemplate,
  saveMeetingEmailTemplate,
  sendMeetingEmailTemplateTest,
  type MeetingEmailTemplate,
  type MeetingEmailTemplateKind,
} from "@/lib/calendar-api"
import { toast } from "sonner"

const sampleValues: Record<string, string> = {
  meeting_title: "Freight planning call",
  meeting_date: "Tuesday, 8 September 2026 at 10:30",
  organiser_name: "Alex Morgan",
  attendee_name: "Sam Taylor",
  manage_url: "workspace.multideck.app/meetings/manage/…",
  join_url: "meet.example.com/…",
  verification_code: "482193",
  workspace_name: "Your company",
}

function renderSample(value: string) {
  return value.replace(/\{([a-z_]+)\}/g, (_match, name: string) => sampleValues[name] ?? `{${name}}`)
}

export function MeetingEmailTemplateSettings({ disabled = false }: { disabled?: boolean }) {
  const [templates, setTemplates] = useState<MeetingEmailTemplate[]>([])
  const [selectedKind, setSelectedKind] = useState<MeetingEmailTemplateKind>("management")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"save" | "reset" | "test" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = templates.find((template) => template.kind === selectedKind) ?? null
  useEffect(() => {
    let active = true
    void getMeetingEmailTemplates().then((result) => { if (active) setTemplates(result.templates) }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Meeting email templates could not be loaded.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  useEffect(() => { if (selected) { setSubject(selected.subject); setMessage(selected.body); setError(null) } }, [selected])

  const unsupported = useMemo(() => {
    const names = [...`${subject}\n${message}`.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1])
    return [...new Set(names.filter((name) => !(meetingEmailTemplateVariables as readonly string[]).includes(name)))]
  }, [message, subject])
  const dirty = Boolean(selected && (selected.subject !== subject || selected.body !== message))

  async function save() {
    if (!selected || busy) return
    setBusy("save"); setError(null)
    try {
      const next = await saveMeetingEmailTemplate(selected.kind, { subject, body: message })
      setTemplates((current) => current.map((template) => template.kind === next.kind ? next : template))
      toast.success("Meeting email template saved")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The template could not be saved.") } finally { setBusy(null) }
  }

  async function reset() {
    if (!selected || busy) return
    setBusy("reset"); setError(null)
    try {
      const next = await resetMeetingEmailTemplate(selected.kind)
      setTemplates((current) => current.map((template) => template.kind === next.kind ? next : template))
      toast.success("Multideck default restored", { description: "Review the default copy before continuing." })
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The template could not be reset.") } finally { setBusy(null) }
  }

  async function sendTest() {
    if (!selected || busy) return
    setBusy("test"); setError(null)
    try {
      const result = await sendMeetingEmailTemplateTest(selected.kind, { subject, body: message })
      toast.success("Test email sent", { description: result.email })
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The test email could not be sent.") } finally { setBusy(null) }
  }

  return <SettingsPanel title="Meeting email templates" description="English-only tenant copy for operational meeting updates. Verification and provider invitations remain owned by Multideck, Google or Microsoft.">
    {loading ? <div className="grid min-h-48 place-items-center"><DotGridLoader label="Loading meeting email templates…" /></div> : selected ? <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.8fr)]">
      <div className="grid content-start gap-4">
        <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">Template<Select value={selectedKind} onValueChange={(value) => setSelectedKind(value as MeetingEmailTemplateKind)}><SelectTrigger className="h-10 rounded-[var(--md-radius-lg)]"><SelectValue /></SelectTrigger><SelectContent>{templates.map((template) => <SelectItem key={template.kind} value={template.kind}>{template.name}</SelectItem>)}</SelectContent></Select><span className="text-[10.5px] font-normal leading-4 text-[var(--md-subtle)]">{selected.description}</span></label>
        <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">Subject<Input value={subject} maxLength={240} disabled={disabled || Boolean(busy)} onChange={(event) => setSubject(event.target.value)} className="h-10 rounded-[var(--md-radius-lg)]" /></label>
        <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-ink)]">Message<Textarea value={message} maxLength={8000} disabled={disabled || Boolean(busy)} onChange={(event) => setMessage(event.target.value)} className="min-h-48 rounded-[var(--md-radius-lg)]" /></label>
        <div><p className="text-[10.5px] font-medium text-[var(--md-text)]">Safe variables</p><div className="mt-2 flex flex-wrap gap-1.5">{meetingEmailTemplateVariables.map((variable) => <button key={variable} type="button" disabled={disabled || Boolean(busy)} onClick={() => setMessage((current) => `${current}${current.endsWith(" ") || !current ? "" : " "}{${variable}}`)} className="rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 py-1 text-[10px] text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:text-[var(--md-accent)]">{`{${variable}}`}</button>)}</div></div>
        {unsupported.length ? <p role="alert" className="flex items-center gap-2 text-[11px] text-[var(--md-red)]"><TriangleAlert className="size-3.5" />Remove unsupported variables: {unsupported.map((name) => `{${name}}`).join(", ")}.</p> : null}
        {error ? <p role="alert" className="text-[11px] leading-5 text-[var(--md-red)]">{error}</p> : null}
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={disabled || Boolean(busy) || !dirty || !subject.trim() || !message.trim() || Boolean(unsupported.length)} onClick={() => void save()}>{busy === "save" ? "Saving…" : <><Check className="size-3.5" />Save template</>}</Button><Button type="button" variant="ghost" disabled={disabled || Boolean(busy)} onClick={() => void sendTest()}><Send className="size-3.5" />{busy === "test" ? "Sending…" : "Send test to me"}</Button><Button type="button" variant="ghost" disabled={disabled || Boolean(busy) || !selected.custom} onClick={() => void reset()}><RefreshCw className="size-3.5" />{busy === "reset" ? "Resetting…" : "Reset"}</Button></div>
      </div>
      <div className="self-start rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] p-4 shadow-[var(--md-shadow-line)]"><div className="flex items-center justify-between gap-3"><p className="text-[10px] font-medium uppercase tracking-[.06em] text-[var(--md-subtle)]">Preview</p><span className="rounded-full bg-[var(--md-surface)] px-2 py-1 text-[9.5px] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">{selected.custom ? `Custom · v${selected.version}` : "Multideck default"}</span></div><div className="mt-4 rounded-[calc(var(--md-radius-xl)-4px)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-line)]"><Mail className="size-4 text-[var(--md-accent)]" /><p className="mt-3 text-[11px] font-medium text-[var(--md-subtle)]">{renderSample(subject) || "Email subject"}</p><h3 className="mt-2 text-[17px] font-medium text-[var(--md-ink)]">{selected.name}</h3><div className="mt-3 whitespace-pre-wrap text-[12px] leading-5 text-[var(--md-text)]">{renderSample(message) || "Your message preview appears here."}</div></div></div>
    </div> : <div className="p-5 text-[12px] text-[var(--md-red)]">{error || "No meeting email templates are available."}</div>}
  </SettingsPanel>
}
