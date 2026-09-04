import { useEffect, useRef, useState, type FormEvent } from "react"
import { ArrowLeft, RefreshCw, Send } from "@/components/icons/hugeicons"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { SUPPORT_TICKET_SUBMITTED_EVENT } from "@/components/multideck/support-ticket-dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { addSupportTicketComment, getSupportTicket, listSupportTickets, type SupportTicketConversation, type SupportTicketMessage, type SupportTicketSummary } from "@/lib/support-ticket"

const statusLabels = { new: "Open", in_progress: "In progress", waiting_for_customer: "Waiting for your reply", resolved: "Resolved", closed: "Closed" }
const mergeMessages = (existing: SupportTicketMessage[], incoming: SupportTicketMessage[]) => [...new Map([...existing, ...incoming].map((message) => [message.id, message])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

// A complete Settings workflow, composed from existing Multideck-owned parts.
export function SupportTicketWorkspace({ ticketId, navigate }: { ticketId: string | null; navigate: (path: string) => void }) {
  const { t, language } = useLanguage()
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([])
  const [conversation, setConversation] = useState<SupportTicketConversation | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [commentError, setCommentError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const submission = useRef<{ body: string; key: string } | null>(null)
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  const showStatus = (ticket: SupportTicketSummary) => <StatusPill tone={ticket.status === "resolved" || ticket.status === "closed" ? "green" : "amber"}>{t(statusLabels[ticket.status] || "Status unavailable")}</StatusPill>

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
    if (!ticketId || sending) return
    const body = draft.trim()
    if (!body || body.length > 12000) { setCommentError(t("Write a reply of up to 12,000 characters.")); return }
    if (!submission.current || submission.current.body !== body) submission.current = { body, key: crypto.randomUUID() }
    setSending(true)
    setCommentError(null)
    setSent(false)
    try {
      const result = await addSupportTicketComment(ticketId, body, submission.current.key)
      setConversation((current) => current ? { ...current, messages: mergeMessages(current.messages, [result.message]) } : current)
      setDraft("")
      submission.current = null
      setSent(true)
      setAttempt((value) => value + 1)
    } catch { setCommentError(t("Your reply could not be confirmed. Your text is still here; try again.")) }
    finally { setSending(false) }
  }

  return <Surface padding="lg" className="mt-[var(--md-page-stack-gap)] min-w-0">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {ticketId ? <Button variant="ghost" onClick={() => navigate("/settings?tab=support")} disabled={sending}><ArrowLeft className="size-4" aria-hidden="true" />{t("Your tickets")}</Button> : <h2 className="text-[16px] font-medium">{t("Your tickets")}</h2>}
      <Button variant="outline" disabled={loading || sending} onClick={() => setAttempt((value) => value + 1)}><RefreshCw className="size-4" aria-hidden="true" />{t("Refresh")}</Button>
    </div>
    {error ? <p role="alert" className="mt-4 text-sm text-[var(--md-red)]">{error}</p> : null}
    {loading ? <DotGridLoader label="Loading support details…" size="sm" className="my-5" /> : null}
    {!loading && !error && !ticketId ? <div className="mt-4 divide-y divide-[var(--md-hairline)]">
      {tickets.length ? tickets.map((ticket) => <button key={ticket.id} type="button" onClick={() => navigate(`/settings?tab=support&ticket=${encodeURIComponent(ticket.id)}`)} className="flex w-full flex-wrap items-center justify-between gap-3 py-4 text-left outline-none hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]">
        <span className="min-w-0 flex-1"><span data-i18n-skip className="block text-sm font-medium break-words">{ticket.reference} · {ticket.title}</span><span className="mt-1 block text-xs text-[var(--md-subtle)]">{date(ticket.updatedAt)}</span></span>{showStatus(ticket)}
      </button>) : <p className="py-5 text-sm text-[var(--md-text)]">{t("You have no support tickets yet. Submit a ticket above or from the sidebar.")}</p>}
    </div> : null}
    {!loading && ticketId && conversation ? <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-medium">{conversation.ticket.reference}</h2>{showStatus(conversation.ticket)}</div>
      <h3 data-i18n-skip className="mt-3 text-base font-medium break-words">{conversation.ticket.title}</h3>
      <p data-i18n-skip className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--md-text)]">{conversation.ticket.description}</p>
      <h3 className="mt-7 text-sm font-medium">{t("Conversation")}</h3>
      {!conversation.messages.length ? <p className="mt-3 text-sm text-[var(--md-text)]">{t("No replies yet. The support team will reply here and by email.")}</p> : <ol className="mt-3 divide-y divide-[var(--md-hairline)]">
        {conversation.messages.map((message) => <li key={message.id} className="py-4"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><span className="font-medium">{message.authorName} · {t(message.authorType === "staff" ? "Support team" : "You")}</span><time dateTime={message.createdAt} className="text-[var(--md-subtle)]">{date(message.createdAt)}</time></div><p data-i18n-skip className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--md-text)]">{message.body}</p></li>)}
      </ol>}
      {conversation.ticket.status === "closed" ? <p className="mt-5 text-sm text-[var(--md-text)]">{t("This ticket is closed. Submit a new ticket if you need more help.")}</p> : <form onSubmit={sendComment} className="mt-5 grid gap-3">
        <label htmlFor="support-reply" className="text-sm font-medium">{t("Reply to support")}</label>
        <Textarea id="support-reply" value={draft} maxLength={12000} disabled={sending} onChange={(event) => { setDraft(event.target.value); setSent(false) }} aria-invalid={Boolean(commentError) || undefined} aria-describedby="support-reply-feedback" className="min-h-28" />
        <p id="support-reply-feedback" role={commentError ? "alert" : "status"} className="text-xs text-[var(--md-text)]">{commentError || (sent ? t("Your reply has been added to the ticket.") : t("Your reply is shared with the Multideck support team."))}</p>
        <div className="flex justify-end"><Button type="submit" disabled={sending || Boolean(error)}><Send className="size-4" aria-hidden="true" />{t(sending ? "Sending reply…" : "Send reply")}</Button></div>
      </form>}
    </div> : null}
    {!loading && cursor ? <Button variant="outline" className="mt-4" onClick={() => void loadMore()} disabled={loadingMore}>{t(loadingMore ? "Loading…" : ticketId ? "Load earlier replies" : "Load more tickets")}</Button> : null}
  </Surface>
}
