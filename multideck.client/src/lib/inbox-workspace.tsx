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
  clearInlineAttachmentBlobCache,
  getThread,
  listThreads,
  loadInboxWorkspace,
  mergeThreadPage,
  prefetchThreadInlineAttachmentBlobUrls,
  resolveDefaultInboxProvider,
  resolveMailboxForProvider,
  threadCacheKey,
  type InboxConnection,
  type InboxThreadDetail,
  type MailFolder,
  type MailProvider,
  type Mailbox,
  type MailboxFolder,
  type ThreadCacheEntry,
  type ThreadPage,
  type ThreadQuery,
} from "@/lib/inbox-api"
import {
  inboxProviderPreferenceChangedEvent,
  loadDefaultInboxProvider,
} from "@/lib/inbox-provider-preference"

export type InboxNavigationView = "all" | "shared" | "suggested" | "sent" | "drafts" | "archive" | "spam" | "trash"
export type InboxAccountLoadState = "idle" | "loading" | "ready" | "error"

type InboxWorkspaceValue = {
  connections: InboxConnection[]
  mailboxes: Mailbox[]
  folders: MailboxFolder[]
  accountState: InboxAccountLoadState
  accountError: string | null
  provider: MailProvider | null
  mailboxId: string | null
  folderId: string | null
  selectedFolder: MailboxFolder | null
  folder: MailFolder
  view: InboxNavigationView
  threadCache: Record<string, ThreadCacheEntry>
  setThreadCache: Dispatch<SetStateAction<Record<string, ThreadCacheEntry>>>
  prepareAccounts: () => Promise<Mailbox[] | null>
  refreshAccounts: () => Promise<Mailbox[] | null>
  fetchThreadPage: (request: ThreadQuery, append?: boolean, force?: boolean) => Promise<ThreadPage>
  readThreadDetail: (threadId: string) => InboxThreadDetail | null
  fetchThreadDetail: (threadId: string, force?: boolean) => Promise<InboxThreadDetail>
  fetchOlderThreadMessages: (threadId: string, offset: number) => Promise<InboxThreadDetail>
  prefetchThreadDetail: (threadId: string) => void
  rememberThreadDetail: (detail: InboxThreadDetail) => void
  selectProvider: (provider: MailProvider) => void
  selectMailbox: (mailbox: Mailbox) => void
  selectView: (view: InboxNavigationView) => void
  selectFolder: (folder: MailboxFolder) => void
  adjustMailboxUnread: (mailboxId: string, delta: number) => void
}

const InboxWorkspaceContext = createContext<InboxWorkspaceValue | null>(null)
const threadDetailCacheTtlMs = 60_000

const supportedViews = new Set<InboxNavigationView>(["all", "shared", "suggested", "sent", "drafts", "archive", "spam", "trash"])

