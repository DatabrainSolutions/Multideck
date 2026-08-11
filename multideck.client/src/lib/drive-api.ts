/**
 * Drive: the company's private file workspace.
 *
 * Two shapes of read, chosen for how the screen is actually used:
 *
 * - Folders are loaded **once, in full**. A company drive is tens to a few hundred
 *   folders, so holding the whole tree in memory makes opening a folder, walking
 *   the breadcrumb, and going back instant with no request at all.
 * - Files are loaded **per folder**, because that list is the part that grows.
 *
 * Objects live in the private `crm-drive` bucket beneath the company's own path
 * prefix, which both the table policies and the storage policies enforce.
 */

import { driveFileKind, type DriveFileKind } from "@/lib/drive-thumbnail"
import { getSupabaseSession, supabase, supabaseStorageUrl } from "@/lib/supabase"

export const driveBucket = "crm-drive"
export const driveMaxFileBytes = 50 * 1024 * 1024

/**
 * Mirrors the bucket's own allow list. Checking here means an unsupported file is
 * refused with a sentence the operator can act on, rather than with a storage
 * error after the bytes have already been sent.
 */
export const driveAllowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml",
  "image/heic",
  "image/tiff",
  "application/pdf",
  "application/postscript",
  "image/vnd.adobe.photoshop",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "text/plain",
  "text/csv",
  "application/json",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "font/woff2",
  "font/ttf",
  "font/otf",
])

export const driveFolderColours = [
  "teal",
  "meadow",
  "sky",
  "ocean",
  "indigo",
  "violet",
  "plum",
  "rose",
  "ember",
  "graphite",
] as const

export const driveFolderIcons = [
  "folder",
  "image",
  "file-text",
  "palette",
  "presentation",
  "video",
  "archive",
  "sparkles",
  "shield",
  "tag",
  "globe",
  "package",
] as const

export type DriveFolderColour = (typeof driveFolderColours)[number]
export type DriveFolderIcon = (typeof driveFolderIcons)[number]

export type DriveFolder = {
  id: string
  parentId: string | null
  name: string
  colour: DriveFolderColour
  icon: DriveFolderIcon
  createdAt: string
  updatedAt: string
}

export type DriveFile = {
  id: string
  folderId: string | null
  name: string
  mimeType: string
  sizeBytes: number
  storagePath: string
  thumbnailPath: string | null
  previewSeed: string | null
  previewWidth: number | null
  previewHeight: number | null
  createdAt: string
  updatedAt: string
}

export type DriveFolderStats = {
  folderCount: number
  fileCount: number
  byteTotal: number
  lastActivityAt: string | null
}

export const emptyDriveFolderStats: DriveFolderStats = {
  folderCount: 0,
  fileCount: 0,
  byteTotal: 0,
  lastActivityAt: null,
}

export class DriveError extends Error {}

const foldersTable = "CRM_DriveFolders"
const filesTable = "CRM_DriveFiles"

const folderColumns = `
  DriveFolder_ID,
  DriveFolder_ParentID,
  DriveFolder_Name,
  DriveFolder_ColourCode,
  DriveFolder_IconCode,
  DriveFolder_CreatedAt,
  DriveFolder_UpdatedAt
`

const fileColumns = `
  DriveFile_ID,
  DriveFile_FolderID,
  DriveFile_Name,
  DriveFile_MimeType,
  DriveFile_SizeBytes,
  DriveFile_StoragePath,
  DriveFile_ThumbnailPath,
  DriveFile_PreviewSeed,
  DriveFile_PreviewWidth,
  DriveFile_PreviewHeight,
  DriveFile_CreatedAt,
  DriveFile_UpdatedAt
`

function client() {
  if (!supabase) throw new DriveError("Drive is unavailable until this workspace is connected to Supabase.")
  return supabase
}

/** Postgres speaks in codes; the operator should read a sentence. */
function driveError(error: { code?: string; message?: string } | null, fallback: string): DriveError {
  if (error?.code === "23505") return new DriveError("Something with that name is already here. Choose another name.")
  if (error?.code === "23514") return new DriveError("That name is not allowed. Use between 1 and 120 characters.")
  if (error?.code === "42501") return new DriveError("You do not have permission to change this Drive item.")
  return new DriveError(error?.message || fallback)
}

