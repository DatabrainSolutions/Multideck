import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, Mail, RefreshCw, Send, TriangleAlert } from "@/components/icons/hugeicons"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { SettingsPanel } from "@/components/multideck/settings-components"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

const variableLabels: Record<string, string> = {
  meeting_title: "Meeting title",
  meeting_date: "Meeting date",
  organiser_name: "Organiser name",
  attendee_name: "Attendee name",
  manage_url: "Management link",
  join_url: "Join link",
  verification_code: "Verification code",
  workspace_name: "Company name",
}

// Only the display changes: API values remain the existing {variable} format.
function readTemplateEditor(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
  if (node instanceof HTMLElement && node.dataset.templateVariable) return `{${node.dataset.templateVariable}}`
  if (node.nodeName === "BR") return "\n"
  return Array.from(node.childNodes).map((child, index) => {
    const block = child.nodeName === "DIV" || child.nodeName === "P"
    return `${block && index > 0 ? "\n" : ""}${readTemplateEditor(child)}`
  }).join("")
}

function templateNodes(value: string) {
  const fragment = document.createDocumentFragment()
  for (const part of value.split(/(\{[a-z_]+\})/g)) {
    const variable = part.slice(1, -1)
    if (part.startsWith("{") && variableLabels[variable]) {
      const tag = document.createElement("span")
      tag.className = "md-dexter-mention md-dexter-mention--static"
      tag.contentEditable = "false"
      tag.dataset.templateVariable = variable
      tag.textContent = variableLabels[variable]
      fragment.append(tag)
    } else fragment.append(document.createTextNode(part))
  }
  return fragment
}

