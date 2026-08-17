import { adminClient, corsHeaders, json } from "../_shared/backend.ts"

async function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(left)), crypto.subtle.digest("SHA-256", encoder.encode(right))])
  const aa = new Uint8Array(a); const bb = new Uint8Array(b)
  if (aa.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < aa.length; i += 1) diff |= aa[i] ^ bb[i]
  return diff === 0
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  if (request.method !== "POST") return json(request, { code: "method_not_allowed" }, 405)
  const expected = Deno.env.get("DEXTER_RETENTION_CLEANUP_SECRET")?.trim() ?? ""
  const supplied = request.headers.get("x-multideck-retention-secret")?.trim() ?? ""
  if (!expected || !supplied || !(await constantTimeEqual(expected, supplied))) return json(request, { code: "not_found" }, 404)

  const admin = adminClient()
  const now = new Date().toISOString()
  const { data, error } = await admin.from("AI_DexterUploads")
    .select("AIDexterUpload_ID,AIDexterUpload_StoredObjectID,DOC_StoredObjects(DOCStoredObject_Container,DOCStoredObject_BlobName)")
    .eq("AIDexterUpload_StatusCode", "active").lte("AIDexterUpload_ExpiresAt", now).limit(200)
  if (error) return json(request, { code: "retention_lookup_failed" }, 503)

  let deleted = 0
  for (const row of data ?? []) {
    const stored = Array.isArray(row.DOC_StoredObjects) ? row.DOC_StoredObjects[0] : row.DOC_StoredObjects
    if (stored?.DOCStoredObject_Container && stored?.DOCStoredObject_BlobName) {
      const { error: storageError } = await admin.storage.from(stored.DOCStoredObject_Container).remove([stored.DOCStoredObject_BlobName])
      if (storageError) continue
    }
    await admin.from("AI_DexterUploads").update({ AIDexterUpload_StatusCode: "deleted", AIDexterUpload_OCRResultJSON: null }).eq("AIDexterUpload_ID", row.AIDexterUpload_ID)
    await admin.from("DOC_StoredObjects").update({ DOCStoredObject_StatusCode: "deleted" }).eq("DOCStoredObject_ID", row.AIDexterUpload_StoredObjectID)
    deleted += 1
  }
  await admin.from("AI_DexterIntentPlans").delete().lt("AIDexterIntent_ExpiresAt", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  await admin.from("AI_DexterUploadReservations").delete().lt("AIDexterUploadReservation_ExpiresAt", now)
  return json(request, { deleted })
})
