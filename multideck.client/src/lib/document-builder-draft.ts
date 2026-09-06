import { workspaceStorageKey } from "./workspace-environment.ts"
import type {
  DocumentContentSectionCode,
  DocumentOutputFormat,
  SaveDocumentStudioTemplateResponse,
} from "@/lib/document-builder-api"

export type DocumentBuilderDraft = {
  schemaVersion: 2
  stage: "context" | "studio"
  templateCode: string
  jobNumber: string
  contentSections: DocumentContentSectionCode[]
  outputFormat: DocumentOutputFormat
  templateBase64: string | null
  sampleData: Record<string, unknown> | null
  savedTemplate: SaveDocumentStudioTemplateResponse | null
  updatedAt: string
}

type LegacyDocumentBuilderDraft = Omit<DocumentBuilderDraft, "schemaVersion" | "stage" | "sampleData" | "savedTemplate"> & {
  schemaVersion: 1
}

const databaseName = workspaceStorageKey("multideck-document-builder")
const storeName = "drafts"
const activeMarker = workspaceStorageKey("multideck:document-builder:active")
const activeDraftIdKey = workspaceStorageKey("multideck:document-builder:draft-id")

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName)
    })
    request.addEventListener("success", () => resolve(request.result), { once: true })
    request.addEventListener("error", () => reject(request.error ?? new Error("Document draft storage could not be opened.")), { once: true })
  })
}

async function withDraftStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase()
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const request = operation(transaction.objectStore(storeName))
    request.addEventListener("success", () => resolve(request.result), { once: true })
    request.addEventListener("error", () => reject(request.error ?? new Error("Document draft storage failed.")), { once: true })
    transaction.addEventListener("complete", () => database.close(), { once: true })
    transaction.addEventListener("abort", () => database.close(), { once: true })
  })
}

function draftKey(userId: string) {
  let draftId = sessionStorage.getItem(activeDraftIdKey)
  if (!draftId) {
    draftId = crypto.randomUUID()
    sessionStorage.setItem(activeDraftIdKey, draftId)
  }
  return `active:${userId}:${draftId}`
}

function legacyDraftKey(userId: string) {
  return `active:${userId}`
}

function templateDraftKey(userId: string, templateCode: string) {
  return `template:${userId}:${templateCode}`
}

export function hasActiveDocumentBuilderDraft() {
  return sessionStorage.getItem(activeMarker) === "true"
}

export function markDocumentBuilderDraftActive(active: boolean) {
  if (active) sessionStorage.setItem(activeMarker, "true")
  else sessionStorage.removeItem(activeMarker)
}

export async function loadDocumentBuilderDraft(userId: string, templateCode?: string) {
  const storedDraft = await withDraftStore<DocumentBuilderDraft | LegacyDocumentBuilderDraft | undefined>("readonly", (store) => store.get(
    templateCode ? templateDraftKey(userId, templateCode) : draftKey(userId),
  ))
  if (!storedDraft && templateCode) {
    const activeDraft = await withDraftStore<DocumentBuilderDraft | LegacyDocumentBuilderDraft | undefined>("readonly", (store) => store.get(draftKey(userId)))
    return activeDraft?.templateCode === templateCode ? normalizeDraft(activeDraft) : null
  }
  if (!storedDraft && !templateCode) {
    const legacyDraft = await withDraftStore<DocumentBuilderDraft | LegacyDocumentBuilderDraft | undefined>("readonly", (store) => store.get(legacyDraftKey(userId)))
    return normalizeDraft(legacyDraft)
  }
  return normalizeDraft(storedDraft)
}

export async function saveDocumentBuilderDraft(userId: string, draft: DocumentBuilderDraft) {
  const database = await openDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, "readwrite")
    const store = transaction.objectStore(storeName)
    store.put(draft, draftKey(userId))
    store.put(draft, templateDraftKey(userId, draft.templateCode))
    transaction.addEventListener("complete", () => {
      database.close()
      resolve()
    }, { once: true })
    transaction.addEventListener("abort", () => {
      database.close()
      reject(transaction.error ?? new Error("Document draft storage failed."))
    }, { once: true })
    transaction.addEventListener("error", () => {
      database.close()
      reject(transaction.error ?? new Error("Document draft storage failed."))
    }, { once: true })
  })
  markDocumentBuilderDraftActive(true)
}

export async function clearDocumentBuilderDraft(userId: string) {
  await withDraftStore<undefined>("readwrite", (store) => store.delete(draftKey(userId)))
  markDocumentBuilderDraftActive(false)
}

function normalizeDraft(draft: DocumentBuilderDraft | LegacyDocumentBuilderDraft | undefined): DocumentBuilderDraft | null {
  if (!draft) return null
  if (draft.schemaVersion === 2) return draft
  if (draft.schemaVersion === 1) {
    return {
      ...draft,
      schemaVersion: 2,
      stage: "studio",
      sampleData: null,
      savedTemplate: null,
    }
  }
  return null
}
