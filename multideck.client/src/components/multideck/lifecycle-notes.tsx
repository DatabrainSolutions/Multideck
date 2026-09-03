import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import { Building2, Check, Loader2, MessageSquareText, MoreHorizontal, Pencil, RefreshCw, SendHorizontal, Trash2, UserRound, X } from "@/components/icons/hugeicons"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { DexterMentionInput } from "@/components/multideck/agent-dexter-components"
import { Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLanguage } from "@/i18n/language-provider"
import type { DexterMentionItem } from "@/data/dexter-mentions"
import { getApiAuthSession, getApiTeamUsersByIds } from "@/lib/api"
import {
  addLifecycleNote,
  deleteLifecycleNote,
  getLifecycleNotes,
  searchLifecycleNoteTargets,
  updateLifecycleNote,
  type LifecycleNote,
  type LifecycleNoteMention,
  type LifecycleNoteSubjectType,
  type LifecycleNoteTarget,
} from "@/lib/lifecycle-notes-api"
import { createProfilePhotoSignedUrls } from "@/lib/profile-photo"
import { authSupabase, supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"

type MentionWindow = {
  start: number
  end: number
  query: string
}

export type LifecycleNotesPreviewState = {
  notes: LifecycleNote[]
  targets: LifecycleNoteTarget[]
  canWrite?: boolean
  currentUserId?: string | null
  profilePhotoUrls?: Record<string, string>
}

function currentMentionWindow(value: string, cursor: number): MentionWindow | null {
  const prefix = value.slice(0, cursor)
  const match = prefix.match(/(?:^|\s)@([^@\n]{0,80})$/)
  if (!match) return null
  const query = match[1]
  const start = prefix.lastIndexOf("@")
  return start >= 0 ? { start, end: cursor, query } : null
}

function targetKey(target: Pick<LifecycleNoteMention, "type" | "id">) {
  return `${target.type}:${target.id}`
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : value.slice(0, 2)).toUpperCase()
}

function noteSourceLabel(note: LifecycleNote, currentSubject: LifecycleNoteSubjectType, t: (text: string) => string) {
  if (note.subjectType === currentSubject) return null
  if (note.subjectType === "quote") return t("Carried from quote")
  if (note.subjectType === "booking") return t("Carried from booking")
  return t("Added in Customs")
}