type FolderRow = {
  DriveFolder_ID: string
  DriveFolder_ParentID: string | null
  DriveFolder_Name: string
  DriveFolder_ColourCode: string
  DriveFolder_IconCode: string
  DriveFolder_CreatedAt: string
  DriveFolder_UpdatedAt: string
}

type FileRow = {
  DriveFile_ID: string
  DriveFile_FolderID: string | null
  DriveFile_Name: string
  DriveFile_MimeType: string
  DriveFile_SizeBytes: number
  DriveFile_StoragePath: string
  DriveFile_ThumbnailPath: string | null
  DriveFile_PreviewSeed: string | null
  DriveFile_PreviewWidth: number | null
  DriveFile_PreviewHeight: number | null
  DriveFile_CreatedAt: string
  DriveFile_UpdatedAt: string
}

function toFolder(row: FolderRow): DriveFolder {
  return {
    id: row.DriveFolder_ID,
    parentId: row.DriveFolder_ParentID,
    name: row.DriveFolder_Name,
    colour: (driveFolderColours as readonly string[]).includes(row.DriveFolder_ColourCode)
      ? (row.DriveFolder_ColourCode as DriveFolderColour)
      : "teal",
    icon: (driveFolderIcons as readonly string[]).includes(row.DriveFolder_IconCode)
      ? (row.DriveFolder_IconCode as DriveFolderIcon)
      : "folder",
    createdAt: row.DriveFolder_CreatedAt,
    updatedAt: row.DriveFolder_UpdatedAt,
  }
}

function toFile(row: FileRow): DriveFile {
  return {
    id: row.DriveFile_ID,
    folderId: row.DriveFile_FolderID,
    name: row.DriveFile_Name,
    mimeType: row.DriveFile_MimeType,
    sizeBytes: row.DriveFile_SizeBytes,
    storagePath: row.DriveFile_StoragePath,
    thumbnailPath: row.DriveFile_ThumbnailPath,
    previewSeed: row.DriveFile_PreviewSeed,
    previewWidth: row.DriveFile_PreviewWidth,
    previewHeight: row.DriveFile_PreviewHeight,
    createdAt: row.DriveFile_CreatedAt,
    updatedAt: row.DriveFile_UpdatedAt,
  }
}

/* ------------------------------------------------------------------- ordering */

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })

export function compareDriveNames(left: { name: string }, right: { name: string }) {
  return nameCollator.compare(left.name, right.name)
}

/* ---------------------------------------------------------------------- reads */

export async function listDriveFolders(): Promise<DriveFolder[]> {
  const { data, error } = await client().from(foldersTable).select(folderColumns)
  if (error) throw driveError(error, "Drive folders could not be loaded.")

  return (data as FolderRow[]).map(toFolder).sort(compareDriveNames)
}

export async function listDriveFiles(folderId: string | null): Promise<DriveFile[]> {
  const query = client().from(filesTable).select(fileColumns)
  const { data, error } = await (folderId === null
    ? query.is("DriveFile_FolderID", null)
    : query.eq("DriveFile_FolderID", folderId))
  if (error) throw driveError(error, "Drive files could not be loaded.")

  return (data as FileRow[]).map(toFile).sort(compareDriveNames)
}

/**
 * Subtree totals for every folder directly inside `parentId`, in one round trip.
 * A tile that had to fetch its own count would mean one request per tile.
 */
export async function loadDriveFolderStats(parentId: string | null): Promise<Map<string, DriveFolderStats>> {
  const { data, error } = await client().rpc("crm_drive_folder_stats", { p_parent_id: parentId })
  if (error) throw driveError(error, "Drive folder sizes could not be loaded.")

  const rows = (data ?? []) as { folderId: string; folderCount: number; fileCount: number; byteTotal: number; lastActivityAt: string | null }[]
  return new Map(
    rows.map((row) => [
      row.folderId,
      {
        folderCount: Number(row.folderCount) || 0,
        fileCount: Number(row.fileCount) || 0,
        byteTotal: Number(row.byteTotal) || 0,
        lastActivityAt: row.lastActivityAt,
      },
    ]),
  )
}

