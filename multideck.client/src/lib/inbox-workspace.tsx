import {
  createContext,
  type Dispatch,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
  type ReactNode,
} from "react"
import {
  getThread,
  listThreads,
  loadInboxWorkspace,
  mergeThreadPage,
  resolveMailboxForProvider,
  threadCacheKey,
  type InboxConnection,
  type InboxThreadDetail,
  type MailFolder,
  type MailProvider,
  type Mailbox,
  type ThreadCacheEntry,
  type ThreadPage,
  type ThreadQuery,
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
  threadCache: Record<string, ThreadCacheEntry>
  setThreadCache: Dispatch<SetStateAction<Record<string, ThreadCacheEntry>>>
  refreshAccounts: () => Promise<Mailbox[] | null>
  fetchThreadPage: (request: ThreadQuery, append?: boolean, force?: boolean) => Promise<ThreadPage>
  readThreadDetail: (threadId: string) => InboxThreadDetail | null
  fetchThreadDetail: (threadId: string, force?: boolean) => Promise<InboxThreadDetail>
  prefetchThreadDetail: (threadId: string) => void
  rememberThreadDetail: (detail: InboxThreadDetail) => void
  selectProvider: (provider: MailProvider) => void
  selectMailbox: (mailbox: Mailbox) => void
  selectView: (view: InboxNavigationView) => void
  adjustMailboxUnread: (mailboxId: string, delta: number) => void
}

const InboxWorkspaceContext = createContext<InboxWorkspaceValue | null>(null)
const threadDetailCacheTtlMs = 60_000

const supportedViews = new Set<InboxNavigationView>(["all", "shared", "sent", "drafts", "archive", "spam", "trash"])

function readInitialSelection() {
  if (typeof window === "undefined" || window.location.pathname !== "/inbox") {
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

export function InboxWorkspaceProvider({ children, cacheScope }: { children: ReactNode; cacheScope: string | null }) {
  const initial = useMemo(readInitialSelection, [])
  const [connections, setConnections] = useState<InboxConnection[]>([])
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [accountState, setAccountState] = useState<InboxAccountLoadState>("loading")
  const [accountError, setAccountError] = useState<string | null>(null)
  const [provider, setProvider] = useState<MailProvider | null>(initial.provider)
  const [mailboxId, setMailboxId] = useState<string | null>(initial.mailboxId)
  const [view, setView] = useState<InboxNavigationView>(initial.view)
  const [threadCache, setThreadCache] = useState<Record<string, ThreadCacheEntry>>({})
  const threadCacheRef = useRef(threadCache)
  const threadDetailsRef = useRef(new Map<string, { detail: InboxThreadDetail; cachedAt: number }>())
  const threadPageRequestsRef = useRef(new Map<string, Promise<ThreadPage>>())
  const threadDetailRequestsRef = useRef(new Map<string, Promise<InboxThreadDetail>>())

  useEffect(() => {
    threadCacheRef.current = threadCache
  }, [threadCache])

  const refreshAccounts = useCallback(async () => {
    if (!cacheScope) return null
    setAccountState("loading")
    setAccountError(null)
    try {
      const workspace = await loadInboxWorkspace()
      setConnections(workspace.connections)
      setMailboxes(workspace.mailboxes)
      setAccountState("ready")
      return workspace.mailboxes
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Unable to load your mail connections.")
      setAccountState("error")
      return null
    }
  }, [cacheScope])

  useEffect(() => {
    setConnections([])
    setMailboxes([])
    setThreadCache({})
    threadCacheRef.current = {}
    threadDetailsRef.current.clear()
    threadPageRequestsRef.current.clear()
    threadDetailRequestsRef.current.clear()
    if (!cacheScope) {
      setAccountState("loading")
      return
    }
    void refreshAccounts()
  }, [cacheScope, refreshAccounts])

  const fetchThreadPage = useCallback(async (request: ThreadQuery, append = false, force = false) => {
    const key = threadCacheKey(request.mailboxId, request.folder ?? "inbox", request.query ?? "")
    const existing = threadCacheRef.current[key]
    if (!append && !force && existing) {
      return { items: existing.items, nextCursor: existing.nextCursor, hasMore: existing.hasMore }
    }
    const requestKey = `${key}::${request.cursor ?? "first"}`
    const pending = threadPageRequestsRef.current.get(requestKey)
    if (pending) return pending

    const next = listThreads(request)
      .then((page) => {
        setThreadCache((current) => {
          const updated = { ...current, [key]: mergeThreadPage(current[key], page, append) }
          threadCacheRef.current = updated
          return updated
        })
        return page
      })
      .finally(() => threadPageRequestsRef.current.delete(requestKey))
    threadPageRequestsRef.current.set(requestKey, next)
    return next
  }, [])

  const readThreadDetail = useCallback((threadId: string) => {
    const cached = threadDetailsRef.current.get(threadId)
    if (!cached) return null
    if (Date.now() - cached.cachedAt <= threadDetailCacheTtlMs) return cached.detail
    threadDetailsRef.current.delete(threadId)
    return null
  }, [])
  const rememberThreadDetail = useCallback((detail: InboxThreadDetail) => {
    threadDetailsRef.current.set(detail.id, { detail, cachedAt: Date.now() })
  }, [])
  const fetchThreadDetail = useCallback(async (threadId: string, force = false) => {
    const cached = readThreadDetail(threadId)
    if (!force && cached) return cached
    const pending = threadDetailRequestsRef.current.get(threadId)
    if (!force && pending) return pending
    const next = getThread(threadId)
      .then((detail) => {
        threadDetailsRef.current.set(threadId, { detail, cachedAt: Date.now() })
        return detail
      })
      .finally(() => threadDetailRequestsRef.current.delete(threadId))
    threadDetailRequestsRef.current.set(threadId, next)
    return next
  }, [readThreadDetail])
  const prefetchThreadDetail = useCallback((threadId: string) => {
    if (readThreadDetail(threadId) || threadDetailRequestsRef.current.has(threadId)) return
    void fetchThreadDetail(threadId).catch(() => undefined)
  }, [fetchThreadDetail, readThreadDetail])

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

  // Warm the first visible page as soon as the account bootstrap resolves.
  // This runs behind the rest of the app and is shared with InboxPage, so an
  // operator arriving a moment later sees rows without starting another call.
  useEffect(() => {
    if (accountState !== "ready" || !mailboxId) return
    void fetchThreadPage({ mailboxId, folder: folderForView(view), limit: 25 }).catch(() => undefined)
  }, [accountState, fetchThreadPage, mailboxId, view])

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
    threadCache,
    setThreadCache,
    refreshAccounts,
    fetchThreadPage,
    readThreadDetail,
    fetchThreadDetail,
    prefetchThreadDetail,
    rememberThreadDetail,
    selectProvider,
    selectMailbox,
    selectView,
    adjustMailboxUnread,
  }), [
    accountError,
    accountState,
    adjustMailboxUnread,
    connections,
    fetchThreadDetail,
    fetchThreadPage,
    mailboxId,
    mailboxes,
    provider,
    prefetchThreadDetail,
    readThreadDetail,
    rememberThreadDetail,
    refreshAccounts,
    selectMailbox,
    selectProvider,
    selectView,
    threadCache,
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
