import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Archive,
  Check,
  ChevronRight,
  Download,
  Eye,
  File as FileGlyph,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  FolderOpen,
  Globe,
  HardDrive,
  Image as ImageGlyph,
  Music,
  Package,
  Palette,
  Pencil,
  Presentation,
  Shield,
  Sparkles,
  Tag,
  Trash2,
  Type,
  UploadCloud,
  Video,
} from "@/components/icons/hugeicons"

import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/i18n/language-provider"
import { getAccentPreset } from "@/lib/accent-theme"
import {
  driveFolderColours,
  driveFolderIcons,
  driveKindOf,
  driveFileTypeLabel,
  formatDriveBytes,
  type DriveFile,
  type DriveFolder,
  type DriveFolderColour,
  type DriveFolderIcon,
  type DriveFolderStats,
} from "@/lib/drive-api"
import type { DriveFileKind } from "@/lib/drive-thumbnail"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { cn } from "@/lib/utils"

/* --------------------------------------------------------------------- tone */

/**
 * A folder's colour is one of the ten accent presets, so both theme members come
 * from the palette the product has already contrast-checked. Handing CSS the pair
 * rather than one resolved value keeps the theme switch free of a JavaScript
 * round trip — and therefore free of a wrong-colour frame.
 */
export function driveToneStyle(colour: DriveFolderColour): CSSProperties {
  const preset = getAccentPreset(colour)
  return {
    "--md-drive-ink-light": preset.light,
    "--md-drive-ink-dark": preset.dark,
  } as CSSProperties
}

const folderIconGlyphs: Record<DriveFolderIcon, typeof Folder> = {
  folder: Folder,
  image: ImageGlyph,
  "file-text": FileText,
  palette: Palette,
  presentation: Presentation,
  video: Video,
  archive: Archive,
  sparkles: Sparkles,
  shield: Shield,
  tag: Tag,
  globe: Globe,
  package: Package,
}

const fileKindGlyphs: Record<DriveFileKind, typeof FileGlyph> = {
  image: FileImage,
  vector: Palette,
  pdf: FileText,
  video: Film,
  audio: Music,
  sheet: FileSpreadsheet,
  slides: Presentation,
  document: FileText,
  archive: FileArchive,
  font: Type,
  text: FileText,
  other: FileGlyph,
}

/** Artwork and page renders are shown whole; photographs fill the box. */
function thumbnailFit(kind: DriveFileKind) {
  return kind === "image" ? "cover" : "contain"
}

/* --------------------------------------------------------------- pressed state */

/**
 * The press-down scale is driven by an attribute rather than `:active` so a drag
 * that leaves the tile releases it, and so the same feedback answers a keyboard
 * activation.
 */
function usePressed() {
  const [pressed, setPressed] = useState(false)

  return {
    pressed,
    handlers: {
      onPointerDown: () => setPressed(true),
      onPointerUp: () => setPressed(false),
      onPointerLeave: () => setPressed(false),
      onPointerCancel: () => setPressed(false),
      onBlur: () => setPressed(false),
    },
  }
}

function activateOnKey(event: KeyboardEvent<HTMLElement>, activate: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return
  event.preventDefault()
  activate()
}

/* ------------------------------------------------------------------ item shell */

export function DriveGridItem({
  children,
  revealDelay = 0,
}: {
  children: ReactNode
  revealDelay?: number
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{
        ...mdMotion.enter,
        delay: revealDelay,
        // Reflow is a shorter, flatter curve than arrival: an item moving to make
        // room should look like it was nudged, not like it re-entered.
        layout: mdMotion.layout,
        opacity: { ...mdMotion.enter, delay: revealDelay },
      }}
      className="min-w-0"
    >
      {children}
    </motion.div>
  )
}

/* ------------------------------------------------------------- inline renaming */

/**
 * Renaming happens where the name already is. The field inherits the label's
 * typography and box, so the swap is a change of affordance rather than a change
 * of layout — nothing shifts, and the tile never has to be left.
 */
