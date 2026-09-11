import { useEffect, useRef, useState, type ReactNode } from "react"
import { Mail, Plus, X } from "@/components/icons/hugeicons"
import { DexterEmailComposeCard } from "@/components/multideck/dexter-email-compose-card"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import type { DexterEmailDraft } from "@/lib/dexter-api"
import { getSupabaseSession, supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

function emptyDraft(email: string, name?: string): DexterEmailDraft {
  return { id: crypto.randomUUID(), requestedAction: "send", mode: "new", mailboxId: null, sourceMessageId: null, threadId: null,
    to: [{ address: email, displayName: name || null }], cc: [], bcc: [], subject: "", bodyText: "", trackOpens: false, delivery: { status: "draft" } }
}

/** A person’s email opens in a centred dialog. Drafts belong to this signed-in user and tab. */
export function ContactEmailAction({ email, name, children, className, preview = false }: {
  email: string; name?: string; children?: ReactNode; className?: string; preview?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DexterEmailDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [storageKey, setStorageKey] = useState<string | null>(null)
  const latestDraft = useRef<DexterEmailDraft | null>(null)

  useEffect(() => {
    // Never carry a previous operator's draft through sign-out in a shared browser.
    const listener = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        if (storageKey) sessionStorage.removeItem(storageKey)
        setOpen(false); setDraft(null); latestDraft.current = null; setStorageKey(null)
      }
    })
    return () => listener?.data.subscription.unsubscribe()
  }, [storageKey])

  async function openComposer(next: boolean) {
    setOpen(next)
    if (!next) return
    setError(null)
    try {
      const session = preview ? null : await getSupabaseSession()
      if (!preview && !session) throw new Error(t("Sign in again to compose an email."))
      const key = preview ? null : `md-contact-email:${session!.user.id}:${email.toLowerCase()}`
      let nextDraft = storageKey === key && latestDraft.current ? latestDraft.current : emptyDraft(email, name)
      if (key) {
        try {
          const saved = JSON.parse(sessionStorage.getItem(key) || "null")
          if (saved?.draft?.id && typeof saved.draft.bodyText === "string" && Array.isArray(saved.draft.to) && Date.now() - saved.savedAt < 86_400_000) nextDraft = saved.draft
        } catch { /* Storage unavailable: keep the editor in memory. */ }
      }
      setStorageKey(key); latestDraft.current = nextDraft; setDraft(nextDraft)
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("The email composer could not be opened.")) }
  }

  function retainDraft(next: DexterEmailDraft) {
    latestDraft.current = next
    // Delivery acknowledgements update the controls without remounting the editor.
    setDraft(current => current?.delivery.status !== next.delivery.status ? next : current)
    if (!storageKey) return
    try { sessionStorage.setItem(storageKey, JSON.stringify({ draft: next, savedAt: Date.now() })) }
    catch { setError(t("This browser cannot retain the draft after a page refresh. Keep this page open.")) }
  }

  return <Dialog open={open} onOpenChange={(next) => void openComposer(next)}>
    <DialogTrigger asChild>
      <button type="button" aria-label={`${t("Email")} ${name || email}`} onClick={event => event.stopPropagation()}
        className={cn("inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-[var(--md-radius-sm)] text-start text-[var(--md-accent)] outline-none transition-colors duration-150 hover:text-[var(--md-ink)] focus-visible:ring-2 focus-visible:ring-[var(--md-ring)] active:scale-[0.98] motion-reduce:transform-none", className)}>
        {children ?? <><Mail className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate" dir="ltr" data-i18n-skip>{email}</span></>}
      </button>
    </DialogTrigger>
    <DialogContent showCloseButton={false} aria-describedby={undefined} overlayClassName="bg-black/20"
      onClick={event => event.stopPropagation()}
      onEscapeKeyDown={event => { if (event.target instanceof Element && event.target.closest("[data-email-refinement]")) event.preventDefault() }}
      className="contact-compose-dialog w-[calc(100vw-24px)] max-w-[620px] sm:max-w-[620px] max-h-[calc(100dvh-32px)] gap-0 overflow-y-auto rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <DialogTitle className="truncate text-[13px] font-medium">{t("Email")} <span data-i18n-skip>{name || email}</span></DialogTitle>
        <div className="flex items-center gap-1">
          {draft?.delivery.status === "sent" ? <Button variant="ghost" size="sm" onClick={() => { const next = emptyDraft(email, name); setDraft(next); retainDraft(next) }}><Plus className="size-3.5" />{t("New email")}</Button> : null}
          <Button type="button" variant="ghost" size="icon" aria-label={t("Close email composer")} onClick={() => setOpen(false)} className="size-8 active:scale-[0.98] motion-reduce:transform-none"><X className="size-4" /></Button>
        </div>
      </div>
      {error ? <p role="alert" className="px-5 py-3 text-[12px] text-[var(--md-red)]">{error}{!draft ? <Button variant="ghost" onClick={() => void openComposer(true)}>{t("Retry")}</Button> : null}</p> : null}
      {draft ? <DexterEmailComposeCard key={draft.id} messageId={draft.id} draft={latestDraft.current ?? draft} standalone preview={preview} onDraftChange={retainDraft} /> : !error ? <DotGridLoaderPanel label="Opening email composer" minHeight={220} /> : null}
    </DialogContent>
  </Dialog>
}