function readInitialSelection() {
  if (typeof window === "undefined" || window.location.pathname !== "/inbox") {
    return { provider: null, mailboxId: null, folderId: null, view: "all" as InboxNavigationView }
  }

  const params = new URLSearchParams(window.location.search)
  const rawProvider = params.get("provider")
  const rawView = params.get("view")
  const provider: MailProvider | null = rawProvider === "gmail" || rawProvider === "outlook" ? rawProvider : null
  return {
    provider,
    mailboxId: params.get("mailbox"),
    folderId: params.get("folder"),
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

function writeSelection(provider: MailProvider | null, mailboxId: string | null, view: InboxNavigationView, folderId: string | null = null) {
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
  if (folderId) url.searchParams.set("folder", folderId)
  else url.searchParams.delete("folder")
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
}

export function InboxWorkspaceProvider({
  children,
  cacheScope,
  active,
}: {
  children: ReactNode
  cacheScope: string | null
  active: boolean
}) {
  const initial = useMemo(readInitialSelection, [])
  const [connections, setConnections] = useState<InboxConnection[]>([])
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [folders, setFolders] = useState<MailboxFolder[]>([])
  const [accountState, setAccountState] = useState<InboxAccountLoadState>("idle")
  const [accountError, setAccountError] = useState<string | null>(null)
  const [defaultProvider, setDefaultProvider] = useState<MailProvider | null>(null)
  const [provider, setProvider] = useState<MailProvider | null>(initial.provider)
  const [mailboxId, setMailboxId] = useState<string | null>(initial.mailboxId)
  const [folderId, setFolderId] = useState<string | null>(initial.folderId)
  const [view, setView] = useState<InboxNavigationView>(initial.view)
  const [threadCache, setThreadCache] = useState<Record<string, ThreadCacheEntry>>({})
  const threadCacheRef = useRef(threadCache)
  const threadDetailsRef = useRef(new Map<string, { detail: InboxThreadDetail; cachedAt: number }>())
  const threadPageRequestsRef = useRef(new Map<string, Promise<ThreadPage>>())
  const threadDetailRequestsRef = useRef(new Map<string, Promise<InboxThreadDetail>>())
  const olderThreadRequestsRef = useRef(new Map<string, Promise<InboxThreadDetail>>())
  const accountRequestRef = useRef<{ scope: string; promise: Promise<Mailbox[] | null> } | null>(null)
  const accountStateRef = useRef<InboxAccountLoadState>(accountState)
  const mailboxesRef = useRef(mailboxes)
  const accountScopeRef = useRef(cacheScope)

  accountStateRef.current = accountState
  mailboxesRef.current = mailboxes
  accountScopeRef.current = cacheScope

  useEffect(() => {
    threadCacheRef.current = threadCache
  }, [threadCache])

  const loadAccounts = useCallback((force: boolean) => {
    const requestScope = cacheScope
    if (!requestScope) return Promise.resolve(null)
    const pending = accountRequestRef.current
    if (pending?.scope === requestScope) return pending.promise
    if (!force && accountStateRef.current === "ready") return Promise.resolve(mailboxesRef.current)

    accountStateRef.current = "loading"
    setAccountState("loading")
    setAccountError(null)
    const request = Promise.all([
      loadInboxWorkspace(),
      loadDefaultInboxProvider().catch((error: unknown) => {
        console.warn("Your default inbox provider could not be loaded from your profile.", error)
        return null
      }),
    ])
      .then(([workspace, savedDefaultProvider]) => {
        if (accountScopeRef.current !== requestScope) return null
        mailboxesRef.current = workspace.mailboxes
        accountStateRef.current = "ready"
        setConnections(workspace.connections)
        setMailboxes(workspace.mailboxes)
        setFolders(workspace.folders)
        setDefaultProvider(savedDefaultProvider)
        setAccountState("ready")
        return workspace.mailboxes
      })
      .catch((error: unknown) => {
        if (accountScopeRef.current === requestScope) {
          accountStateRef.current = "error"
          setAccountError(error instanceof Error ? error.message : "Unable to load your mail connections.")
          setAccountState("error")
        }
        return null
      })
      .finally(() => {
        if (accountRequestRef.current?.promise === request) accountRequestRef.current = null
      })
    accountRequestRef.current = { scope: requestScope, promise: request }
    return request
  }, [cacheScope])

  const prepareAccounts = useCallback(() => loadAccounts(false), [loadAccounts])
  const refreshAccounts = useCallback(() => loadAccounts(true), [loadAccounts])

  useEffect(() => {
    setConnections([])
    setMailboxes([])
    setFolders([])
    setDefaultProvider(null)
    setAccountError(null)
    setAccountState("idle")
    accountStateRef.current = "idle"
    mailboxesRef.current = []
    accountRequestRef.current = null
    setThreadCache({})
    threadCacheRef.current = {}
    threadDetailsRef.current.clear()
    threadPageRequestsRef.current.clear()
    threadDetailRequestsRef.current.clear()
    olderThreadRequestsRef.current.clear()
    clearInlineAttachmentBlobCache()
  }, [cacheScope])

  useEffect(() => {
    if (!active || !cacheScope) return
    void prepareAccounts()
  }, [active, cacheScope, prepareAccounts])

  useEffect(() => {
    function rememberDefaultProvider(event: Event) {
      const nextProvider = (event as CustomEvent<MailProvider>).detail
      if (nextProvider === "gmail" || nextProvider === "outlook") setDefaultProvider(nextProvider)
    }

    window.addEventListener(inboxProviderPreferenceChangedEvent, rememberDefaultProvider)
    return () => window.removeEventListener(inboxProviderPreferenceChangedEvent, rememberDefaultProvider)
  }, [])

  const fetchThreadPage = useCallback(async (request: ThreadQuery, append = false, force = false) => {
    const key = threadCacheKey(request.mailboxId, request.folder ?? "inbox", request.query ?? "", request.folderId)
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
      .then(async (detail) => {
        // Conversation intent includes its private inline images. Start this
        // before selection and only publish the cached detail once they settle,
        // so even a fast click cannot reveal the body ahead of its CID images.
        await prefetchThreadInlineAttachmentBlobUrls(detail)
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
  const fetchOlderThreadMessages = useCallback(async (threadId: string, offset: number) => {
    const safeOffset = Math.max(0, Math.floor(offset))
    const requestKey = `${threadId}:${safeOffset}`
    const pending = olderThreadRequestsRef.current.get(requestKey)
    if (pending) return pending

    const next = getThread(threadId, { offset: safeOffset, limit: 25 })
      .then(async (page) => {
        await prefetchThreadInlineAttachmentBlobUrls(page)
        const current = readThreadDetail(threadId)
        if (!current) {
          rememberThreadDetail(page)
          return page
        }
        const seen = new Set<string>()
        const messages = [...page.messages, ...current.messages].filter((message) => {
          if (seen.has(message.id)) return false
          seen.add(message.id)
          return true
        })
        const detail: InboxThreadDetail = {
          ...current,
          unreadCount: page.unreadCount,
          readOnly: page.readOnly,
          messageTotal: page.messageTotal,
          messageOffset: 0,
          messageLimit: messages.length,
          hasOlderMessages: page.hasOlderMessages,
          messages,
          summary: page.summary,
        }
        rememberThreadDetail(detail)
        return detail
      })
      .finally(() => olderThreadRequestsRef.current.delete(requestKey))
    olderThreadRequestsRef.current.set(requestKey, next)
    return next
  }, [readThreadDetail, rememberThreadDetail])

  // Resolve URL state only after the authenticated mailbox list arrives. Invalid
  // or stale mailbox ids fail closed to a mailbox the signed-in user can access.
  useEffect(() => {
    if (accountState !== "ready" || mailboxes.length === 0) return
    const requestedProvider = readInitialSelection().provider
    const nextProvider = resolveDefaultInboxProvider(mailboxes, defaultProvider, requestedProvider)
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
    const nextFolderId = folders.some((folder) => folder.id === folderId && folder.mailboxId === nextMailbox?.id) ? folderId : null
    setFolderId(nextFolderId)
    writeSelection(nextProvider, nextMailbox?.id ?? null, nextView, nextFolderId)
  }, [accountState, defaultProvider, folderId, folders, mailboxId, mailboxes, provider, view])

  // Warm only the first visible list page after account bootstrap. Conversation
  // bodies and private inline images stay intent-driven through row hover/focus
  // or selection, so the rest of Multideck never downloads email bodies merely
  // because the authenticated shell mounted.
  useEffect(() => {
    if (!active || accountState !== "ready" || !mailboxId || view === "suggested") return
    void fetchThreadPage({ mailboxId, folder: folderForView(view), folderId, limit: 25 })
      .catch(() => undefined)
  }, [accountState, active, fetchThreadPage, folderId, mailboxId, view])

  const applySelection = useCallback((nextProvider: MailProvider, nextView: InboxNavigationView, currentMailboxId: string | null) => {
    const nextMailbox = preferredMailbox(mailboxes, nextProvider, nextView, currentMailboxId)
    const resolvedView = nextMailbox || nextView !== "shared" ? nextView : "all"
    const resolvedMailbox = nextMailbox ?? preferredMailbox(mailboxes, nextProvider, resolvedView, currentMailboxId)
    setProvider(nextProvider)
    setView(resolvedView)
    setMailboxId(resolvedMailbox?.id ?? null)
    setFolderId(null)
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
    setFolderId(null)
    writeSelection(mailbox.provider, mailbox.id, nextView)
  }, [])

  const selectView = useCallback((nextView: InboxNavigationView) => {
    if (!provider) return
    applySelection(provider, nextView, mailboxId)
  }, [applySelection, mailboxId, provider])

  const selectFolder = useCallback((nextFolder: MailboxFolder) => {
    const mailbox = mailboxes.find((candidate) => candidate.id === nextFolder.mailboxId)
    if (!mailbox) return
    const nextView: InboxNavigationView = mailbox.kind === "personal" ? "all" : "shared"
    setProvider(mailbox.provider)
    setMailboxId(mailbox.id)
    setView(nextView)
    setFolderId(nextFolder.id)
    writeSelection(mailbox.provider, mailbox.id, nextView, nextFolder.id)
  }, [mailboxes])

  const adjustMailboxUnread = useCallback((targetMailboxId: string, delta: number) => {
    setMailboxes((current) => current.map((mailbox) =>
      mailbox.id === targetMailboxId
        ? { ...mailbox, unreadCount: Math.max(0, mailbox.unreadCount + delta) }
        : mailbox))
  }, [])

  const value = useMemo<InboxWorkspaceValue>(() => ({
    connections,
    mailboxes,
    folders,
    accountState,
    accountError,
    provider,
    mailboxId,
    folderId,
    selectedFolder: folders.find((folder) => folder.id === folderId) ?? null,
    folder: folderForView(view),
    view,
    threadCache,
    setThreadCache,
    prepareAccounts,
    refreshAccounts,
    fetchThreadPage,
    readThreadDetail,
    fetchThreadDetail,
    fetchOlderThreadMessages,
    prefetchThreadDetail,
    rememberThreadDetail,
    selectProvider,
    selectMailbox,
    selectView,
    selectFolder,
    adjustMailboxUnread,
  }), [
    accountError,
    accountState,
    adjustMailboxUnread,
    connections,
    fetchThreadDetail,
    fetchOlderThreadMessages,
    fetchThreadPage,
    folderId,
    folders,
    mailboxId,
    mailboxes,
    prepareAccounts,
    provider,
    prefetchThreadDetail,
    readThreadDetail,
    rememberThreadDetail,
    refreshAccounts,
    selectMailbox,
    selectProvider,
    selectView,
    selectFolder,
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