function DriveInlineName({
  value,
  editing,
  className,
  onCommit,
  onCancel,
}: {
  value: string
  editing: boolean
  className?: string
  onCommit: (next: string) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const settledRef = useRef(false)

  useEffect(() => {
    if (!editing) return
    settledRef.current = false
    setDraft(value)
  }, [editing, value])

  useLayoutEffect(() => {
    if (!editing) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    // The extension is rarely what is being changed, so the stem is selected.
    const stem = value.lastIndexOf(".")
    input.setSelectionRange(0, stem > 0 ? stem : value.length)
  }, [editing, value])

  const settle = useCallback(
    (commit: boolean) => {
      if (settledRef.current) return
      settledRef.current = true
      const next = draft.trim()
      if (commit && next && next !== value) onCommit(next)
      else onCancel()
    },
    [draft, onCancel, onCommit, value],
  )

  if (!editing) {
    return (
      <span className={cn("block truncate", className)} data-i18n-skip>
        <bdi dir="ltr">{value}</bdi>
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      dir="ltr"
      data-i18n-skip
      aria-label="Name"
      className={cn(
        "-mx-1 -my-0.5 block w-[calc(100%+8px)] rounded-[var(--md-radius-sm)] bg-[var(--md-surface)] px-1 py-0.5 outline-none",
        "shadow-[inset_0_0_0_1px_var(--md-accent)]",
        className,
      )}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={() => settle(true)}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === "Enter") {
          event.preventDefault()
          settle(true)
        }
        if (event.key === "Escape") {
          event.preventDefault()
          settle(false)
        }
      }}
    />
  )
}

/* ------------------------------------------------------------------ thumbnail */

/**
 * Paints in two passes over one box.
 *
 * The seed — a ~1 KB WebP carried on the file row — is there on the first frame,
 * so a folder is never a grid of empty rectangles. The stored thumbnail fades in
 * over it once it has decoded, and the seed is never removed, so there is no
 * moment where the box has nothing in it.
 */
function DriveThumbnail({
  file,
  url,
  pending,
  progress,
}: {
  file: Pick<DriveFile, "name" | "mimeType" | "previewSeed">
  url?: string | null
  pending?: boolean
  progress?: number
}) {
  const kind = driveKindOf(file)
  const Glyph = fileKindGlyphs[kind]
  const [loaded, setLoaded] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    setLoaded(false)
  }, [url])

  // A cached image can finish before React attaches the load handler, which would
  // otherwise leave it invisible.
  useLayoutEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) setLoaded(true)
  }, [url])

  return (
    <span
      className="md-drive-thumb"
      data-fit={thumbnailFit(kind)}
      data-pending={pending ? "true" : undefined}
      aria-hidden="true"
    >
      {file.previewSeed ? (
        <img src={file.previewSeed} alt="" className="md-drive-thumb__layer md-drive-thumb__seed" />
      ) : null}

      {url ? (
        <img
          ref={imageRef}
          src={url}
          alt=""
          decoding="async"
          loading="lazy"
          data-loaded={loaded ? "true" : "false"}
          className="md-drive-thumb__layer md-drive-thumb__image"
          onLoad={() => setLoaded(true)}
        />
      ) : null}

      {!file.previewSeed && !url ? (
        <span className="md-drive-thumb__glyph">
          <Glyph className="size-7" strokeWidth={1.1} />
        </span>
      ) : null}

      {pending ? (
        <span className="absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--md-surface)_58%,transparent)]">
          <DriveProgressRing value={progress ?? 0} />
        </span>
      ) : null}
    </span>
  )
}

function DriveProgressRing({ value }: { value: number }) {
  const radius = 15
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, value))

  return (
    <svg viewBox="0 0 36 36" className="size-9 -rotate-90" role="progressbar" aria-valuenow={Math.round(clamped * 100)} aria-valuemin={0} aria-valuemax={100}>
      <circle className="md-drive-progress-track" cx="18" cy="18" r={radius} fill="none" strokeWidth="2.4" />
      <circle
        className="md-drive-progress-value"
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
    </svg>
  )
}