/* ------------------------------------------------------------------ tree shape */

export function driveChildFolders(folders: readonly DriveFolder[], parentId: string | null) {
  return folders.filter((folder) => folder.parentId === parentId)
}

/** Root-first ancestor chain, used by the breadcrumb. Guards against a broken parent link. */
export function driveFolderPath(folders: readonly DriveFolder[], folderId: string | null): DriveFolder[] {
  if (!folderId) return []

  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: DriveFolder[] = []
  const seen = new Set<string>()
  let current = byId.get(folderId)

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  return path
}

/* ------------------------------------------------------------------- mutations */

export async function createDriveFolder(input: {
  parentId: string | null
  name: string
  colour: DriveFolderColour
  icon: DriveFolderIcon
}): Promise<DriveFolder> {
  const { data, error } = await client()
    .from(foldersTable)
    .insert({
      DriveFolder_ParentID: input.parentId,
      DriveFolder_Name: input.name.trim(),
      DriveFolder_ColourCode: input.colour,
      DriveFolder_IconCode: input.icon,
    })
    .select(folderColumns)
    .single()
  if (error) throw driveError(error, "The folder could not be created.")

  return toFolder(data as FolderRow)
}

export async function updateDriveFolder(
  folderId: string,
  changes: { name?: string; colour?: DriveFolderColour; icon?: DriveFolderIcon },
): Promise<DriveFolder> {
  const patch: Record<string, string> = {}
  if (changes.name !== undefined) patch.DriveFolder_Name = changes.name.trim()
  if (changes.colour !== undefined) patch.DriveFolder_ColourCode = changes.colour
  if (changes.icon !== undefined) patch.DriveFolder_IconCode = changes.icon

  const { data, error } = await client()
    .from(foldersTable)
    .update(patch)
    .eq("DriveFolder_ID", folderId)
    .select(folderColumns)
    .single()
  if (error) throw driveError(error, "The folder could not be updated.")

  return toFolder(data as FolderRow)
}

/**
 * The row delete cascades in Postgres; the stored objects come back so the
 * bucket is cleared in the same action rather than left with orphans.
 */
export async function deleteDriveFolder(folderId: string) {
  const { data, error } = await client().rpc("crm_drive_delete_folder", { p_folder_id: folderId })
  if (error) throw driveError(error, "The folder could not be deleted.")

  const paths = (data ?? []) as string[]
  if (paths.length > 0) await removeStoredObjects(paths)
}

export async function renameDriveFile(fileId: string, name: string): Promise<DriveFile> {
  const { data, error } = await client()
    .from(filesTable)
    .update({ DriveFile_Name: name.trim() })
    .eq("DriveFile_ID", fileId)
    .select(fileColumns)
    .single()
  if (error) throw driveError(error, "The file could not be renamed.")

  return toFile(data as FileRow)
}

export async function deleteDriveFile(file: DriveFile) {
  const { error } = await client().from(filesTable).delete().eq("DriveFile_ID", file.id)
  if (error) throw driveError(error, "The file could not be deleted.")

  await removeStoredObjects([file.storagePath, file.thumbnailPath].filter((path): path is string => Boolean(path)))
}

async function removeStoredObjects(paths: string[]) {
  const { error } = await client().storage.from(driveBucket).remove(paths)
  // The metadata is already gone, so the operator's action succeeded. A stubborn
  // object is a cleanup concern, not something to fail the interaction over.
  if (error) console.warn("Some Drive objects could not be removed from storage.", error)
}

/* --------------------------------------------------------------------- uploads */

let companyIdPromise: Promise<string> | null = null

/** The company prefix every stored object has to sit under. */
async function currentCompanyId() {
  companyIdPromise ??= (async () => {
    const { data, error } = await client().rpc("app_current_company_id")
    if (error) throw driveError(error, "Your workspace could not be identified.")
    if (typeof data !== "string" || !data) throw new DriveError("Your account is not linked to a workspace.")
    return data
  })()

  try {
    return await companyIdPromise
  } catch (error) {
    companyIdPromise = null
    throw error
  }
}