function MeetingTemplateField({ label, value, onChange, disabled, multiline = false }: {
  label: string; value: string; onChange: (value: string) => void; disabled: boolean; multiline?: boolean
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Range | null>(null)
  const emittedRef = useRef<string | null>(null)
  const id = useId()
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<{ left: number; top: number; width: number } | null>(null)
  const results = meetingEmailTemplateVariables.filter((key) => `${variableLabels[key]} ${key}`.toLowerCase().includes((query ?? "").toLowerCase()))
  const maxLength = multiline ? 8000 : 240
  const tooLong = value.length > maxLength

  useLayoutEffect(() => {
    if (editorRef.current && emittedRef.current !== value) editorRef.current.replaceChildren(templateNodes(value))
  }, [value])

  useEffect(() => {
    if (disabled) setQuery(null)
  }, [disabled])

  useEffect(() => {
    if (query !== null) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" })
  }, [active, id, query])

  useLayoutEffect(() => {
    if (query === null) return
    function place() {
      const rect = editorRef.current?.getBoundingClientRect()
      if (!rect) return
      const height = Math.min(results.length * 42 + 44, 300)
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.min(rect.width, 360) - 8)), width: Math.min(rect.width, 360), top: rect.bottom + height + 8 < window.innerHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6) })
    }
    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true) }
  }, [query, results.length])

  function emit() {
    if (!editorRef.current) return
    const next = readTemplateEditor(editorRef.current).replaceAll("\u00a0", " ")
    emittedRef.current = next
    onChange(next)
  }

  function findTrigger() {
    const selection = window.getSelection()
    if (!selection?.isCollapsed || !selection.rangeCount || !editorRef.current?.contains(selection.anchorNode)) { setQuery(null); return }
    const range = selection.getRangeAt(0)
    if (range.startContainer.nodeType !== Node.TEXT_NODE) { setQuery(null); return }
    const before = range.startContainer.textContent?.slice(0, range.startOffset) ?? ""
    const match = before.match(/(?:^|\s)\/([a-z_ ]*)$/i)
    if (!match) { setQuery(null); return }
    const trigger = range.cloneRange()
    trigger.setStart(range.startContainer, range.startOffset - match[1].length - 1)
    triggerRef.current = trigger
    setActive(0)
    setQuery(match[1])
  }

  function insert(variable: string) {
    const range = triggerRef.current
    const editor = editorRef.current
    if (!range || !editor || disabled) return
    editor.focus()
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const wrapper = document.createElement("div")
    wrapper.append(templateNodes(`{${variable}}`), document.createTextNode("\u00a0"))
    // Native insertion retains the browser's undo stack and treats tags atomically.
    document.execCommand("insertHTML", false, wrapper.innerHTML)
    emit()
    setQuery(null)
    triggerRef.current = null
  }

  return <div className="grid gap-1.5">
    <label id={`${id}-label`} htmlFor={id} className="text-[12px] font-medium text-[var(--md-ink)]">{label}</label>
    <div
      ref={editorRef} id={id} role="textbox" aria-labelledby={`${id}-label`} aria-multiline={multiline}
      aria-disabled={disabled} aria-invalid={tooLong} aria-describedby={`${id}-help`}
      aria-haspopup="listbox" aria-controls={query !== null ? `${id}-variables` : undefined}
      aria-activedescendant={query !== null && results.length ? `${id}-option-${active}` : undefined}
      contentEditable={!disabled} suppressContentEditableWarning tabIndex={disabled ? -1 : 0}
      className={`md-dexter-mention-editor w-full min-w-0 whitespace-pre-wrap break-words rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2 text-[12px] leading-6 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] ${multiline ? "min-h-48" : "min-h-10"} ${disabled ? "opacity-60" : ""}`}
      onInput={() => { emit(); findTrigger() }}
      onClick={findTrigger}
      onKeyUp={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) findTrigger() }}
      onBlur={() => { setQuery(null); if (editorRef.current) editorRef.current.replaceChildren(templateNodes(value)) }}
      onCopy={(event) => {
        const selection = window.getSelection()
        if (!selection?.rangeCount) return
        event.preventDefault()
        event.clipboardData.setData("text/plain", readTemplateEditor(selection.getRangeAt(0).cloneContents()))
      }}
      onCut={(event) => {
        const selection = window.getSelection()
        if (!selection?.rangeCount || disabled) return
        event.preventDefault()
        event.clipboardData.setData("text/plain", readTemplateEditor(selection.getRangeAt(0).cloneContents()))
        document.execCommand("delete")
        emit()
        setQuery(null)
      }}
      onPaste={(event) => { event.preventDefault(); const text = event.clipboardData.getData("text/plain"); document.execCommand("insertText", false, multiline ? text : text.replace(/[\r\n]+/g, " ")); emit(); findTrigger() }}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (query !== null) {
          if (event.key === "Escape") { event.preventDefault(); setQuery(null); return }
          if (results.length && ["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); setActive((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length); return }
          if (results.length && ["Enter", "Tab"].includes(event.key)) { event.preventDefault(); insert(results[active] ?? results[0]); return }
        }
        if (event.key === "Enter") { event.preventDefault(); if (multiline) { document.execCommand("insertText", false, "\n"); emit() } }
      }}
    />
    <p id={`${id}-help`} className={`text-[10.5px] ${tooLong ? "text-[var(--md-red)]" : "text-[var(--md-subtle)]"}`}>{tooLong ? `Keep this under ${maxLength.toLocaleString("en-GB")} characters.` : "Type / to add a variable."}</p>
    {createPortal(<AnimatePresence>{query !== null && position && !disabled ? <motion.div
      key="variables" id={`${id}-variables`} role="listbox" aria-label={`${label} variables`}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 4, scale: reduceMotion ? 1 : .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .18 }}
      style={position} className="fixed z-[100] max-h-[300px] overflow-y-auto rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]"
      onMouseDown={(event) => event.preventDefault()}
    ><p className="px-2 py-1.5 text-[10.5px] text-[var(--md-subtle)]">Add a variable</p>{results.length ? results.map((variable, index) => <div
      key={variable} id={`${id}-option-${index}`} role="option" aria-selected={active === index}
      onMouseMove={() => setActive(index)} onClick={() => insert(variable)}
      className={`flex min-h-10 cursor-pointer items-center rounded-[var(--md-radius-lg)] px-2 ${active === index ? "bg-[var(--md-surface-tint)]" : ""}`}
    ><span className="md-dexter-mention md-dexter-mention--static">{variableLabels[variable]}</span></div>) : <p className="px-2 py-3 text-[12px] text-[var(--md-subtle)]">No matching variables.</p>}</motion.div> : null}</AnimatePresence>, document.body)}
  </div>
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
        <MeetingTemplateField key={`${selectedKind}-subject`} label="Subject" value={subject} onChange={setSubject} disabled={disabled || Boolean(busy)} />
        <MeetingTemplateField key={`${selectedKind}-message`} label="Message" value={message} onChange={setMessage} disabled={disabled || Boolean(busy)} multiline />
        {unsupported.length ? <p role="alert" className="flex items-center gap-2 text-[11px] text-[var(--md-red)]"><TriangleAlert className="size-3.5" />Remove unsupported variables: {unsupported.map((name) => `{${name}}`).join(", ")}.</p> : null}
        {error ? <p role="alert" className="text-[11px] leading-5 text-[var(--md-red)]">{error}</p> : null}
        <div className="flex flex-wrap gap-2"><Button type="button" disabled={disabled || Boolean(busy) || !dirty || !subject.trim() || !message.trim() || subject.length > 240 || message.length > 8000 || Boolean(unsupported.length)} onClick={() => void save()}>{busy === "save" ? "Saving…" : <><Check className="size-3.5" />Save template</>}</Button><Button type="button" variant="ghost" disabled={disabled || Boolean(busy) || !subject.trim() || !message.trim() || subject.length > 240 || message.length > 8000 || Boolean(unsupported.length)} onClick={() => void sendTest()}><Send className="size-3.5" />{busy === "test" ? "Sending…" : "Send test to me"}</Button><Button type="button" variant="ghost" disabled={disabled || Boolean(busy) || !selected.custom} onClick={() => void reset()}><RefreshCw className="size-3.5" />{busy === "reset" ? "Resetting…" : "Reset"}</Button></div>
      </div>
      <div className="mx-auto w-full min-w-0 max-w-[440px] self-center lg:px-3"><div className="flex items-center justify-between gap-3 px-1"><p className="text-[10px] font-medium uppercase tracking-[.06em] text-[var(--md-subtle)]">Preview</p><span className="text-[10.5px] text-[var(--md-subtle)]">{selected.custom ? `Custom · v${selected.version}` : "Multideck default"}</span></div><div className="mt-3 rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-6 shadow-[var(--md-shadow-soft)]"><Mail className="size-4 text-[var(--md-accent)]" /><p className="mt-3 break-words text-[11px] font-medium text-[var(--md-subtle)]">{renderSample(subject) || "Email subject"}</p><h3 className="mt-2 text-[17px] font-medium text-[var(--md-ink)]">{selected.name}</h3><div className="mt-3 whitespace-pre-wrap break-words text-[12px] leading-5 text-[var(--md-text)]">{renderSample(message) || "Your message preview appears here."}</div></div></div>
    </div> : <div className="p-5 text-[12px] text-[var(--md-red)]">{error || "No meeting email templates are available."}</div>}
  </SettingsPanel>
}
