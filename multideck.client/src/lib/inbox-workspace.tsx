import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  listInboxConnections,
  listMailboxes,
  resolveMailboxForProvider,
  type InboxConnection,
  type MailFolder,
  type MailProvider,
  type Mailbox,
} from "@/lib/inbox-api"

export type InboxNavigationView = "all" | "shared" | "sent" | "drafts" | "archive" | "spam" | "trash"
export type InboxAccountLoadState = "loading" | "ready" | "error"

type InboxWorkspaceValue = {
  connections: InboxConnection[]
  mailboxes: Mailbox[]
  accountState: InboxAccountLoadState
  accountError: string | null
  provider: MailProvider | null
  mailboxId: string | null
  folder: MailFolder
  view: InboxNavigationView
  refreshAccounts: () => Promise<Mailbox[] | null>
  selectProvider: (provider: MailProvider) => void
  selectMailbox: (mailbox: Mailbox) => void
  selectView: (view: InboxNavigationView) => void
  adjustMailboxUnread: (mailboxId: string, delta: number) => void
}

const InboxWorkspaceContext = createContext<InboxWorkspaceValue | null>(null)

const supportedViews = new Set<InboxNavigationView>(["all", "shared", "sent", "drafts", "archive", "spam", "trash"])

function readInitialSelection() {
  if (typeof window === "undefined") {
    return { provider: null, mailboxId: null, view: "all" as InboxNavigationView }
  }

  const params = new URLSearchParams(window.location.search)
  const rawProvider = params.get("provider")
  const rawView = params.get("view")
  const provider: MailProvider | null = rawProvider === "gmail" || rawProvider === "outlook" ? rawProvider : null
  return {
    provider,
    mailboxId: params.get("mailbox"),
    view: rawView && supportedViews.has(rawView as InboxNavigationView)
      ? rawView as InboxNavigationView
      : "all",
  }
}

function folderForView(view: InboxNavigationView): MailFolder {
  if (view === "sent" || view === "drafts" || view === "archive" || view === "spam" || view === "trash") return view
  return "inbox"
}

function preferredMailbox(
  mailboxes: Mailbox[],
  provider: MailProvider,
  view: InboxNavigationView,
  currentMailboxId: string | null,
) {
  const providerMailboxes = mailboxes.filter((mailbox) => mailbox.provider === provider)
  const requested = providerMailboxes.find((mailbox) => mailbox.id === currentMailboxId)
  const wantsShared = view === "shared"

  if (view !== "all" && view !== "shared") {
    return requested ?? resolveMailboxForProvider(providerMailboxes, provider, null)
  }
  if (requested && (wantsShared ? requested.kind !== "personal" : requested.kind === "personal")) return requested
  if (wantsShared) return providerMailboxes.find((mailbox) => mailbox.kind !== "personal") ?? null
  return providerMailboxes.find((mailbox) => mailbox.isDefault && mailbox.kind === "personal")
    ?? providerMailboxes.find((mailbox) => mailbox.kind === "personal")
    ?? null
}

function writeSelection(provider: MailProvider | null, mailboxId: string | null, view: InboxNavigationView) {
  if (typeof window === "undefined" || window.location.pathname !== "/inbox") return
  const url = new URL(window.location.href)
  // Fixture mail is never a fallback for the real Inbox workspace.
  url.searchParams.delete("fixture")
  if (provider) url.searchParams.set("provider", provider)
  else url.searchParams.delete("provider")
  if (mailboxId) url.searchParams.set("mailbox", mailboxId)
  else url.searchParams.delete("mailbox")
  if (view === "all") url.searchParams.delete("view")
  else url.searchParams.set("view", view)
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
}

