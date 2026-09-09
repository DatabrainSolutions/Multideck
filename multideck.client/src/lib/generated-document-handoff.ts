export type GeneratedDocumentHandoff = {
  blob: Blob
  fileName: string
  mimeType: string
  generatedDocumentId: string
  jobNumber: string
  templateName: string
}

let pendingDexterDocument: GeneratedDocumentHandoff | null = null

export function handGeneratedDocumentToDexter(document: GeneratedDocumentHandoff) {
  pendingDexterDocument = document
}

export function takeGeneratedDocumentForDexter() {
  const document = pendingDexterDocument
  pendingDexterDocument = null
  return document
}
