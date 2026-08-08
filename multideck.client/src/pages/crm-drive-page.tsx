import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { FolderPlus, UploadCloud } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Surface } from "@/components/multideck/surface"
import {
  DriveBreadcrumbRail,
  DriveEmptyState,
  DriveFileTile,
  DriveFilePreviewDialog,
  DriveFolderDialog,
  DriveFolderTile,
  DriveGridItem,
  DriveSectionLabel,
  DriveSkeletonGrid,
  DriveSurfaceContextMenu,
  type DriveFolderDraft,
} from "@/components/multideck/drive-components"
import { useLanguage } from "@/i18n/language-provider"
import {
  assertDriveFileAccepted,
  compareDriveNames,
  createDriveFolder,
  deleteDriveFile,
  deleteDriveFolder,
  downloadDriveFile,
  driveChildFolders,
  driveFolderPath,
  driveSignedUrl,
  driveSignedUrls,
  emptyDriveFolderStats,
  listDriveFiles,
  listDriveFolders,
  loadDriveFolderStats,
  nextUntitledFolderName,
  primeDriveThumbnail,
  renameDriveFile,
  updateDriveFolder,
  uploadDriveFile,
  type DriveFile,
  type DriveFolder,
  type DriveFolderStats,
} from "@/lib/drive-api"
import { createDrivePreview, type DrivePreview } from "@/lib/drive-thumbnail"
import { mdMotion, staggerRamp } from "@/lib/motion"

/** Three at a time keeps each progress ring honest and the network unsaturated. */
const uploadConcurrency = 3

type PendingUpload = {
  id: string
  name: string
  mimeType: string
  sizeBytes: number
  folderId: string | null
  preview: DrivePreview
  progress: number
}

type RemovalTarget =
  | { kind: "folder"; folder: DriveFolder; stats: DriveFolderStats }
  | { kind: "file"; file: DriveFile }

function readFolderIdFromUrl() {
  return new URLSearchParams(window.location.search).get("folder")
}

/** Folder navigation is real history, so browser back walks out of a folder. */
function writeFolderIdToUrl(folderId: string | null, mode: "push" | "replace") {
  const url = new URL(window.location.href)
  if (folderId) url.searchParams.set("folder", folderId)
  else url.searchParams.delete("folder")

  const next = `${url.pathname}${url.search}`
  if (mode === "replace") window.history.replaceState(window.history.state, "", next)
  else window.history.pushState({}, "", next)
}

function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

