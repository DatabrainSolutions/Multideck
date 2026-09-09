import { createClient } from "npm:@supabase/supabase-js@2.108.2"

const documentBucket = "multideck-documents"
const maximumRowsPerRun = 100

Deno.serve(async (request) => {
  if (request.method !== "POST") return response({ detail: "Method not allowed." }, 405)
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  const authorization = request.headers.get("Authorization") ?? ""
  if (!serviceRoleKey || !constantTimeEqual(authorization, `Bearer ${serviceRoleKey}`)) {
    return response({ detail: "Not authorised." }, 401)
  }

  const url = Deno.env.get("SUPABASE_URL")
  if (!url) return response({ detail: "Cleanup is not configured." }, 503)
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const now = new Date().toISOString()
  const { data: extractions, error } = await admin.from("Customs_InvoiceExtractions")
    .select("CUSTIE_ID,CUSTIE_StoredObjectID,CUSTIE_PreviewExpiresAt")
    .not("CUSTIE_StoredObjectID", "is", null)
    .lt("CUSTIE_PreviewExpiresAt", now)
    .limit(maximumRowsPerRun)
  if (error) return response({ detail: "Cleanup could not read expired previews." }, 503)

  let removed = 0
  for (const extraction of extractions ?? []) {
    const storedObjectId = text(extraction.CUSTIE_StoredObjectID)
    if (!storedObjectId) continue
    const { data: stored } = await admin.from("DOC_StoredObjects")
      .select("DOCStoredObject_Container,DOCStoredObject_BlobName")
      .eq("DOCStoredObject_ID", storedObjectId)
      .maybeSingle()
    if (stored?.DOCStoredObject_Container === documentBucket && stored.DOCStoredObject_BlobName) {
      const storage = await admin.storage.from(documentBucket).remove([stored.DOCStoredObject_BlobName])
      if (storage.error) {
        console.warn("Customs invoice preview cleanup could not remove storage object", { storedObjectId })
        continue
      }
    }
    await admin.from("DOC_StoredObjects").delete().eq("DOCStoredObject_ID", storedObjectId)
    await admin.from("Customs_InvoiceExtractions").update({
      CUSTIE_StoredObjectID: null,
      CUSTIE_PreviewExpiresAt: null,
      CUSTIE_UpdatedAt: now,
    }).eq("CUSTIE_ID", extraction.CUSTIE_ID)
    removed += 1
  }

  return response({ checked: extractions?.length ?? 0, removed })
})

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder()
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  let difference = a.byteLength ^ b.byteLength
  const length = Math.max(a.byteLength, b.byteLength)
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0)
  return difference === 0
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  })
}