function renderBody(body: string, mentions: LifecycleNoteMention[]): ReactNode {
  const tokens = mentions
    .map((mention) => ({ mention, token: `@${mention.label}` }))
    .sort((left, right) => right.token.length - left.token.length)
  if (!tokens.length) return body

  const pattern = new RegExp(`(${tokens.map(({ token }) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g")
  return body.split(pattern).map((part, index) => {
    const matched = tokens.find(({ token }) => token === part)
    return matched ? (
      <span key={`${part}-${index}`} className="md-dexter-mention md-dexter-mention--static">
        {part}
      </span>
    ) : <Fragment key={`${part}-${index}`}>{part}</Fragment>
  })
}

function LifecycleNoteRow({
  note,
  currentSubject,
  isCurrentUser,
  profilePhotoUrl,
  onUpdate,
  onRequestDelete,
}: {
  note: LifecycleNote
  currentSubject: LifecycleNoteSubjectType
  isCurrentUser: boolean
  profilePhotoUrl?: string
  onUpdate: (noteId: string, body: string) => Promise<void>
  onRequestDelete: (note: LifecycleNote) => void
}) {
  const { language, t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(note.body)
  const [updating, setUpdating] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const source = noteSourceLabel(note, currentSubject, t)
  const created = new Date(note.createdAt)
  const createdLabel = Number.isNaN(created.getTime())
    ? note.createdAt
    : new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(created)
  const authorId = `lifecycle-note-author-${note.id}`
  const canManage = isCurrentUser && !note.deletedAt

  function beginEditing() {
    setEditDraft(note.body)
    setEditError(null)
    setEditing(true)
  }

  async function saveEdit() {
    const body = editDraft.trim()
    if (!body || body === note.body || updating) {
      if (body === note.body) setEditing(false)
      return
    }
    setUpdating(true)
    setEditError(null)
    try {
      await onUpdate(note.id, body)
      setEditing(false)
    } catch (reason) {
      setEditError(reason instanceof Error ? reason.message : t("The note could not be updated. Your changes are still here."))
    } finally {
      setUpdating(false)
    }
  }

  const actionItems = (kind: "context" | "dropdown") => kind === "context" ? (
    <>
      <ContextMenuLabel>{t("Your note")}</ContextMenuLabel>
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={beginEditing}><Pencil aria-hidden="true" />{t("Edit note")}</ContextMenuItem>
      <ContextMenuItem variant="destructive" onSelect={() => onRequestDelete(note)}><Trash2 aria-hidden="true" />{t("Delete note")}</ContextMenuItem>
    </>
  ) : (
    <>
      <DropdownMenuLabel>{t("Your note")}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={beginEditing}><Pencil aria-hidden="true" />{t("Edit note")}</DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => onRequestDelete(note)}><Trash2 aria-hidden="true" />{t("Delete note")}</DropdownMenuItem>
    </>
  )

  const avatar = (
    <Avatar className="mb-5 size-8 shrink-0 rounded-full">
      {profilePhotoUrl ? <AvatarImage src={profilePhotoUrl} alt="" className="rounded-full object-cover" /> : null}
      <AvatarFallback data-i18n-skip className="rounded-full bg-[var(--md-surface-tint)] text-[10px] font-medium text-[var(--md-ink)]">
        {initials(note.author.name)}
      </AvatarFallback>
    </Avatar>
  )

  const message = (
    <article
      dir="ltr"
      aria-labelledby={authorId}
      tabIndex={canManage ? 0 : undefined}
      className={cn("group/note flex w-full items-end gap-2.5 rounded-[var(--md-radius-lg)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a32)]", isCurrentUser ? "justify-end" : "justify-start")}
    >
      {!isCurrentUser ? avatar : null}
      <div className={cn("flex min-w-0 max-w-[min(82%,42rem)] flex-col", isCurrentUser ? "items-end" : "items-start")}>
        <div className="flex w-full items-center gap-1.5 px-1">
          <p id={authorId} data-i18n-skip dir="auto" className={cn("min-w-0 truncate text-[11px] font-medium text-[var(--md-text)]", isCurrentUser && "ms-auto text-end")}>
            {note.author.name}
          </p>
          {isCurrentUser ? <span className="shrink-0 text-[10px] text-[var(--md-subtle)]">{t("You")}</span> : null}
        </div>
        <div className={cn("mt-1 flex w-full items-center gap-1.5", isCurrentUser && "flex-row-reverse")}>
          <div
            className={cn(
              "min-w-0 flex-1 rounded-[var(--md-radius-xl)] px-3.5 py-2.5 shadow-[var(--md-shadow-line)]",
              isCurrentUser
                ? "rounded-br-[var(--md-radius-sm)] bg-[color-mix(in_srgb,var(--md-accent)_11%,var(--md-surface))]"
                : "rounded-bl-[var(--md-radius-sm)] bg-[var(--md-surface-tint)]",
              note.deletedAt && "bg-[var(--md-surface-tint)] shadow-none",
            )}
          >
            {editing ? (
              <div>
                <textarea
                  autoFocus
                  rows={3}
                  maxLength={4000}
                  value={editDraft}
                  dir="auto"
                  aria-label={t("Edit note")}
                  aria-describedby={editError ? `${authorId}-edit-error` : undefined}
                  onChange={(event) => { setEditDraft(event.target.value); setEditError(null) }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") { event.preventDefault(); setEditing(false); setEditError(null) }
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void saveEdit() }
                  }}
                  className="min-h-20 w-full resize-y bg-transparent text-[13px] leading-[1.55] text-[var(--md-ink)] outline-none placeholder:text-[var(--md-subtle)]"
                />
                <div className="mt-2 flex items-center justify-end gap-1.5">
                  <Button type="button" variant="ghost" size="sm" className="h-8 rounded-[var(--md-radius-md)] px-2.5" onClick={() => { setEditing(false); setEditError(null) }} disabled={updating}>
                    <X aria-hidden="true" />{t("Cancel")}
                  </Button>
                  <Button type="button" size="sm" className="h-8 rounded-[var(--md-radius-md)] px-2.5" onClick={() => void saveEdit()} disabled={!editDraft.trim() || editDraft.trim() === note.body || updating}>
                    {updating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}{t(updating ? "Saving" : "Save edit")}
                  </Button>
                </div>
                {editError ? <p id={`${authorId}-edit-error`} role="alert" data-i18n-skip dir="auto" className="mt-2 text-[11px] text-[var(--md-red)]">{editError}</p> : null}
              </div>
            ) : note.deletedAt ? (
              <p className="text-[12.5px] italic leading-5 text-[var(--md-subtle)]">{t("Note deleted")}</p>
            ) : (
              <p data-i18n-skip dir="auto" className="whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-[var(--md-ink)]">
                {renderBody(note.body, note.mentions)}
              </p>
            )}
          </div>
          {canManage && !editing ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon-sm" className="size-8 shrink-0 rounded-full text-[var(--md-subtle)] opacity-100 transition-opacity hover:text-[var(--md-ink)] sm:opacity-0 sm:group-hover/note:opacity-100 sm:group-focus-within/note:opacity-100" aria-label={t("Note actions")}>
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isCurrentUser ? "end" : "start"}>{actionItems("dropdown")}</DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <div className={cn("mt-1 flex flex-wrap items-center gap-x-1.5 px-1 text-[10.5px] text-[var(--md-subtle)]", isCurrentUser && "justify-end text-end")}>
          <time dateTime={note.createdAt}>{createdLabel}</time>
          {note.updatedAt && !note.deletedAt ? <><span aria-hidden="true">·</span><span>{t("Edited")}</span></> : null}
          {note.deletedAt ? <><span aria-hidden="true">·</span><span>{t("Deleted")}</span></> : null}
          {source ? <><span aria-hidden="true">·</span><span>{source}</span></> : null}
        </div>
      </div>
      {isCurrentUser ? avatar : null}
    </article>
  )

  if (!canManage) return message
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{message}</ContextMenuTrigger>
      <ContextMenuContent>{actionItems("context")}</ContextMenuContent>
    </ContextMenu>
  )
}

export function LifecycleNotes({
  subjectType,
  subjectId,
  className,
  previewState,
}: {
  subjectType: LifecycleNoteSubjectType
  subjectId: string | null
  className?: string
  previewState?: LifecycleNotesPreviewState
}) {
  const { language, t } = useLanguage()
  const listId = useId()
  const threadRef = useRef<HTMLDivElement | null>(null)
  const scrolledSubjectRef = useRef<string | null>(null)
  const [notes, setNotes] = useState<LifecycleNote[]>(previewState?.notes ?? [])
  const [currentUserId, setCurrentUserId] = useState<string | null>(previewState?.currentUserId ?? null)
  const [profilePhotoUrls, setProfilePhotoUrls] = useState<Map<string, string>>(
    () => new Map(Object.entries(previewState?.profilePhotoUrls ?? {})),
  )
  const [canWrite, setCanWrite] = useState(previewState?.canWrite ?? true)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(Boolean(subjectId && !previewState))
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [selectedMentions, setSelectedMentions] = useState<LifecycleNoteMention[]>([])
  const [mentionWindow, setMentionWindow] = useState<MentionWindow | null>(null)
  const [targets, setTargets] = useState<LifecycleNoteTarget[]>([])
  const [targetError, setTargetError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<LifecycleNote | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const normalizedSubjectId = subjectId?.trim() || null
  const authorIdSignature = useMemo(
    () => [...new Set(notes.flatMap((note) => note.author.id ? [note.author.id] : []))].sort().join("|"),
    [notes],
  )

  async function loadNotes(before: string | null = null) {
    if (!normalizedSubjectId || previewState) return
    const thread = threadRef.current
    const previousScrollHeight = before ? thread?.scrollHeight ?? 0 : 0
    before ? setLoadingEarlier(true) : setLoading(true)
    if (!before) setLoadError(null)
    try {
      const page = await getLifecycleNotes(subjectType, normalizedSubjectId, before)
      setNotes((current) => before ? [...current, ...page.notes.filter((note) => !current.some((existing) => existing.id === note.id))] : page.notes)
      setHasMore(page.hasMore)
      setCanWrite(page.canWrite)
      if (before && thread) {
        window.requestAnimationFrame(() => {
          thread.scrollTop += thread.scrollHeight - previousScrollHeight
        })
      }
    } catch (reason) {
      if (!before) {
        const message = reason instanceof Error ? reason.message.trim() : ""
        setLoadError(message && !/^notes could not be loaded\.?$/i.test(message)
          ? message
          : t("Check your connection and try again."))
      }
      else toast.error(t("Earlier notes could not be loaded"), { description: t("Try again when the connection is stable.") })
    } finally {
      setLoading(false)
      setLoadingEarlier(false)
    }
  }

  useEffect(() => {
    setDraft("")
    setSelectedMentions([])
    setMentionWindow(null)
    setSaveError(null)
    setPendingDelete(null)
    setDeleteError(null)
    if (previewState) {
      setNotes(previewState.notes)
      setCanWrite(previewState.canWrite ?? true)
      setCurrentUserId(previewState.currentUserId ?? null)
      setProfilePhotoUrls(new Map(Object.entries(previewState.profilePhotoUrls ?? {})))
      setHasMore(false)
      setLoading(false)
      setLoadError(null)
      return
    }
    setNotes([])
    setCurrentUserId(null)
    setProfilePhotoUrls(new Map())
    scrolledSubjectRef.current = null
    setCanWrite(false)
    setHasMore(false)
    if (normalizedSubjectId) void loadNotes()
    else setLoading(false)
    // Reload only when the canonical note subject changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSubjectId, subjectType, previewState])

  useEffect(() => {
    if (previewState || !normalizedSubjectId || !supabase) return
    const controller = new AbortController()
    let active = true

    void authSupabase!.auth.getSession().then(async ({ data, error }) => {
      if (error || !data.session?.access_token) return
      const session = await getApiAuthSession(data.session.access_token)
      if (!active) return
      setCurrentUserId(session.profile?.id ?? null)

      const authorIds = authorIdSignature ? authorIdSignature.split("|") : []
      if (!authorIds.length) {
        setProfilePhotoUrls(new Map())
        return
      }
      const users = await getApiTeamUsersByIds(data.session.access_token, authorIds, controller.signal)
      if (!active) return
      const usersWithPhotos = users.filter((user) => user.profilePhoto !== null)
      const signedUrls = await createProfilePhotoSignedUrls(usersWithPhotos.map((user) => user.profilePhoto!))
      if (!active) return
      setProfilePhotoUrls(new Map(usersWithPhotos.flatMap((user) => {
        const url = user.profilePhoto ? signedUrls.get(user.profilePhoto.path) : null
        return url ? [[user.id, url] as const] : []
      })))
    }).catch((reason) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return
      // Profile imagery is optional enrichment; initials keep every note identifiable.
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [authorIdSignature, normalizedSubjectId, previewState])

  useEffect(() => {
    if (loading || !notes.length || scrolledSubjectRef.current === normalizedSubjectId) return
    window.requestAnimationFrame(() => {
      const thread = threadRef.current
      if (thread) thread.scrollTop = thread.scrollHeight
      scrolledSubjectRef.current = normalizedSubjectId
    })
  }, [loading, normalizedSubjectId, notes.length])

  useEffect(() => {
    if (!mentionWindow) {
      setTargets([])
      setTargetError(false)
      return
    }
    const query = mentionWindow.query.trim()
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      if (previewState) {
        const normalized = query.toLocaleLowerCase()
        setTargets(previewState.targets.filter((target) => !normalized || `${target.label} ${target.detail ?? ""}`.toLocaleLowerCase().includes(normalized)).slice(0, 20))
        setTargetError(false)
        return
      }
      if (!normalizedSubjectId) return
      void searchLifecycleNoteTargets(subjectType, normalizedSubjectId, query, 20, controller.signal).then((nextTargets) => {
        setTargets(nextTargets)
        setTargetError(false)
      }).catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        setTargets([])
        setTargetError(true)
      })
    }, previewState ? 0 : 140)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [mentionWindow?.query, normalizedSubjectId, previewState, subjectType])

  async function saveNote(value = draft) {
    const body = value.trim()
    if (!body || !normalizedSubjectId || saving || !canWrite) return
    const retainedMentions = selectedMentions.filter((mention) => body.includes(`@${mention.label}`)).slice(0, 20)
    setSaving(true)
    setSaveError(null)
    try {
      const note = previewState ? {
        id: `preview-${Date.now()}`,
        subjectType,
        subjectId: normalizedSubjectId,
        body,
        author: { id: previewState.currentUserId ?? "preview-user", name: "You" },
        mentions: retainedMentions,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        deletedAt: null,
      } satisfies LifecycleNote : await addLifecycleNote(subjectType, normalizedSubjectId, body, retainedMentions)
      setNotes((current) => [note, ...current])
      if (note.author.id) setCurrentUserId(note.author.id)
      setDraft("")
      setSelectedMentions([])
      setMentionWindow(null)
      setAnnouncement(t("Note added"))
      toast.success(t("Note added"), { description: t(subjectType === "quote"
        ? "It will stay with the quote through booking and Customs."
        : subjectType === "booking"
          ? "It will stay with the booking and its Customs declaration."
          : "It has been added to this Customs declaration.") })
      window.requestAnimationFrame(() => {
        const thread = threadRef.current
        if (thread) thread.scrollTop = thread.scrollHeight
      })
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : t("The note could not be added. Your text is still here."))
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateNote(noteId: string, body: string) {
    const updated = previewState
      ? { ...notes.find((note) => note.id === noteId)!, body, updatedAt: new Date().toISOString() }
      : await updateLifecycleNote(noteId, body)
    setNotes((current) => current.map((note) => note.id === noteId ? updated : note))
    setAnnouncement(t("Note updated"))
    toast.success(t("Note updated"))
  }

  async function confirmDeleteNote() {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      const deleted = previewState
        ? { ...pendingDelete, deletedAt: new Date().toISOString() }
        : await deleteLifecycleNote(pendingDelete.id)
      setNotes((current) => current.map((note) => note.id === pendingDelete.id ? deleted : note))
      setPendingDelete(null)
      setAnnouncement(t("Note deleted"))
      toast.success(t("Note deleted"))
    } catch (reason) {
      setDeleteError(reason instanceof Error ? reason.message : t("The note could not be deleted. Try again."))
    } finally {
      setDeleting(false)
    }
  }

  const mentionItems = useMemo<DexterMentionItem[]>(() => targets.map((target) => ({
    id: targetKey(target),
    type: target.type,
    title: target.label,
    meta: target.detail || t(target.type === "department" ? "Department" : "Workspace user"),
    keywords: target.detail ?? undefined,
    icon: target.type === "department" ? Building2 : UserRound,
  })), [t, targets])
  const selectedMentionItems = useMemo<DexterMentionItem[]>(() => selectedMentions.map((mention) => ({
    id: targetKey(mention),
    type: mention.type,
    title: mention.label,
    meta: t(mention.type === "department" ? "Department" : "Workspace user"),
    icon: mention.type === "department" ? Building2 : UserRound,
  })), [selectedMentions, t])
  const chronologicalNotes = useMemo(() => [...notes].reverse(), [notes])

  function dayKey(note: LifecycleNote) {
    const date = new Date(note.createdAt)
    return Number.isNaN(date.getTime()) ? note.createdAt : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
  }

  function dayLabel(note: LifecycleNote) {
    const date = new Date(note.createdAt)
    if (Number.isNaN(date.getTime())) return t("Earlier")
    return new Intl.DateTimeFormat(language, {
      weekday: "short",
      day: "numeric",
      month: "long",
      year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    }).format(date)
  }

  return (
    <Surface padding="none" className={cn("min-w-0 overflow-visible rounded-[var(--md-radius-xl)]", className)}>
      <div className="flex flex-col gap-2 border-b border-[var(--md-line)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5 sm:py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquareText className="size-4 text-[var(--md-accent)]" aria-hidden="true" />
            <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Notes")}</h2>
          </div>
          <p className="mt-1 max-w-[70ch] text-[11.5px] leading-5 text-[var(--md-text)]">{t("Notes added earlier in the journey stay visible as the quote becomes a booking and then a Customs declaration.")}</p>
        </div>
        {notes.length ? <span className="shrink-0 text-[11px] text-[var(--md-subtle)]">{notes.length}{hasMore ? "+" : ""} {t(notes.length === 1 && !hasMore ? "note" : "notes")}</span> : null}
      </div>

      {!normalizedSubjectId ? (
        <div className="grid min-h-48 place-items-center px-5 py-8 text-center">
          <div className="max-w-md">
            <MessageSquareText className="mx-auto size-5 text-[var(--md-subtle)]" aria-hidden="true" />
            <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("Save this record before adding notes")}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("The saved record gives every note a secure lifecycle link.")}</p>
          </div>
        </div>
      ) : loading ? <DotGridLoaderPanel label="Loading notes" minHeight={210} /> : loadError ? (
        <div role="alert" className="grid min-h-48 place-items-center px-5 py-8 text-center">
          <div className="max-w-md">
            <p className="text-[13px] font-medium text-[var(--md-red)]">{t("Notes could not be loaded")}</p>
            <p data-i18n-skip dir="auto" className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{loadError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => void loadNotes()}><RefreshCw className="size-3.5" />{t("Try again")}</Button>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={threadRef}
            tabIndex={notes.length ? 0 : undefined}
            aria-label={notes.length ? t("Operational note conversation") : undefined}
            className="max-h-[min(58svh,38rem)] min-h-36 overflow-y-auto overscroll-contain px-4 py-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a14)] sm:px-5 sm:py-5 md-scrollbar"
          >
            {notes.length ? (
              <>
                {hasMore ? (
                  <div className="mb-4 flex justify-center">
                    <Button type="button" variant="outline" size="sm" disabled={loadingEarlier} onClick={() => void loadNotes(notes[notes.length - 1]?.createdAt ?? null)}>
                      {t(loadingEarlier ? "Loading earlier notes" : "Load earlier notes")}
                    </Button>
                  </div>
                ) : null}
                <ol className="space-y-3.5">
                  {chronologicalNotes.map((note, index) => {
                    const showDay = index === 0 || dayKey(chronologicalNotes[index - 1]) !== dayKey(note)
                    const isCurrentUser = Boolean(note.author.id && note.author.id === currentUserId)
                    return (
                      <Fragment key={note.id}>
                        {showDay ? (
                          <li role="separator" aria-label={dayLabel(note)} className="flex items-center gap-3 py-1.5 text-[10.5px] font-medium text-[var(--md-subtle)]">
                            <span className="h-px flex-1 bg-[var(--md-line)]" aria-hidden="true" />
                            <span>{dayLabel(note)}</span>
                            <span className="h-px flex-1 bg-[var(--md-line)]" aria-hidden="true" />
                          </li>
                        ) : null}
                        <li>
                          <LifecycleNoteRow
                            note={note}
                            currentSubject={subjectType}
                            isCurrentUser={isCurrentUser}
                            profilePhotoUrl={note.author.id ? profilePhotoUrls.get(note.author.id) : undefined}
                            onUpdate={handleUpdateNote}
                            onRequestDelete={(selected) => { setPendingDelete(selected); setDeleteError(null) }}
                          />
                        </li>
                      </Fragment>
                    )
                  })}
                </ol>
              </>
            ) : (
              <div className="grid min-h-36 place-items-center text-center">
                <div className="max-w-md">
                  <MessageSquareText className="mx-auto size-5 text-[var(--md-subtle)]" aria-hidden="true" />
                  <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("No notes yet")}</p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Add context that the next team should not have to rediscover.")}</p>
                </div>
              </div>
            )}
          </div>

          {canWrite ? (
            <form className="border-t border-[var(--md-line)] bg-[var(--md-surface)] px-4 py-4 sm:px-5" onSubmit={(event) => { event.preventDefault(); void saveNote() }}>
              <div className="md-composer md-lifecycle-note-composer relative rounded-[26px] bg-[var(--md-composer-shell-bg)] p-1.5 shadow-none">
                <div className="rounded-[21px] bg-[var(--md-composer-panel-bg)] px-3.5 pb-2.5 pt-3 sm:px-4">
                <DexterMentionInput
                  value={draft}
                  items={mentionItems}
                  selectedMentions={selectedMentionItems}
                  placeholder="Add operational context. Type @ to tag a person or department."
                  minHeight={64}
                  maxHeight={160}
                  className="text-[13px] leading-5"
                  ariaLabel="Add a note"
                  sendShortcut="mod-enter"
                  canSend={Boolean(draft.trim()) && !saving}
                  onChange={(value) => {
                    if (value.length > 4000) {
                      setSaveError(t("Notes can be up to 4,000 characters."))
                      return
                    }
                    setDraft(value)
                    setSaveError(null)
                    setMentionWindow(currentMentionWindow(value, value.length))
                  }}
                  onMentionsChange={(items) => {
                    setSelectedMentions(items.flatMap((item) => item.type === "user" || item.type === "department"
                      ? [{ type: item.type, id: item.id.slice(item.type.length + 1), label: item.title }]
                      : []).slice(0, 20))
                  }}
                  onSend={(value) => void saveNote(value)}
                />
                <div className="mt-3 flex items-end gap-3">
                  <div className="min-w-0 flex-1">
                    <p id={`${listId}-help`} className="text-[10.5px] leading-4 text-[var(--md-subtle)]">{t("Type @ to tag someone and send them a Multideck notification email. Press Ctrl or Command + Enter to add the note.")}</p>
                    {targetError ? <p role="alert" className="mt-1 text-[11px] leading-4 text-[var(--md-red)]">{t("Tags are temporarily unavailable. Your note is safe and can still be added without a tag.")}</p> : null}
                    {saveError ? <p id={`${listId}-error`} role="alert" data-i18n-skip dir="auto" className="mt-1 text-[11px] text-[var(--md-red)]">{saveError}</p> : null}
                  </div>
                  {draft.length > 3200 ? <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--md-subtle)]">{draft.length}/4000</span> : null}
                  <Button
                    type="submit"
                    size="icon"
                    disabled={!draft.trim() || saving}
                    aria-label={t(saving ? "Adding note" : "Add note")}
                    className="size-10 shrink-0 rounded-full bg-[var(--md-accent)] p-0 text-white shadow-[0_8px_20px_var(--md-accent-a20)] transition-[transform,opacity,background-color] hover:bg-[var(--md-accent-strong)] active:scale-95 disabled:opacity-45"
                  >
                    {saving ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <SendHorizontal className="size-3.5" aria-hidden="true" />}
                  </Button>
                </div>
                </div>
              </div>
            </form>
          ) : (
            <p className="border-t border-[var(--md-line)] px-5 py-3 text-[11.5px] text-[var(--md-text)]">{t("You can read these notes, but your role cannot add a note here.")}</p>
          )}
        </>
      )}
      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => { if (!open && !deleting) { setPendingDelete(null); setDeleteError(null) } }}>
        <DialogContent className="rounded-[var(--md-radius-xl)]" showCloseButton={!deleting}>
          <DialogHeader>
            <DialogTitle>{t("Delete this note?")}</DialogTitle>
            <DialogDescription>{t("The message will be replaced by a deleted-note marker so the operational timeline stays clear.")}</DialogDescription>
          </DialogHeader>
          {deleteError ? <p role="alert" data-i18n-skip dir="auto" className="text-[12px] leading-5 text-[var(--md-red)]">{deleteError}</p> : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={deleting}>{t("Keep note")}</Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void confirmDeleteNote()}>
              {deleting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}{t(deleting ? "Deleting" : "Delete note")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </Surface>
  )
}