/* ---------------------------------------------------------------- folder tile */

export type DriveFolderTileProps = {
  folder: DriveFolder
  stats?: DriveFolderStats
  renaming?: boolean
  onOpen: (folder: DriveFolder) => void
  onRename: (folder: DriveFolder, name: string) => void
  onStartRename: (folder: DriveFolder) => void
  onCancelRename: () => void
  onCustomise: (folder: DriveFolder) => void
  onDelete: (folder: DriveFolder) => void
}

export function DriveFolderTile({
  folder,
  stats,
  renaming = false,
  onOpen,
  onRename,
  onStartRename,
  onCancelRename,
  onCustomise,
  onDelete,
}: DriveFolderTileProps) {
  const { t } = useLanguage()
  const Icon = folderIconGlyphs[folder.icon]
  const { pressed, handlers } = usePressed()

  const meta = useMemo(() => {
    if (!stats || (stats.fileCount === 0 && stats.folderCount === 0)) return t("Empty")

    const parts: string[] = []
    if (stats.folderCount > 0) parts.push(`${stats.folderCount} ${t(stats.folderCount === 1 ? "folder" : "folders")}`)
    if (stats.fileCount > 0) parts.push(`${stats.fileCount} ${t(stats.fileCount === 1 ? "file" : "files")}`)
    if (stats.byteTotal > 0) parts.push(formatDriveBytes(stats.byteTotal))
    return parts.join(" · ")
  }, [stats, t])

  return (
    <ContextMenu>
      {/* The Drive surface behind this tile is a context-menu trigger too, so the
          event has to stop here or both menus open at once. */}
      <ContextMenuTrigger asChild onContextMenu={(event) => event.stopPropagation()}>
        <div
          role="button"
          tabIndex={0}
          aria-label={`${folder.name}, ${meta}`}
          data-pressed={pressed && !renaming ? "true" : undefined}
          className="md-drive-folder md-drive-tone cursor-default"
          style={driveToneStyle(folder.colour)}
          {...handlers}
          onClick={() => {
            if (!renaming) onOpen(folder)
          }}
          onKeyDown={(event) => {
            if (renaming) return
            activateOnKey(event, () => onOpen(folder))
          }}
        >
          <span className="md-drive-folder__sheet md-drive-folder__sheet--back" aria-hidden="true" />
          <span className="md-drive-folder__sheet md-drive-folder__sheet--front" aria-hidden="true" />

          <div className="md-drive-folder__body">
            <span className="md-drive-folder__icon" aria-hidden="true">
              <Icon className="size-[17px]" strokeWidth={1.3} />
            </span>
            <span className="grid min-w-0 gap-1">
              <DriveInlineName
                value={folder.name}
                editing={renaming}
                className="text-[13px] font-medium leading-5 text-[var(--md-ink)]"
                onCommit={(next) => onRename(folder, next)}
                onCancel={onCancelRename}
              />
              <span className="truncate text-[11px] leading-4 text-[var(--md-subtle)]">{meta}</span>
            </span>
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpen(folder)}>
          <FolderOpen strokeWidth={1.3} />
          Open
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onStartRename(folder)}>
          <Pencil strokeWidth={1.3} />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCustomise(folder)}>
          <Palette strokeWidth={1.3} />
          Colour and icon
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => onDelete(folder)}>
          <Trash2 strokeWidth={1.3} />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/* ------------------------------------------------------------------ file tile */

export type DriveFileTileProps = {
  file: DriveFile
  thumbnailUrl?: string | null
  pending?: boolean
  progress?: number
  renaming?: boolean
  onOpen: (file: DriveFile) => void
  onRename: (file: DriveFile, name: string) => void
  onStartRename: (file: DriveFile) => void
  onCancelRename: () => void
  onDownload: (file: DriveFile) => void
  onDelete: (file: DriveFile) => void
}