export function CrmDrivePage() {
  const { t } = useLanguage()

  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [folderId, setFolderId] = useState<string | null>(readFolderIdFromUrl)
  const [filesByFolder, setFilesByFolder] = useState<Record<string, DriveFile[]>>({})
  const [statsByParent, setStatsByParent] = useState<Record<string, Map<string, DriveFolderStats>>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploads, setUploads] = useState<PendingUpload[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({})
  const [dragging, setDragging] = useState(false)
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [removal, setRemoval] = useState<RemovalTarget | null>(null)
  const [removalOpen, setRemovalOpen] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [folderEditor, setFolderEditor] = useState<{ mode: "create" | "edit"; targetId: string | null; draft: DriveFolderDraft } | null>(null)
  const [folderEditorOpen, setFolderEditorOpen] = useState(false)
  const [savingFolder, setSavingFolder] = useState(false)

  // The first grid arrives with a stagger; anything added afterwards should appear
  // the instant it exists, so the ramp is spent once and then switched off.
  const [staggerEntry, setStaggerEntry] = useState(true)
  const dragDepth = useRef(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewRequestRef = useRef<string | null>(null)
  const folderKey = folderId ?? "root"

  const files = filesByFolder[folderKey] ?? []
  const childFolders = useMemo(() => driveChildFolders(folders, folderId), [folders, folderId])
  const stats = statsByParent[folderKey]
  const path = useMemo(() => driveFolderPath(folders, folderId), [folders, folderId])
  const visibleUploads = useMemo(() => uploads.filter((upload) => upload.folderId === folderId), [uploads, folderId])

  /* ------------------------------------------------------------------ loading */

  const loadFolderContents = useCallback(async (targetFolderId: string | null) => {
    const key = targetFolderId ?? "root"
    const [nextFiles, nextStats] = await Promise.all([listDriveFiles(targetFolderId), loadDriveFolderStats(targetFolderId)])
    setFilesByFolder((current) => ({ ...current, [key]: nextFiles }))
    setStatsByParent((current) => ({ ...current, [key]: nextStats }))
  }, [])

  useEffect(() => {
    let active = true

    Promise.all([listDriveFolders(), listDriveFiles(folderId), loadDriveFolderStats(folderId)])
      .then(([nextFolders, nextFiles, nextStats]) => {
        if (!active) return
        setFolders(nextFolders)
        setFilesByFolder({ [folderKey]: nextFiles })
        setStatsByParent({ [folderKey]: nextStats })
        setLoadError(null)
      })
      .catch((cause: unknown) => {
        if (active) setLoadError(errorMessage(cause, t("Drive could not be reached.")))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
    // Deliberately mount-only: this is the cold load. Folder changes are served by
    // the cache-first effect below, which must not show a full-page skeleton.

  }, [])

  useEffect(() => {
    if (loading) return
    const frame = window.requestAnimationFrame(() => setStaggerEntry(false))
    return () => window.cancelAnimationFrame(frame)
  }, [loading])

  useEffect(() => {
    const onPopState = () => setFolderId(readFolderIdFromUrl())
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  /**
   * Folder contents are kept once fetched, so stepping back into a folder repaints
   * from memory. A revalidation still runs behind the visible list, which is what
   * lets navigation feel free without going stale.
   */
  useEffect(() => {
    if (loading) return
    let active = true

    void loadFolderContents(folderId).catch((cause: unknown) => {
      if (active) toast.error(errorMessage(cause, t("This folder could not be refreshed.")))
    })

    return () => {
      active = false
    }
  }, [folderId, loading, loadFolderContents, t])

  /** One signing request per folder, for every thumbnail it is missing. */
  useEffect(() => {
    const missing = files
      .map((file) => file.thumbnailPath)
      .filter((thumbnailPath): thumbnailPath is string => Boolean(thumbnailPath) && !thumbnailUrls[thumbnailPath as string])
    if (missing.length === 0) return

    let active = true
    void driveSignedUrls(missing)
      .then((resolved) => {
        if (!active || resolved.size === 0) return
        setThumbnailUrls((current) => ({ ...current, ...Object.fromEntries(resolved) }))
      })
      .catch(() => {
        // A missing preview is not worth an interruption; the tile keeps its seed.
      })

    return () => {
      active = false
    }
  }, [files, thumbnailUrls])

  /* --------------------------------------------------------------- navigation */

  const openFolder = useCallback((next: DriveFolder | null) => {
    const nextId = next?.id ?? null
    setRenamingId(null)
    setFolderId(nextId)
    writeFolderIdToUrl(nextId, "push")
  }, [])

  const navigateToId = useCallback((nextId: string | null) => {
    setRenamingId(null)
    setFolderId(nextId)
    writeFolderIdToUrl(nextId, "push")
  }, [])

  /* ------------------------------------------------------------------ folders */

  function startCreateFolder() {
    setFolderEditorOpen(true)
    setFolderEditor({
      mode: "create",
      targetId: null,
      draft: { name: nextUntitledFolderName(childFolders), colour: "teal", icon: "folder" },
    })
  }

  function startCustomiseFolder(folder: DriveFolder) {
    setFolderEditorOpen(true)
    setFolderEditor({
      mode: "edit",
      targetId: folder.id,
      draft: { name: folder.name, colour: folder.colour, icon: folder.icon },
    })
  }

  async function submitFolderEditor() {
    if (!folderEditor) return
    setSavingFolder(true)

    try {
      if (folderEditor.mode === "create") {
        const created = await createDriveFolder({ parentId: folderId, ...folderEditor.draft })
        setFolders((current) => [...current, created].sort(compareDriveNames))
        setStatsByParent((current) => {
          const next = new Map(current[folderKey] ?? [])
          next.set(created.id, emptyDriveFolderStats)
          return { ...current, [folderKey]: next }
        })
      } else if (folderEditor.targetId) {
        const saved = await updateDriveFolder(folderEditor.targetId, folderEditor.draft)
        setFolders((current) => current.map((folder) => (folder.id === saved.id ? saved : folder)).sort(compareDriveNames))
      }

      setFolderEditorOpen(false)
    } catch (cause) {
      toast.error(errorMessage(cause, t("The folder could not be saved.")))
    } finally {
      setSavingFolder(false)
    }
  }

  async function renameFolder(folder: DriveFolder, name: string) {
    setRenamingId(null)
    const previous = folders
    setFolders((current) => current.map((entry) => (entry.id === folder.id ? { ...entry, name } : entry)).sort(compareDriveNames))

    try {
      const saved = await updateDriveFolder(folder.id, { name })
      setFolders((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)).sort(compareDriveNames))
    } catch (cause) {
      setFolders(previous)
      toast.error(errorMessage(cause, t("The folder could not be renamed.")))
    }
  }

  /* -------------------------------------------------------------------- files */

  async function renameFile(file: DriveFile, name: string) {
    setRenamingId(null)
    const previous = filesByFolder[folderKey] ?? []
    setFilesByFolder((current) => ({
      ...current,
      [folderKey]: previous.map((entry) => (entry.id === file.id ? { ...entry, name } : entry)).sort(compareDriveNames),
    }))

    try {
      const saved = await renameDriveFile(file.id, name)
      setFilesByFolder((current) => ({
        ...current,
        [folderKey]: (current[folderKey] ?? []).map((entry) => (entry.id === saved.id ? saved : entry)).sort(compareDriveNames),
      }))
    } catch (cause) {
      setFilesByFolder((current) => ({ ...current, [folderKey]: previous }))
      toast.error(errorMessage(cause, t("The file could not be renamed.")))
    }
  }

  async function openPreview(file: DriveFile) {
    // The dialog opens on the seed immediately and the signed URL lands into it, so
    // the frame is never empty. The ref guards against a URL arriving for a file the
    // operator has already moved past.
    previewRequestRef.current = file.id
    setPreviewFile(file)
    setPreviewUrl(null)
    setPreviewOpen(true)

    try {
      const url = await driveSignedUrl(file.storagePath)
      if (previewRequestRef.current === file.id) setPreviewUrl(url)
    } catch (cause) {
      toast.error(errorMessage(cause, t("That file could not be opened.")))
    }
  }

  async function download(file: DriveFile) {
    try {
      await downloadDriveFile(file)
    } catch (cause) {
      toast.error(errorMessage(cause, t("The file could not be downloaded.")))
    }
  }

  /* ------------------------------------------------------------------ removal */

  function openRemoval(target: RemovalTarget) {
    setRemoval(target)
    setRemovalOpen(true)
  }

  async function confirmRemoval() {
    if (!removal) return
    setRemoving(true)

    try {
      if (removal.kind === "folder") {
        await deleteDriveFolder(removal.folder.id)
        const removedIds = new Set<string>()
        const collect = (id: string) => {
          removedIds.add(id)
          for (const child of folders) if (child.parentId === id) collect(child.id)
        }
        collect(removal.folder.id)

        setFolders((current) => current.filter((folder) => !removedIds.has(folder.id)))
        setFilesByFolder((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => !removedIds.has(key))),
        )
        setStatsByParent((current) => {
          const next = new Map(current[folderKey] ?? [])
          next.delete(removal.folder.id)
          return { ...current, [folderKey]: next }
        })
        toast.success(t("Folder deleted"))
      } else {
        await deleteDriveFile(removal.file)
        setFilesByFolder((current) => ({
          ...current,
          [folderKey]: (current[folderKey] ?? []).filter((entry) => entry.id !== removal.file.id),
        }))
        if (previewFile?.id === removal.file.id) setPreviewOpen(false)
        toast.success(t("File deleted"))
      }

      setRemovalOpen(false)
    } catch (cause) {
      toast.error(errorMessage(cause, t("That item could not be deleted.")))
    } finally {
      setRemoving(false)
    }
  }

  /* ------------------------------------------------------------------ uploads */

  const runUpload = useCallback(
    async (id: string, file: File, targetFolderId: string | null) => {
      const preview = await createDrivePreview(file)
      setUploads((current) => current.map((upload) => (upload.id === id ? { ...upload, preview } : upload)))

      const saved = await uploadDriveFile({
        fileId: id,
        file,
        folderId: targetFolderId,
        preview,
        onProgress: (fraction) =>
          setUploads((current) => current.map((upload) => (upload.id === id ? { ...upload, progress: fraction } : upload))),
      })

      // The thumbnail was rendered here to be uploaded, so the tile can read it
      // back out of memory rather than fetching the bytes it just sent.
      if (preview.thumbnail && saved.thumbnailPath) primeDriveThumbnail(saved.thumbnailPath, preview.thumbnail)

      const key = targetFolderId ?? "root"
      setFilesByFolder((current) => ({
        ...current,
        [key]: [...(current[key] ?? []).filter((entry) => entry.id !== saved.id), saved].sort(compareDriveNames),
      }))
    },
    [],
  )

  const handleFiles = useCallback(
    (incoming: FileList | null) => {
      if (!incoming || incoming.length === 0) return

      const accepted: { id: string; file: File }[] = []
      for (const file of Array.from(incoming)) {
        try {
          assertDriveFileAccepted(file)
          accepted.push({ id: crypto.randomUUID(), file })
        } catch (cause) {
          toast.error(errorMessage(cause, t("That file could not be added to Drive.")))
        }
      }
      if (accepted.length === 0) return

      const targetFolderId = folderId
      setUploads((current) => [
        ...current,
        ...accepted.map(({ id, file }) => ({
          id,
          name: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          folderId: targetFolderId,
          preview: { thumbnail: null, seed: null, width: null, height: null },
          progress: 0,
        })),
      ])

      const queue = [...accepted]
      const worker = async () => {
        for (;;) {
          const next = queue.shift()
          if (!next) return

          try {
            await runUpload(next.id, next.file, targetFolderId)
          } catch (cause) {
            toast.error(errorMessage(cause, t("That file could not be uploaded.")))
          } finally {
            setUploads((current) => current.filter((upload) => upload.id !== next.id))
          }
        }
      }

      void Promise.all(Array.from({ length: Math.min(uploadConcurrency, queue.length) }, worker))
    },
    [folderId, runUpload, t],
  )

  /* -------------------------------------------------------------------- drops */

  const dragCarriesFiles = (event: DragEvent) => event.dataTransfer?.types?.includes("Files") ?? false

  function onDragEnter(event: DragEvent) {
    if (!dragCarriesFiles(event)) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragOver(event: DragEvent) {
    if (!dragCarriesFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }

  // Counted rather than toggled: crossing between two tiles fires leave-then-enter,
  // and a boolean would flash the drop state off for a frame every time.
  function onDragLeave(event: DragEvent) {
    if (!dragCarriesFiles(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  function onDrop(event: DragEvent) {
    if (!dragCarriesFiles(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    handleFiles(event.dataTransfer.files)
  }

  /* --------------------------------------------------------------------- view */

  const entryDelay = (index: number) => (staggerEntry ? staggerRamp(index) : 0)
  const isEmpty = childFolders.length === 0 && files.length === 0 && visibleUploads.length === 0

  return (
    <div className="md-page md-page-stack">
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <h1 className="text-[22px] font-medium leading-tight text-[var(--md-ink)]">{t("Drive")}</h1>
        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-self-end">
          <Button
            variant="ghost"
            className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-4 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-field-bg-hover)] active:scale-[0.98]"
            onClick={startCreateFolder}
          >
            <FolderPlus data-icon="inline-start" strokeWidth={1.3} />
            {t("New folder")}
          </Button>
          <Button
            className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-4 text-[13px] font-medium text-[var(--md-accent-ink)] transition-[background-color,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-accent-hover)] active:scale-[0.98]"
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud data-icon="inline-start" strokeWidth={1.3} />
            {t("Upload")}
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ""
        }}
      />

      <DriveSurfaceContextMenu onCreateFolder={startCreateFolder} onUpload={() => fileInputRef.current?.click()}>
        <Surface
          padding="none"
          className="md-drive-dropzone overflow-hidden rounded-[var(--md-radius-2xl)]"
          data-dragging={dragging ? "true" : undefined}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {path.length > 0 || dragging ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4">
              {path.length > 0 ? <DriveBreadcrumbRail path={path} onNavigate={navigateToId} /> : null}
              <AnimatePresence initial={false}>
                {dragging ? (
                  <motion.span
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={mdMotion.fast}
                    className="md-drive-drop-hint rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-accent)_12%,transparent)] px-2.5 py-1 text-[11px] font-medium text-[var(--md-selected-text)]"
                  >
                    {t("Drop to upload here")}
                  </motion.span>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}

          <div className="grid gap-5 p-4">
            {loading ? (
              <DriveSkeletonGrid />
            ) : loadError ? (
              <DriveEmptyState
                title={t("Drive is not available")}
                hint={loadError}
                action={
                  <Button
                    variant="ghost"
                    className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[13px] text-[var(--md-ink)]"
                    onClick={() => window.location.reload()}
                  >
                    {t("Try again")}
                  </Button>
                }
              />
            ) : isEmpty ? (
              <DriveEmptyState
                title={folderId ? t("This folder is empty") : t("Nothing in Drive yet")}
                hint={t("Drag files in, or create a folder to organise them first.")}
                action={
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      variant="ghost"
                      className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 text-[13px] text-[var(--md-ink)] hover:bg-[var(--md-field-bg-hover)]"
                      onClick={startCreateFolder}
                    >
                      <FolderPlus data-icon="inline-start" strokeWidth={1.3} />
                      {t("New folder")}
                    </Button>
                    <Button
                      className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[13px] font-medium text-[var(--md-accent-ink)] hover:bg-[var(--md-accent-hover)]"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <UploadCloud data-icon="inline-start" strokeWidth={1.3} />
                      {t("Upload")}
                    </Button>
                  </div>
                }
              />
            ) : (
              <>
                {childFolders.length > 0 ? (
                  <section className="grid gap-2">
                    <DriveSectionLabel count={childFolders.length}>{t("Folders")}</DriveSectionLabel>
                    <div className="md-drive-grid">
                      <AnimatePresence initial={false} mode="popLayout">
                        {childFolders.map((folder, index) => (
                          <DriveGridItem key={folder.id} revealDelay={entryDelay(index)}>
                            <DriveFolderTile
                              folder={folder}
                              stats={stats?.get(folder.id)}
                              renaming={renamingId === folder.id}
                              onOpen={openFolder}
                              onRename={renameFolder}
                              onStartRename={(target) => setRenamingId(target.id)}
                              onCancelRename={() => setRenamingId(null)}
                              onCustomise={startCustomiseFolder}
                              onDelete={(target) => openRemoval({
                                kind: "folder",
                                folder: target,
                                stats: stats?.get(target.id) ?? emptyDriveFolderStats,
                              })}
                            />
                          </DriveGridItem>
                        ))}
                      </AnimatePresence>
                    </div>
                  </section>
                ) : null}

                {files.length > 0 || visibleUploads.length > 0 ? (
                  <section className="grid gap-2">
                    <DriveSectionLabel count={files.length + visibleUploads.length}>{t("Files")}</DriveSectionLabel>
                    <div className="md-drive-grid">
                      <AnimatePresence initial={false} mode="popLayout">
                        {[
                          ...files.map((file) => ({ file, upload: null as PendingUpload | null })),
                          ...visibleUploads.map((upload) => ({
                            upload,
                            file: {
                              id: upload.id,
                              folderId: upload.folderId,
                              name: upload.name,
                              mimeType: upload.mimeType,
                              sizeBytes: upload.sizeBytes,
                              storagePath: "",
                              thumbnailPath: null,
                              previewSeed: upload.preview.seed,
                              previewWidth: upload.preview.width,
                              previewHeight: upload.preview.height,
                              createdAt: "",
                              updatedAt: "",
                            } satisfies DriveFile,
                          })),
                        ]
                          .sort((left, right) => compareDriveNames(left.file, right.file))
                          .map(({ file, upload }, index) => (
                            <DriveGridItem key={file.id} revealDelay={entryDelay(index + childFolders.length)}>
                              <DriveFileTile
                                file={file}
                                thumbnailUrl={file.thumbnailPath ? thumbnailUrls[file.thumbnailPath] : null}
                                pending={Boolean(upload)}
                                progress={upload?.progress}
                                renaming={renamingId === file.id}
                                onOpen={openPreview}
                                onRename={renameFile}
                                onStartRename={(target) => setRenamingId(target.id)}
                                onCancelRename={() => setRenamingId(null)}
                                onDownload={download}
                                onDelete={(target) => openRemoval({ kind: "file", file: target })}
                              />
                            </DriveGridItem>
                          ))}
                      </AnimatePresence>
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
        </Surface>
      </DriveSurfaceContextMenu>

      {folderEditor ? (
        <DriveFolderDialog
          open={folderEditorOpen}
          mode={folderEditor.mode}
          draft={folderEditor.draft}
          saving={savingFolder}
          onDraftChange={(draft) => setFolderEditor((current) => (current ? { ...current, draft } : current))}
          onOpenChange={setFolderEditorOpen}
          onSubmit={() => void submitFolderEditor()}
        />
      ) : null}

      <DriveFilePreviewDialog
        file={previewFile}
        url={previewUrl}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onDownload={(file) => void download(file)}
        onDelete={(file) => openRemoval({ kind: "file", file })}
      />

      <Dialog
        open={removalOpen}
        onOpenChange={(open) => {
          if (!open && !removing) setRemovalOpen(false)
        }}
      >
        <DialogContent className="bg-[var(--md-surface)] sm:max-w-[420px]">
          <DialogHeader className="pe-10">
            <DialogTitle className="text-[var(--md-ink)]">
              {removal?.kind === "folder" ? t("Delete this folder?") : t("Delete this file?")}
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-[var(--md-text)]">
              {removal?.kind === "folder"
                ? removal.stats.fileCount > 0 || removal.stats.folderCount > 0
                  ? `${removal.folder.name} — ${t("everything inside it is deleted too, and this cannot be undone.")}`
                  : `${removal.folder.name} — ${t("this cannot be undone.")}`
                : removal
                  ? `${removal.file.name} — ${t("this cannot be undone.")}`
                  : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-[var(--md-surface-soft)]">
            <Button
              variant="ghost"
              disabled={removing}
              className="h-9 rounded-[var(--md-radius-lg)] px-3 text-[13px] text-[var(--md-text)] hover:bg-[var(--md-hover)]"
              onClick={() => setRemovalOpen(false)}
            >
              {t("Cancel")}
            </Button>
            <Button
              disabled={removing}
              className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-red)] px-4 text-[13px] font-medium text-white hover:bg-[color-mix(in_srgb,var(--md-red),black_10%)]"
              onClick={() => void confirmRemoval()}
            >
              {t("Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
