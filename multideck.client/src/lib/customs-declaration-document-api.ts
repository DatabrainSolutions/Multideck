import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

export type CustomsDeclarationDocument = {
  documentId: string
  fileName: string
  mimeType: "application/pdf"
  fileSizeBytes: number
  mrn: string
  isOfficial: boolean
  environment: "sandbox" | "production"
  retainedUntil: string
  signedUrl: string
  expiresAt: string
}

async function documentError(response: Response) {
  try {
    const payload = await response.json() as { error?: string }
    if (payload.error?.trim()) return new Error(payload.error)
  } catch {
    // Keep the human fallback when the function gateway did not return JSON.
  }
  return new Error("The declaration PDF could not be opened. Try again.")
}

export async function getCustomsDeclarationDocument(declarationId: string) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new Error("Sign in again to view the declaration PDF.")
  const response = await edgeFetch("customs-declaration-document", "", session.access_token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ declarationId }),
  })
  if (!response.ok) throw await documentError(response)
  return response.json() as Promise<CustomsDeclarationDocument>
}

export async function fetchCustomsDeclarationPdf(document: CustomsDeclarationDocument) {
  const response = await fetch(document.signedUrl, { credentials: "omit" })
  if (!response.ok) throw new Error("The secure PDF link expired. Open the document again.")
  const blob = await response.blob()
  if (blob.type !== "application/pdf" && blob.type !== "application/octet-stream") {
    throw new Error("The declaration document was not returned as a PDF.")
  }
  return blob
}