export function InboxWorkspaceProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(readInitialSelection, [])
  const [connections, setConnections] = useState<InboxConnection[]>([])
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [accountState, setAccountState] = useState<InboxAccountLoadState>("loading")
  const [accountError, setAccountError] = useState<string | null>(null)
  const [provider, setProvider] = useState<MailProvider | null>(initial.provider)
  const [mailboxId, setMailboxId] = useState<string | null>(initial.mailboxId)
  const [view, setView] = useState<InboxNavigationView>(initial.view)

  const refreshAccounts = useCallback(async () => {
    setAccountState("loading")
    setAccountError(null)
    try {
      const [nextConnections, nextMailboxes] = await Promise.all([listInboxConnections(), listMailboxes()])
      setConnections(nextConnections)
      setMailboxes(nextMailboxes)
      setAccountState("ready")
      return nextMailboxes
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Unable to load your mail connections.")
      setAccountState("error")
      return null
    }
  }, [])

  useEffect(() => {
    void refreshAccounts()
  }, [refreshAccounts])

  // Resolve URL state only after the authenticated mailbox list arrives. Invalid
  // or stale mailbox ids fail closed to a mailbox the signed-in user can access.
  useEffect(() => {
    if (accountState !== "ready" || mailboxes.length === 0) return
    const availableProviders = (["gmail", "outlook"] as MailProvider[])
      .filter((candidate) => mailboxes.some((mailbox) => mailbox.provider === candidate))
    const nextProvider = provider && availableProviders.includes(provider)
      ? provider
      : mailboxes.find((mailbox) => mailbox.isDefault)?.provider ?? availableProviders[0]
    if (!nextProvider) return

    let nextView = view
    let nextMailbox = preferredMailbox(mailboxes, nextProvider, nextView, mailboxId)
    if (!nextMailbox && nextView === "shared") {
      nextView = "all"
      nextMailbox = preferredMailbox(mailboxes, nextProvider, nextView, mailboxId)
    }

    setProvider(nextProvider)
    setView(nextView)
    setMailboxId(nextMailbox?.id ?? null)
    writeSelection(nextProvider, nextMailbox?.id ?? null, nextView)
  }, [accountState, mailboxId, mailboxes, provider, view])

  const applySelection = useCallback((nextProvider: MailProvider, nextView: InboxNavigationView, currentMailboxId: string | null) => {
    const nextMailbox = preferredMailbox(mailboxes, nextProvider, nextView, currentMailboxId)
    const resolvedView = nextMailbox || nextView !== "shared" ? nextView : "all"
    const resolvedMailbox = nextMailbox ?? preferredMailbox(mailboxes, nextProvider, resolvedView, currentMailboxId)
    setProvider(nextProvider)
    setView(resolvedView)
    setMailboxId(resolvedMailbox?.id ?? null)
    writeSelection(nextProvider, resolvedMailbox?.id ?? null, resolvedView)
  }, [mailboxes])

  const selectProvider = useCallback((nextProvider: MailProvider) => {
    applySelection(nextProvider, view, mailboxId)
  }, [applySelection, mailboxId, view])

  const selectMailbox = useCallback((mailbox: Mailbox) => {
    const nextView: InboxNavigationView = mailbox.kind === "personal" ? "all" : "shared"
    setProvider(mailbox.provider)
    setMailboxId(mailbox.id)
    setView(nextView)
    writeSelection(mailbox.provider, mailbox.id, nextView)
  }, [])

  const selectView = useCallback((nextView: InboxNavigationView) => {
    if (!provider) return
    applySelection(provider, nextView, mailboxId)
  }, [applySelection, mailboxId, provider])

  const adjustMailboxUnread = useCallback((targetMailboxId: string, delta: number) => {
    setMailboxes((current) => current.map((mailbox) =>
      mailbox.id === targetMailboxId
        ? { ...mailbox, unreadCount: Math.max(0, mailbox.unreadCount + delta) }
        : mailbox))
  }, [])

  const value = useMemo<InboxWorkspaceValue>(() => ({
    connections,
    mailboxes,
    accountState,
    accountError,
    provider,
    mailboxId,
    folder: folderForView(view),
    view,
    refreshAccounts,
    selectProvider,
    selectMailbox,
    selectView,
    adjustMailboxUnread,
  }), [
    accountError,
    accountState,
    adjustMailboxUnread,
    connections,
    mailboxId,
    mailboxes,
    provider,
    refreshAccounts,
    selectMailbox,
    selectProvider,
    selectView,
    view,
  ])

  return <InboxWorkspaceContext.Provider value={value}>{children}</InboxWorkspaceContext.Provider>
}

export function useInboxWorkspace() {
  const context = useContext(InboxWorkspaceContext)
  if (!context) throw new Error("useInboxWorkspace must be used inside InboxWorkspaceProvider")
  return context
}

export function useOptionalInboxWorkspace() {
  return useContext(InboxWorkspaceContext)
}
