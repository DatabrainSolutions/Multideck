import { TicketAttachmentList, TicketAttachmentPicker } from "@/components/multideck/ticket-attachments"
import { useTicketAttachmentDraft } from "@/lib/use-ticket-attachment-draft"
import { uploadTicketFiles } from "@/lib/ticket-attachments"
import { invoke } from "@/lib/support-ticket"
import { useEffect, useRef, useState, type FormEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowLeft, RefreshCw, TicketCheck } from "@/components/icons/hugeicons"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { openSupportTicket, SUPPORT_TICKET_SUBMITTED_EVENT } from "@/components/multideck/support-ticket-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { addSupportTicketComment, getSupportTicket, listSupportTickets, type SupportTicketConversation, type SupportTicketMessage, type SupportTicketSummary } from "@/lib/support-ticket"

const statusLabels = { new: "Open", in_progress: "In progress", waiting_for_customer: "Waiting for you", resolved: "Resolved", closed: "Closed" }
const mergeMessages = (existing: SupportTicketMessage[], incoming: SupportTicketMessage[]) => [...new Map([...existing, ...incoming].map((message) => [message.id, message])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

function SendSolidRoundedIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path d="M18.4298 2.339C19.4275 2.16465 20.3849 2.19746 21.0919 2.90443C21.7988 3.6114 21.8317 4.56886 21.6573 5.56654C21.4847 6.55443 21.0621 7.83301 20.5353 9.42716L20.5128 9.49525L18.5753 15.3576L18.5579 15.4102C17.9548 17.2351 17.4803 18.6711 17.0118 19.6749C16.5606 20.6417 15.9888 21.5015 15.0323 21.6954C14.7039 21.762 14.3659 21.7682 14.0352 21.713C13.0759 21.5529 12.4672 20.719 11.9708 19.7687C11.4565 18.7842 10.9159 17.3693 10.2288 15.5708L10.2052 15.5089C9.91666 14.7538 9.82938 14.5569 9.69931 14.4093C9.66446 14.3698 9.6265 14.3319 9.587 14.297C9.43941 14.1669 9.2425 14.0797 8.48739 13.7911L8.42554 13.7675C6.627 13.0804 5.21211 12.5398 4.22763 12.0255C3.27732 11.5291 2.44343 10.9204 2.28329 9.96107C2.22813 9.63046 2.23432 9.29238 2.30087 8.964C2.49484 8.00753 3.35459 7.43575 4.32138 6.98451C5.32518 6.51602 6.76118 6.04148 8.58608 5.43844L8.63876 5.42103L14.5011 3.48353L14.5692 3.46103C16.1633 2.93419 17.4419 2.51165 18.4298 2.339ZM16.2091 7.78236C15.8186 7.39184 15.1855 7.39185 14.795 7.78236L12.0977 10.4796C11.7072 10.8701 11.7072 11.5032 12.0977 11.8937C12.4883 12.2842 13.1213 12.2842 13.5118 11.8937L16.2091 9.19642C16.5996 8.8059 16.5996 8.17288 16.2091 7.78236Z" fill="currentColor" />
  </svg>
}

// A complete Settings workflow, composed from existing Multideck-owned parts.
export function SupportTicketWorkspace({ ticketId, navigate }: { ticketId: string | null; navigate: (path: string) => void }) {
  const { t, language } = useLanguage()
  const reducedMotion = useReducedMotion()
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([])
  const [latestAuthors, setLatestAuthors] = useState<Record<string, SupportTicketMessage["authorType"]>>({})
  const [conversation, setConversation] = useState<SupportTicketConversation | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const attachments = useTicketAttachmentDraft(ticketId ?? "list")
  const [uploadProgress, setUploadProgress] = useState("")
  const sendLock = useRef(false)
  const [sent, setSent] = useState(false)
  const submission = useRef<{ body: string; files: File[]; key: string } | null>(null)
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  const showStatus = (ticket: SupportTicketSummary) => {
    const finished = ticket.status === "resolved" || ticket.status === "closed"
    const latestAuthor = ticketId === ticket.id && conversation
      ? conversation.messages.at(-1)?.authorType
      : latestAuthors[ticket.id]
    const label = !finished && latestAuthor === "staff" ? "Waiting for you"
      : latestAuthor === "customer" && ticket.status === "waiting_for_customer" ? "Open"
      : statusLabels[ticket.status] || "Status unavailable"
    return <StatusPill tone={finished ? "green" : "amber"}>{t(label)}</StatusPill>
  }

  useEffect(() => {
    if (ticketId || !tickets.length) return
    let active = true
    // The list API has no latest-public-author field; use the permission-checked
    // conversation endpoint until that summary is available from Cloud.
    void Promise.all(tickets.map(async (ticket) => {
      if (ticket.status === "resolved" || ticket.status === "closed") return
      try {
        const result = await getSupportTicket(ticket.id)
        const author = mergeMessages([], result.messages).at(-1)?.authorType
        if (active && author) setLatestAuthors((current) => ({ ...current, [ticket.id]: author }))
      } catch { /* Preserve the confirmed ticket status when replies are unavailable. */ }
    }))
    return () => { active = false }
  }, [tickets, ticketId])

  useEffect(() => {
    const refresh = () => setAttempt((value) => value + 1)
    window.addEventListener(SUPPORT_TICKET_SUBMITTED_EVENT, refresh)
    return () => window.removeEventListener(SUPPORT_TICKET_SUBMITTED_EVENT, refresh)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    const request = ticketId
      ? getSupportTicket(ticketId).then((result) => { if (active) { setConversation({ ...result, messages: mergeMessages([], result.messages) }); setCursor(result.nextCursor) } })
      : listSupportTickets().then((result) => { if (active) { setTickets(result.tickets); setCursor(result.nextCursor) } })
    void request.catch(() => { if (active) setError(t("Support details could not be loaded. Your ticket has not been changed; try again.")) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [ticketId, attempt, t])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setError(null)
    try {
      if (ticketId) {
        const result = await getSupportTicket(ticketId, cursor)
        if (result.nextCursor === cursor) throw new Error("Support pagination did not advance.")
        setConversation((current) => current ? { ...current, messages: mergeMessages(current.messages, result.messages) } : result)
        setCursor(result.nextCursor)
      } else {
        const result = await listSupportTickets(cursor)
        if (result.nextCursor === cursor) throw new Error("Support pagination did not advance.")
        setTickets((current) => [...new Map([...current, ...result.tickets].map((ticket) => [ticket.id, ticket])).values()])
        setCursor(result.nextCursor)
      }
    } catch { setError(t("Earlier records could not be loaded. Try again.")) }
    finally { setLoadingMore(false) }
  }

  async function sendComment(event: FormEvent) {
    event.preventDefault()
    if (!ticketId || sending || sendLock.current) return
    const body = draft.trim()
    if ((!body && !attachments.files.length) || body.length > 12000) { setCommentError(t("Write a reply of up to 12,000 characters.")); return }
    if (!submission.current || submission.current.body !== body || submission.current.files.length !== attachments.files.length || submission.current.files.some((file, index) => file !== attachments.files[index])) submission.current = { body, files: [...attachments.files], key: crypto.randomUUID() }
    sendLock.current = true
    setSending(true)
    setCommentError(null)
    setSent(false)
    try {
      const attachmentIds = await uploadTicketFiles(invoke, ticketId, attachments.files, attachments.cache, setUploadProgress)
      setUploadProgress("Sending reply…")
      const result = await addSupportTicketComment(ticketId, body, submission.current.key, attachmentIds)
      setConversation((current) => current ? { ...current, messages: mergeMessages(current.messages, [result.message]) } : current)
      setDraft("")
      attachments.clear()
      submission.current = null
      setSent(true)
      setAttempt((value) => value + 1)
    } catch { setCommentError(t("Your reply could not be confirmed. Your text is still here; try again.")) }
    finally { sendLock.current = false; setSending(false); setUploadProgress("") }
  }

  return <Surface padding="lg" className="mt-[var(--md-page-stack-gap)] min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {ticketId ? <Button variant="ghost" onClick={() => navigate("/settings?tab=support")} disabled={sending}><ArrowLeft className="size-4" aria-hidden="true" />{t("Your tickets")}</Button> : <h2 className="text-[16px] font-medium">{t("Your tickets")}</h2>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" disabled={loading || sending} onClick={() => setAttempt((value) => value + 1)}><RefreshCw className="size-4" aria-hidden="true" />{t("Refresh")}</Button>
        {!ticketId ? <Button type="button" onClick={openSupportTicket}><TicketCheck className="size-4" strokeWidth={1.4} aria-hidden="true" />{t("Submit a ticket")}</Button> : null}
      </div>
    </div>
    {error ? <p role="alert" className="mt-4 text-sm text-[var(--md-red)]">{error}</p> : null}
    {loading && !conversation ? <DotGridLoader label="Loading support details…" size="sm" className="my-5" /> : null}
    {!loading && !error && !ticketId ? <div className="mt-4 divide-y divide-[var(--md-hairline)]">
      {tickets.length ? tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => navigate(`/settings?tab=support&ticket=${encodeURIComponent(ticket.id)}`)} className="flex w-full flex-wrap items-center justify-between gap-3 py-4 text-left outline-none hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]">
        <span className="min-w-0 flex-1"><span data-i18n-skip className="block text-sm font-medium break-words">{ticket.reference} · {ticket.title}</span><span className="mt-1 block text-xs text-[var(--md-subtle)]">{date(ticket.updatedAt)}</span></span>{showStatus(ticket)}
      </button>) : <p className="py-5 text-sm text-[var(--md-text)]">{t("You have no support tickets yet. Submit a ticket above or from the sidebar.")}</p>}
    </div> : null}
    {ticketId && conversation ? <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-medium">{conversation.ticket.reference}</h2>{showStatus(conversation.ticket)}</div>
      <h3 data-i18n-skip className="mt-3 text-base font-medium break-words">{conversation.ticket.title}</h3>
      <p data-i18n-skip className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--md-text)]">{conversation.ticket.description}</p>
      <div className="mt-7 border-t border-[var(--md-hairline)] pt-5">
      <h3 className="text-xs font-medium text-[var(--md-subtle)]">{t("Conversation")}</h3>
      {cursor ? <div className="mt-4 flex justify-center"><Button variant="ghost" onClick={() => void loadMore()} disabled={loadingMore}>{t(loadingMore ? "Loading…" : "Load earlier replies")}</Button></div> : null}
      {!conversation.messages.length ? <p className="py-8 text-center text-sm text-[var(--md-subtle)]">{t("No replies yet. The support team will reply here and by email.")}</p> : <ol aria-label={t("Conversation")} className="flex flex-col gap-5 py-6">
        <AnimatePresence initial={false}>
        {conversation.messages.map((message) => {
          const support = message.authorType === "staff"
          return <motion.li key={message.id} initial={reducedMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }} className={`flex min-w-0 ${support ? "justify-start" : "justify-end"}`}>
            <div className="min-w-0 max-w-[90%] sm:max-w-[75%]">
              <div className={`mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${support ? "" : "justify-end"}`}>
                <span className="font-medium text-[var(--md-ink)]">{t(support ? "Support team" : "You")}</span>
                <span data-i18n-skip className="break-all text-[var(--md-subtle)]">{message.authorName}</span>
              </div>
              <div className={`rounded-[var(--md-radius-xl)] px-4 py-3 ${support ? "rounded-tl-[var(--md-radius-sm)] bg-[var(--md-hover)]" : "rounded-tr-[var(--md-radius-sm)] bg-[var(--md-accent-a12)]"}`}>
                {message.body ? <p data-i18n-skip className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--md-ink)] [overflow-wrap:anywhere]">{message.body}</p> : null}
                {message.attachments?.length ? <div className={message.body ? "mt-3" : ""}><TicketAttachmentList items={message.attachments} /></div> : null}
              </div>
              <time dateTime={message.createdAt} className={`mt-1.5 block text-[11px] text-[var(--md-subtle)] ${support ? "" : "text-right"}`}>{date(message.createdAt)}</time>
            </div>
          </motion.li>
        })}
        </AnimatePresence>
      </ol>}
      </div>
      {conversation.ticket.status === "closed" ? <p className="mt-5 text-sm text-[var(--md-text)]">{t("This ticket is closed. Submit a new ticket if you need more help.")}</p> : <form onSubmit={sendComment} className="mt-4" onPaste={event => { if (!sending && event.clipboardData.files.length) { event.preventDefault(); attachments.add(Array.from(event.clipboardData.files)) } }} onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault() }} onDrop={event => { event.preventDefault(); if (!sending) attachments.add(Array.from(event.dataTransfer.files)) }}>
        <label htmlFor="support-reply" className="sr-only">{t("Reply to support")}</label>
        <div className="overflow-hidden rounded-[26px] bg-[var(--md-surface-tint)] p-2 dark:bg-[var(--md-bg-strong)]">
          {attachments.items.length ? <div className="p-2"><TicketAttachmentList items={attachments.items} onRemove={attachments.remove} disabled={sending} /></div> : null}
          <Textarea id="support-reply" value={draft} maxLength={12000} readOnly={sending} placeholder={t("Write a message…")} invalidFeedbackMotion={false} onChange={(event) => { setDraft(event.target.value); setSent(false) }} aria-invalid={Boolean(commentError) || undefined} aria-describedby={commentError || sent ? "support-reply-feedback" : undefined} className="min-h-16 max-h-60 resize-none rounded-[18px] !border-transparent !bg-transparent px-3 py-2.5 !shadow-none !ring-0 focus-visible:!border-transparent" />
          <div className="flex items-center justify-between">
            <TicketAttachmentPicker onAdd={attachments.add} disabled={sending} />
            {uploadProgress ? <span role="status" className="px-2 text-xs text-[var(--md-text)]">{t(uploadProgress)}</span> : null}
            <Button type="submit" aria-label={t(sending ? "Sending reply…" : "Send reply")} title={t(sending ? "Sending reply…" : "Send reply")} disabled={sending || Boolean(error)} className="size-11 rounded-[18px] p-0 active:scale-[0.96] motion-reduce:transform-none">
              {sending ? <DotGridLoader label="Sending reply…" size="sm" /> : <SendSolidRoundedIcon className="size-5" />}
            </Button>
          </div>
        </div>
        {attachments.error ? <p role="alert" className="mt-2 px-3 text-xs text-[var(--md-red)]">{t(attachments.error)}</p> : null}
        <p id="support-reply-feedback" role={commentError ? "alert" : "status"} className={commentError ? "mt-2 px-3 text-xs text-[var(--md-red)]" : "sr-only"}>{commentError || (sent ? t("Your reply has been added to the ticket.") : "")}</p>
      </form>}
    </div> : null}
    {!loading && cursor && !ticketId ? <Button variant="outline" className="mt-4" onClick={() => void loadMore()} disabled={loadingMore}>{t(loadingMore ? "Loading…" : "Load more tickets")}</Button> : null}
  </Surface>
}