export function assertDriveFileAccepted(file: File) {
  if (file.size < 1) throw new DriveError(`${file.name} is empty.`)
  if (file.size > driveMaxFileBytes) throw new DriveError(`${file.name} is over 50 MB. Drive files can be up to 50 MB.`)
  if (!driveAllowedMimeTypes.has(file.type)) {
    throw new DriveError(`${file.name} is not a file type Drive stores. Use images, PDFs, video, documents, fonts, or archives.`)
  }
}

export function driveFileExtension(name: string, mimeType: string) {
  const fromName = name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1]
  if (fromName) return fromName

  const fromMime = mimeType.split("/").at(-1)?.replace(/[^a-z0-9]/gi, "").toLowerCase()
  return fromMime && fromMime.length <= 8 ? fromMime : "bin"
}

export type DriveUploadInput = {
  /** Minted by the caller so the pending tile and the saved file share a React key. */
  fileId: string
  file: File
  folderId: string | null
  preview: { thumbnail: Blob | null; seed: string | null; width: number | null; height: number | null }
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/**
 * Streams the original through XHR so the tile can show honest progress — the
 * client library does not report it — then stores the small preview and the row.
 * A failure at any step takes the already-written objects back out with it.
 */
export async function uploadDriveFile(input: DriveUploadInput): Promise<DriveFile> {
  const { fileId, file, folderId, preview, onProgress, signal } = input

  assertDriveFileAccepted(file)

  const companyId = await currentCompanyId()
  const extension = driveFileExtension(file.name, file.type)
  const storagePath = `${companyId}/files/${fileId}.${extension}`
  const thumbnailPath = preview.thumbnail ? `${companyId}/thumbs/${fileId}.webp` : null
  const written: string[] = []

  try {
    await putObject(storagePath, file, file.type || "application/octet-stream", { onProgress, signal })
    written.push(storagePath)

    if (preview.thumbnail && thumbnailPath) {
      const { error } = await client().storage.from(driveBucket).upload(thumbnailPath, preview.thumbnail, {
        cacheControl: "31536000",
        contentType: "image/webp",
        upsert: false,
      })
      if (error) throw driveError(error, "The file preview could not be stored.")
      written.push(thumbnailPath)
    }

    const { data, error } = await client()
      .from(filesTable)
      .insert({
        DriveFile_ID: fileId,
        DriveFile_FolderID: folderId,
        DriveFile_Name: file.name.slice(0, 255),
        DriveFile_MimeType: file.type || "application/octet-stream",
        DriveFile_SizeBytes: file.size,
        DriveFile_StoragePath: storagePath,
        DriveFile_ThumbnailPath: thumbnailPath,
        DriveFile_PreviewSeed: preview.seed,
        DriveFile_PreviewWidth: preview.width,
        DriveFile_PreviewHeight: preview.height,
      })
      .select(fileColumns)
      .single()
    if (error) throw driveError(error, "The file could not be saved to Drive.")

    return toFile(data as FileRow)
  } catch (error) {
    if (written.length > 0) await removeStoredObjects(written)
    throw error
  }
}

function putObject(
  path: string,
  body: Blob,
  contentType: string,
  options: { onProgress?: (fraction: number) => void; signal?: AbortSignal },
) {
  return new Promise<void>((resolve, reject) => {
    void getSupabaseSession()
      .then((session) => {
        const token = session?.access_token
        if (!token) {
          reject(new DriveError("Sign in again before uploading to Drive."))
          return
        }

        const request = new XMLHttpRequest()
        request.open("POST", `${supabaseStorageUrl}/object/${driveBucket}/${path}`)
        request.setRequestHeader("Authorization", `Bearer ${token}`)
        request.setRequestHeader("Content-Type", contentType)
        request.setRequestHeader("Cache-Control", "max-age=31536000")
        request.setRequestHeader("x-upsert", "false")

        request.upload.onprogress = (event) => {
          if (event.lengthComputable) options.onProgress?.(event.loaded / event.total)
        }
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) {
            options.onProgress?.(1)
            resolve()
            return
          }
          reject(new DriveError(storageMessage(request.responseText) ?? "The file could not be uploaded."))
        }
        request.onerror = () => reject(new DriveError("The upload lost its connection. Try again."))
        request.onabort = () => reject(new DOMException("The upload was cancelled.", "AbortError"))

        options.signal?.addEventListener("abort", () => request.abort(), { once: true })
        request.send(body)
      })
      .catch(reject)
  })
}