export function DriveFileTile({
  file,
  thumbnailUrl,
  pending = false,
  progress,
  renaming = false,
  onOpen,
  onRename,
  onStartRename,
  onCancelRename,
  onDownload,
  onDelete,
}: DriveFileTileProps) {
  const { pressed, handlers } = usePressed()
  const meta = `${driveFileTypeLabel(file)} · ${formatDriveBytes(file.sizeBytes)}`

  const tile = (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${file.name}, ${meta}`}
      aria-busy={pending || undefined}
      data-pressed={pressed && !renaming && !pending ? "true" : undefined}
      className="md-drive-file cursor-default"
      {...handlers}
      onClick={() => {
        if (!renaming && !pending) onOpen(file)
      }}
      onKeyDown={(event) => {
        if (renaming || pending) return
        activateOnKey(event, () => onOpen(file))
      }}
    >
      <DriveThumbnail file={file} url={pending ? null : thumbnailUrl} pending={pending} progress={progress} />
      <span className="grid min-w-0 gap-0.5 px-2">
        <DriveInlineName
          value={file.name}
          editing={renaming}
          className="text-[12.5px] font-medium leading-[18px] text-[var(--md-ink)]"
          onCommit={(next) => onRename(file, next)}
          onCancel={onCancelRename}
        />
        <span className="truncate text-[11px] leading-4 text-[var(--md-subtle)]" data-i18n-skip dir="ltr">
          {meta}
        </span>
      </span>
    </div>
  )

  if (pending) return tile

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={(event) => event.stopPropagation()}>
        {tile}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onOpen(file)}>
          <Eye strokeWidth={1.3} />
          Preview
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onStartRename(file)}>
          <Pencil strokeWidth={1.3} />
          Rename
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onDownload(file)}>
          <Download strokeWidth={1.3} />
          Download
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => onDelete(file)}>
          <Trash2 strokeWidth={1.3} />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

/* ----------------------------------------------------------------- breadcrumbs */

/**
 * The trail is the only navigation the drive needs, so it carries the depth: the
 * current folder is ink, its ancestors are quiet buttons, and the root is always
 * reachable in one click.
 */
export function DriveBreadcrumbRail({
  path,
  onNavigate,
}: {
  path: readonly DriveFolder[]
  onNavigate: (folderId: string | null) => void
}) {
  const reduceMotion = useReducedMotion()

  return (
    <nav aria-label="Drive folders" className="flex min-w-0 flex-wrap items-center gap-0.5">
      <button
        type="button"
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium transition-[background-color,color] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)]",
          path.length === 0
            ? "text-[var(--md-ink)]"
            : "text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]",
        )}
        aria-current={path.length === 0 ? "page" : undefined}
        onClick={() => onNavigate(null)}
      >
        <HardDrive className="size-3.5" strokeWidth={1.3} />
        Drive
      </button>

      <AnimatePresence initial={false} mode="popLayout">
        {path.map((folder, index) => {
          const isCurrent = index === path.length - 1

          return (
            <motion.span
              key={folder.id}
              layout="position"
              initial={reduceMotion ? undefined : { opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: -6 }}
              transition={mdMotion.fast}
              className="flex min-w-0 items-center gap-0.5"
            >
              <ChevronRight className="size-3.5 shrink-0 text-[var(--md-subtle)] rtl:rotate-180" strokeWidth={1.4} aria-hidden="true" />
              <button
                type="button"
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "flex h-7 max-w-[220px] items-center rounded-[var(--md-radius-md)] px-2 text-[12px] font-medium transition-[background-color,color] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  isCurrent
                    ? "text-[var(--md-ink)]"
                    : "text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]",
                )}
                onClick={() => onNavigate(folder.id)}
              >
                <span className="truncate" data-i18n-skip>
                  <bdi dir="ltr">{folder.name}</bdi>
                </span>
              </button>
            </motion.span>
          )
        })}
      </AnimatePresence>
    </nav>
  )
}

/* -------------------------------------------------------------- folder editor */

export type DriveFolderDraft = {
  name: string
  colour: DriveFolderColour
  icon: DriveFolderIcon
}

const colourLabels: Record<DriveFolderColour, string> = {
  teal: "Teal",
  meadow: "Meadow",
  sky: "Sky",
  ocean: "Ocean",
  indigo: "Indigo",
  violet: "Violet",
  plum: "Plum",
  rose: "Rose",
  ember: "Ember",
  graphite: "Graphite",
}

const iconLabels: Record<DriveFolderIcon, string> = {
  folder: "Folder",
  image: "Images",
  "file-text": "Documents",
  palette: "Brand",
  presentation: "Decks",
  video: "Video",
  archive: "Archive",
  sparkles: "Highlights",
  shield: "Compliance",
  tag: "Labels",
  globe: "Regions",
  package: "Shipments",
}

/**
 * One dialog for creating and for customising, because they ask for the same three
 * things. The preview tile is the real folder tile, so the choice is judged
 * against what will actually sit in the grid.
 */
export function DriveFolderDialog({
  open,
  mode,
  draft,
  saving,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  mode: "create" | "edit"
  draft: DriveFolderDraft
  saving?: boolean
  onDraftChange: (draft: DriveFolderDraft) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  const { t } = useLanguage()
  const nameId = useId()
  const PreviewIcon = folderIconGlyphs[draft.icon]
  const canSubmit = draft.name.trim().length > 0 && !saving

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 bg-[var(--md-surface)] sm:max-w-[460px]">
        <DialogHeader className="pe-10">
          <DialogTitle className="text-[var(--md-ink)]">{mode === "create" ? t("New folder") : t("Folder appearance")}</DialogTitle>
          <DialogDescription className="text-[13px] text-[var(--md-text)]">
            {t("Give it a name, then a colour and icon so it is recognisable at a glance.")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit) onSubmit()
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[128px_minmax(0,1fr)] sm:items-start">
            <div className="md-drive-tone pointer-events-none" style={driveToneStyle(draft.colour)}>
              <div className="md-drive-folder">
                <span className="md-drive-folder__sheet md-drive-folder__sheet--back" aria-hidden="true" />
                <span className="md-drive-folder__sheet md-drive-folder__sheet--front" aria-hidden="true" />
                <div className="md-drive-folder__body">
                  <span className="md-drive-folder__icon" aria-hidden="true">
                    <motion.span
                      key={draft.icon}
                      initial={{ opacity: 0, scale: 0.82 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={mdMotion.spring}
                      className="grid place-items-center"
                    >
                      <PreviewIcon className="size-[17px]" strokeWidth={1.3} />
                    </motion.span>
                  </span>
                  <span className="grid min-w-0 gap-1">
                    <span className="block truncate text-[13px] font-medium leading-5 text-[var(--md-ink)]" data-i18n-skip>
                      <bdi dir="ltr">{draft.name.trim() || t("New folder")}</bdi>
                    </span>
                    <span className="truncate text-[11px] leading-4 text-[var(--md-subtle)]">{t("Empty")}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <label htmlFor={nameId} className="text-[12px] font-medium text-[var(--md-text)]">
                {t("Name")}
              </label>
              <Input
                id={nameId}
                value={draft.name}
                autoFocus
                maxLength={120}
                dir="ltr"
                data-i18n-skip
                onFocus={(event) => event.target.select()}
                onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2.5">
            <span className="text-[12px] font-medium text-[var(--md-text)]">{t("Colour")}</span>
            <div role="radiogroup" aria-label={t("Folder colour")} className="flex flex-wrap gap-2">
              {driveFolderColours.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  role="radio"
                  aria-checked={draft.colour === colour}
                  aria-label={t(colourLabels[colour])}
                  title={t(colourLabels[colour])}
                  className="md-drive-swatch md-drive-tone"
                  style={driveToneStyle(colour)}
                  onClick={() => onDraftChange({ ...draft, colour })}
                >
                  <AnimatePresence initial={false}>
                    {draft.colour === colour ? (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={mdMotion.spring}
                        className="grid place-items-center text-[var(--md-accent-ink)] dark:text-[color-mix(in_srgb,var(--md-ink)_88%,transparent)]"
                      >
                        <Check className="size-3.5" strokeWidth={2.2} />
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-2.5">
            <span className="text-[12px] font-medium text-[var(--md-text)]">{t("Icon")}</span>
            <div
              role="radiogroup"
              aria-label={t("Folder icon")}
              className="md-drive-tone flex flex-wrap gap-1"
              style={driveToneStyle(draft.colour)}
            >
              {driveFolderIcons.map((icon) => {
                const Glyph = folderIconGlyphs[icon]

                return (
                  <button
                    key={icon}
                    type="button"
                    role="radio"
                    aria-checked={draft.icon === icon}
                    aria-label={t(iconLabels[icon])}
                    title={t(iconLabels[icon])}
                    className="md-drive-icon-choice"
                    onClick={() => onDraftChange({ ...draft, icon })}
                  >
                    <Glyph className="size-[17px]" strokeWidth={1.3} />
                  </button>
                )
              })}
            </div>
          </div>

          <DialogFooter className="bg-[var(--md-surface-soft)]">
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[13px] text-[var(--md-text)] hover:bg-[var(--md-hover)]"
              onClick={() => onOpenChange(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]"
            >
              {mode === "create" ? t("Create folder") : t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------------------------------------- file preview */

/**
 * The file, as large as the viewport allows. Images and page renders are shown
 * over their own blurred seed, so the frame is filled from the moment it opens
 * and the full-size image resolves into it.
 */
export function DriveFilePreviewDialog({
  file,
  url,
  open,
  onOpenChange,
  onDownload,
  onDelete,
}: {
  file: DriveFile | null
  url: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDownload: (file: DriveFile) => void
  onDelete: (file: DriveFile) => void
}) {
  const { t } = useLanguage()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setLoaded(false)
  }, [url])

  if (!file) return null

  const kind = driveKindOf(file)
  const Glyph = fileKindGlyphs[kind]
  const aspect = file.previewWidth && file.previewHeight ? `${file.previewWidth} / ${file.previewHeight}` : "16 / 10"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-4 overflow-hidden bg-[var(--md-surface)] p-4 sm:max-w-[min(1080px,94vw)]">
        <DialogHeader className="pe-10">
          <DialogTitle className="truncate text-[15px] text-[var(--md-ink)]" data-i18n-skip>
            <bdi dir="ltr">{file.name}</bdi>
          </DialogTitle>
          <DialogDescription className="text-[12px] text-[var(--md-subtle)]" data-i18n-skip dir="ltr">
            {driveFileTypeLabel(file)} · {formatDriveBytes(file.sizeBytes)}
            {file.previewWidth && file.previewHeight ? ` · ${file.previewWidth}×${file.previewHeight}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface-tint)] shadow-[var(--md-shadow-line)]"
          style={kind === "image" || kind === "vector" ? { aspectRatio: aspect, maxHeight: "66vh" } : undefined}
        >
          {kind === "image" || kind === "vector" ? (
            <>
              {file.previewSeed ? (
                <img
                  src={file.previewSeed}
                  alt=""
                  aria-hidden="true"
                  className="absolute inset-0 size-full scale-110 object-contain blur-2xl"
                />
              ) : null}
              {url ? (
                <motion.img
                  src={url}
                  alt={file.name}
                  decoding="async"
                  initial={false}
                  animate={{ opacity: loaded ? 1 : 0 }}
                  transition={mdMotion.enter}
                  onLoad={() => setLoaded(true)}
                  className="absolute inset-0 size-full object-contain"
                />
              ) : null}
            </>
          ) : null}

          {kind === "pdf" && url ? (
            <iframe src={`${url}#view=FitH`} title={file.name} className="h-[66vh] w-full border-0 bg-white" />
          ) : null}

          {kind === "video" && url ? (
            <video src={url} controls playsInline className="max-h-[66vh] w-full bg-black" />
          ) : null}

          {kind === "audio" && url ? (
            <div className="grid place-items-center gap-4 p-10">
              <Glyph className="size-8 text-[var(--md-subtle)]" strokeWidth={1.1} />
              <audio src={url} controls className="w-full max-w-[420px]" />
            </div>
          ) : null}

          {!["image", "vector", "pdf", "video", "audio"].includes(kind) ? (
            <div className="grid place-items-center gap-3 px-6 py-14 text-center">
              <Glyph className="size-9 text-[var(--md-subtle)]" strokeWidth={1.1} />
              <p className="text-[13px] text-[var(--md-text)]">{t("This file type opens in the app it belongs to.")}</p>
            </div>
          ) : null}

          {!url ? (
            <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
              <motion.span
                className="block h-full w-1/3 bg-[var(--md-accent)]"
                animate={{ x: ["-100%", "300%"] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: [0.5, 0.02, 0.5, 0.98] }}
              />
            </span>
          ) : null}
        </div>

        <DialogFooter className="bg-[var(--md-surface-soft)]">
          <Button
            variant="ghost"
            className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[13px] text-[var(--md-red)] hover:bg-[color-mix(in_srgb,var(--md-red)_10%,transparent)]"
            onClick={() => onDelete(file)}
          >
            <Trash2 data-icon="inline-start" strokeWidth={1.3} />
            {t("Delete")}
          </Button>
          <Button
            className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]"
            onClick={() => onDownload(file)}
          >
            <Download data-icon="inline-start" strokeWidth={1.3} />
            {t("Download")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* --------------------------------------------------------------- empty states */

export function DriveEmptyState({
  title,
  hint,
  action,
}: {
  title: string
  hint: string
  action?: ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={mdMotion.enter}
      className="grid justify-items-center gap-3 rounded-[var(--md-radius-xl)] px-6 py-14 text-center"
    >
      <span className="grid size-11 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-subtle)] shadow-[var(--md-shadow-line)]">
        <Folder className="size-5" strokeWidth={1.2} />
      </span>
      <p className="text-[14px] font-medium text-[var(--md-ink)]">{title}</p>
      <p className="max-w-[380px] text-[12px] leading-5 text-[var(--md-text)]">{hint}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </motion.div>
  )
}

/* ------------------------------------------------------------- section header */

export function DriveSectionLabel({ children, count }: { children: ReactNode; count: number }) {
  return (
    <div className="flex items-baseline gap-2 px-0.5">
      <span className="text-[11px] font-medium tracking-normal text-[var(--md-subtle)]">{children}</span>
      <span className="text-[11px] text-[var(--md-subtle)] opacity-70" data-i18n-skip dir="ltr">
        {count}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------- skeleton grid */

/**
 * Holds the exact geometry the real tiles will use, so the first load settles
 * into place instead of pushing the page around when the data lands.
 */
export function DriveSkeletonGrid({ tiles = 8 }: { tiles?: number }) {
  return (
    <div className="md-drive-grid" aria-hidden="true">
      {Array.from({ length: tiles }, (_, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...mdMotion.fast, delay: staggerRamp(index) }}
          className="grid gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1.5 shadow-[var(--md-premium-stroke)]"
        >
          <span className="block aspect-[4/3] rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)]" />
          <span className="mx-1 mb-1 grid gap-1.5">
            <span className="block h-2.5 w-3/4 rounded-full bg-[var(--md-surface-tint)]" />
            <span className="block h-2 w-1/2 rounded-full bg-[var(--md-surface-tint)]" />
          </span>
        </motion.div>
      ))}
    </div>
  )
}

export function DriveSurfaceContextMenu({
  children,
  onCreateFolder,
  onUpload,
}: {
  children: ReactNode
  onCreateFolder: () => void
  onUpload: () => void
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuLabel>This folder</ContextMenuLabel>
        <ContextMenuItem onSelect={onCreateFolder}>
          <Folder strokeWidth={1.3} />
          New folder
        </ContextMenuItem>
        <ContextMenuItem onSelect={onUpload}>
          <UploadCloud strokeWidth={1.3} />
          Upload files
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
