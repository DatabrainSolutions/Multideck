import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import { Building2, MessageSquareText, RefreshCw, Send, UserRound } from "@/components/icons/hugeicons"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { Surface } from "@/components/multideck/surface"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import {
  addLifecycleNote,
  getLifecycleNotes,
  searchLifecycleNoteTargets,
  type LifecycleNote,
  type LifecycleNoteMention,
  type LifecycleNoteSubjectType,
  type LifecycleNoteTarget,
} from "@/lib/lifecycle-notes-api"
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
      <span key={`${part}-${index}`} className="rounded-[var(--md-radius-sm)] bg-[var(--md-accent-a10)] px-1 py-0.5 font-medium text-[var(--md-accent)]">
        {part}
      </span>
    ) : <Fragment key={`${part}-${index}`}>{part}</Fragment>
  })
}

function LifecycleNoteRow({ note, currentSubject }: { note: LifecycleNote; currentSubject: LifecycleNoteSubjectType }) {
  const { language, t } = useLanguage()
  const source = noteSourceLabel(note, currentSubject, t)
  const created = new Date(note.createdAt)
  const createdLabel = Number.isNaN(created.getTime())
    ? note.createdAt
    : new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(created)

  return (
    <article className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 border-t border-[var(--md-line)] py-4 first:border-t-0 first:pt-0 last:pb-0">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-full bg-[var(--md-surface-tint)] text-[10px] font-medium text-[var(--md-ink)]">
        {initials(note.author.name)}
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p data-i18n-skip dir="auto" className="text-[12px] font-medium text-[var(--md-ink)]">{note.author.name}</p>
          <time dateTime={note.createdAt} className="text-[10.5px] text-[var(--md-subtle)]">{createdLabel}</time>
          {source ? <span className="rounded-full bg-[var(--md-surface-tint)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-text)]">{source}</span> : null}
        </div>
        <p data-i18n-skip dir="auto" className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-6 text-[var(--md-ink)]">
          {renderBody(note.body, note.mentions)}
        </p>
        {note.mentions.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label={t("Tagged people and departments")}>
            {note.mentions.map((mention) => (
              <span key={targetKey(mention)} data-i18n-skip dir="auto" className="inline-flex min-h-6 items-center gap-1 rounded-full bg-[var(--md-surface-tint)] px-2 text-[10.5px] font-medium text-[var(--md-text)]">
                {mention.type === "department" ? <Building2 className="size-3" aria-hidden="true" /> : <UserRound className="size-3" aria-hidden="true" />}
                {mention.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
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
  const { t } = useLanguage()
  const listId = useId()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [notes, setNotes] = useState<LifecycleNote[]>(previewState?.notes ?? [])
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
  const [highlightedTarget, setHighlightedTarget] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const normalizedSubjectId = subjectId?.trim() || null

  async function loadNotes(before: string | null = null) {
    if (!normalizedSubjectId || previewState) return
    before ? setLoadingEarlier(true) : setLoading(true)
    if (!before) setLoadError(null)
    try {
      const page = await getLifecycleNotes(subjectType, normalizedSubjectId, before)
      setNotes((current) => before ? [...current, ...page.notes.filter((note) => !current.some((existing) => existing.id === note.id))] : page.notes)
      setHasMore(page.hasMore)
      setCanWrite(page.canWrite)
    } catch (reason) {
      if (!before) setLoadError(reason instanceof Error ? reason.message : t("Notes could not be loaded."))
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
    if (previewState) {
      setNotes(previewState.notes)
      setCanWrite(previewState.canWrite ?? true)
      setHasMore(false)
      setLoading(false)
      setLoadError(null)
      return
    }
    setNotes([])
    setCanWrite(false)
    setHasMore(false)
    if (normalizedSubjectId) void loadNotes()
    else setLoading(false)
    // Reload only when the canonical note subject changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedSubjectId, subjectType, previewState])

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

  function updateMentionWindow(value: string, cursor: number | null) {
    setMentionWindow(cursor === null ? null : currentMentionWindow(value, cursor))
  }

  function chooseTarget(target: LifecycleNoteTarget) {
    if (!mentionWindow) return
    const token = `@${target.label}`
    const nextDraft = `${draft.slice(0, mentionWindow.start)}${token} ${draft.slice(mentionWindow.end)}`
    const nextCursor = mentionWindow.start + token.length + 1
    setDraft(nextDraft)
    setSelectedMentions((current) => current.some((mention) => targetKey(mention) === targetKey(target))
      ? current
      : [...current, { type: target.type, id: target.id, label: target.label }].slice(0, 20))
    setMentionWindow(null)
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault()
      void saveNote()
      return
    }
    if (!mentionWindow) return
    if (event.key === "ArrowDown" && availableTargets.length) {
      event.preventDefault()
      setHighlightedTarget((current) => (current + 1) % availableTargets.length)
    } else if (event.key === "ArrowUp" && availableTargets.length) {
      event.preventDefault()
      setHighlightedTarget((current) => (current - 1 + availableTargets.length) % availableTargets.length)
    } else if (event.key === "Enter" && availableTargets[highlightedTarget]) {
      event.preventDefault()
      chooseTarget(availableTargets[highlightedTarget])
    } else if (event.key === "Escape") {
      event.preventDefault()
      setMentionWindow(null)
    }
  }

  async function saveNote() {
    const body = draft.trim()
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
        author: { id: "preview-user", name: "You" },
        mentions: retainedMentions,
        createdAt: new Date().toISOString(),
      } satisfies LifecycleNote : await addLifecycleNote(subjectType, normalizedSubjectId, body, retainedMentions)
      setNotes((current) => [note, ...current])
      setDraft("")
      setSelectedMentions([])
      setMentionWindow(null)
      setAnnouncement(t("Note added"))
      toast.success(t("Note added"), { description: t(subjectType === "quote"
        ? "It will stay with the quote through booking and Customs."
        : subjectType === "booking"
          ? "It will stay with the booking and its Customs declaration."
          : "It has been added to this Customs declaration.") })
      textareaRef.current?.focus()
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : t("The note could not be added. Your text is still here."))
    } finally {
      setSaving(false)
    }
  }

  const selectedTargetKeys = useMemo(() => new Set(selectedMentions.map(targetKey)), [selectedMentions])
  const availableTargets = targets.filter((target) => !selectedTargetKeys.has(targetKey(target)))
  const showSuggestions = Boolean(mentionWindow)

  useEffect(() => {
    setHighlightedTarget((current) => Math.min(current, Math.max(0, availableTargets.length - 1)))
  }, [availableTargets.length])

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
          {canWrite ? (
            <form className="border-b border-[var(--md-line)] px-4 py-4 sm:px-5" onSubmit={(event) => { event.preventDefault(); void saveNote() }}>
              <label htmlFor={`${listId}-composer`} className="text-[11.5px] font-medium text-[var(--md-ink)]">{t("Add a note")}</label>
              <div className="relative mt-2">
                <Textarea
                  ref={textareaRef}
                  id={`${listId}-composer`}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showSuggestions}
                  aria-controls={showSuggestions ? listId : undefined}
                  aria-activedescendant={showSuggestions && availableTargets[highlightedTarget] ? `${listId}-option-${highlightedTarget}` : undefined}
                  aria-describedby={`${listId}-help${saveError ? ` ${listId}-error` : ""}`}
                  maxLength={4000}
                  value={draft}
                  onChange={(event) => {
                    const value = event.target.value
                    setDraft(value)
                    setSelectedMentions((current) => current.filter((mention) => value.includes(`@${mention.label}`)))
                    setSaveError(null)
                    updateMentionWindow(value, event.target.selectionStart)
                  }}
                  onClick={(event) => updateMentionWindow(draft, event.currentTarget.selectionStart)}
                  onKeyUp={(event) => {
                    if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) return
                    updateMentionWindow(event.currentTarget.value, event.currentTarget.selectionStart)
                  }}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={t("Add operational context. Type @ to tag a person or department.")}
                  className="min-h-24 resize-y rounded-[var(--md-radius-lg)] bg-[var(--md-field-bg)] pe-12 text-[13px] leading-5 shadow-[var(--md-shadow-line)]"
                />
                {showSuggestions ? (
                  <div id={listId} role="listbox" aria-label={t("People and departments")} className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-64 overflow-y-auto rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1.5 shadow-[var(--md-shadow-lift)] md-scrollbar">
                    {availableTargets.map((target, index) => (
                      <button
                        id={`${listId}-option-${index}`}
                        key={targetKey(target)}
                        type="button"
                        role="option"
                        aria-selected={index === highlightedTarget}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseMove={() => setHighlightedTarget(index)}
                        onClick={() => chooseTarget(target)}
                        className={cn("flex min-h-11 w-full items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2.5 py-2 text-start", index === highlightedTarget ? "bg-[var(--md-selected-bg)]" : "hover:bg-[var(--md-hover)]")}
                      >
                        <span className="grid size-7 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-text)]">
                          {target.type === "department" ? <Building2 className="size-3.5" aria-hidden="true" /> : <UserRound className="size-3.5" aria-hidden="true" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span data-i18n-skip dir="auto" className="block truncate text-[12px] font-medium text-[var(--md-ink)]">{target.label}</span>
                          <span data-i18n-skip={Boolean(target.detail) || undefined} dir={target.detail ? "auto" : undefined} className="mt-0.5 block truncate text-[10.5px] text-[var(--md-subtle)]">{target.detail || t(target.type === "department" ? "Department" : "Workspace user")}</span>
                        </span>
                      </button>
                    ))}
                    {!targetError && !availableTargets.length ? <p className="px-3 py-5 text-center text-[12px] text-[var(--md-subtle)]">{t("No people or departments match this tag.")}</p> : null}
                    {targetError ? <p role="alert" className="px-3 py-4 text-[11.5px] leading-5 text-[var(--md-red)]">{t("Tags are temporarily unavailable. Your note is safe and can still be added without a tag.")}</p> : null}
                  </div>
                ) : null}
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p id={`${listId}-help`} className="text-[10.5px] text-[var(--md-subtle)]">{t("Type @ to tag someone. Press Ctrl or Command + Enter to add the note.")}</p>
                  {saveError ? <p id={`${listId}-error`} role="alert" data-i18n-skip dir="auto" className="mt-1 text-[11px] text-[var(--md-red)]">{saveError}</p> : null}
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2">
                  {draft.length > 3200 ? <span className="text-[10.5px] tabular-nums text-[var(--md-subtle)]">{draft.length}/4000</span> : null}
                  <Button type="submit" size="sm" disabled={!draft.trim() || saving} className="h-9 rounded-[var(--md-radius-lg)] px-3">
                    <Send className="size-3.5" aria-hidden="true" />{t(saving ? "Adding note" : "Add note")}
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <p className="border-b border-[var(--md-line)] px-5 py-3 text-[11.5px] text-[var(--md-text)]">{t("You can read these notes, but your role cannot add a note here.")}</p>
          )}

          <div className="px-4 py-4 sm:px-5">
            {notes.length ? notes.map((note) => <LifecycleNoteRow key={note.id} note={note} currentSubject={subjectType} />) : (
              <div className="grid min-h-36 place-items-center text-center">
                <div className="max-w-md">
                  <MessageSquareText className="mx-auto size-5 text-[var(--md-subtle)]" aria-hidden="true" />
                  <p className="mt-3 text-[13px] font-medium text-[var(--md-ink)]">{t("No notes yet")}</p>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{t("Add context that the next team should not have to rediscover.")}</p>
                </div>
              </div>
            )}
            {hasMore && notes.length ? (
              <div className="mt-4 flex justify-center border-t border-[var(--md-line)] pt-4">
                <Button type="button" variant="outline" size="sm" disabled={loadingEarlier} onClick={() => void loadNotes(notes[notes.length - 1]?.createdAt ?? null)}>
                  {t(loadingEarlier ? "Loading earlier notes" : "Load earlier notes")}
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    </Surface>
  )
}