function storageMessage(responseText: string) {
  try {
    const parsed = JSON.parse(responseText) as { message?: string; error?: string }
    return parsed.message ?? parsed.error ?? null
  } catch {
    return null
  }
}

/* ----------------------------------------------------------------- signed URLs */

type SignedEntry = { url: string; expiresAt: number }

const signedUrlTtlSeconds = 3_600
/** Refreshed early so a tile never reaches for a URL that expires mid-decode. */
const signedUrlRefreshMs = (signedUrlTtlSeconds - 300) * 1_000

const signedUrls = new Map<string, SignedEntry>()

function cachedSignedUrl(path: string) {
  const entry = signedUrls.get(path)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    signedUrls.delete(path)
    return null
  }
  return entry.url
}

/**
 * One request for a whole folder's thumbnails, with the results cached for the
 * session, so going back into a folder repaints from memory.
 */
export async function driveSignedUrls(paths: readonly string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  const missing: string[] = []

  for (const path of new Set(paths)) {
    const cached = cachedSignedUrl(path)
    if (cached) resolved.set(path, cached)
    else missing.push(path)
  }

  if (missing.length === 0) return resolved

  const { data, error } = await client().storage.from(driveBucket).createSignedUrls(missing, signedUrlTtlSeconds)
  if (error) throw driveError(error, "Drive previews could not be loaded.")

  const expiresAt = Date.now() + signedUrlRefreshMs
  for (const item of data ?? []) {
    if (!item.signedUrl || !item.path) continue
    signedUrls.set(item.path, { url: item.signedUrl, expiresAt })
    resolved.set(item.path, item.signedUrl)
  }

  return resolved
}

/**
 * The browser already rendered this thumbnail in order to upload it, so the tile
 * reads it straight out of memory instead of fetching back the bytes it just sent.
 * The blob URL lives for the life of the document, which is exactly as long as it
 * can be useful.
 */
export function primeDriveThumbnail(path: string, thumbnail: Blob) {
  if (signedUrls.has(path)) return
  signedUrls.set(path, { url: URL.createObjectURL(thumbnail), expiresAt: Date.now() + signedUrlRefreshMs })
}

export async function driveSignedUrl(path: string) {
  const urls = await driveSignedUrls([path])
  const url = urls.get(path)
  if (!url) throw new DriveError("That file could not be opened.")
  return url
}

export async function downloadDriveFile(file: DriveFile) {
  const { data, error } = await client().storage.from(driveBucket).download(file.storagePath)
  if (error) throw driveError(error, "The file could not be downloaded.")

  const url = URL.createObjectURL(data)
  const link = document.createElement("a")
  link.href = url
  link.download = file.name
  link.rel = "noopener"
  document.body.append(link)
  link.click()
  link.remove()
  // Revoked on the next task so the navigation has already started.
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

/* ------------------------------------------------------------------ formatting */

const byteUnits = ["B", "KB", "MB", "GB", "TB"] as const

export function formatDriveBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB"

  const exponent = Math.min(byteUnits.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  const decimals = value >= 100 || exponent === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${byteUnits[exponent]}`
}

export function driveFileTypeLabel(file: { name: string; mimeType: string }) {
  const extension = file.name.toLowerCase().match(/\.([a-z0-9]{1,8})$/)?.[1]
  if (extension) return extension.toUpperCase()

  const subtype = file.mimeType.split("/").at(-1) ?? ""
  return subtype ? subtype.toUpperCase().slice(0, 6) : "FILE"
}

export function driveKindOf(file: { name: string; mimeType: string }): DriveFileKind {
  return driveFileKind(file.mimeType, file.name)
}

/** "New folder", then "New folder 2" — the same shape a drive uses. */
export function nextUntitledFolderName(siblings: readonly { name: string }[], base = "New folder") {
  const taken = new Set(siblings.map((sibling) => sibling.name.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base

  for (let index = 2; index < 500; index += 1) {
    const candidate = `${base} ${index}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }

  return `${base} ${Date.now()}`
}
