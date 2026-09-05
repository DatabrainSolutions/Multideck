import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  assertCompetitorQuote,
  parseDeclineReason,
  isQuoteResponseOriginAllowed,
  parseDecision,
  parseMessage,
  parseQuoteResponseOrigin,
  parseToken,
  QuoteResponseError,
  safeFileName,
  sha256Hex,
  toClientError,
} from "./core.ts"
import { signedUrlLifetimeSeconds } from "../_shared/document-functions.ts"
import { readConfiguredTenantBrand, type TenantBrand } from "../_shared/tenant-branding.ts"

const documentBucket = "multideck-documents"

type PublicQuoteView = Record<string, unknown> & {
  state?: unknown
  documentId?: unknown
  quote?: { id?: unknown }
}

type Db = SupabaseClient<any, "public", any, any, any>

type StoredQuoteDocument = {
  DOCStoredObject_Container: string
  DOCStoredObject_BlobName: string
  DOCStoredObject_OriginalFileName: string | null
  DOCStoredObject_MimeType: string
  DOCStoredObject_AggregateID: string
  DOCStoredObject_ConcernCode: string
  DOCStoredObject_AggregateType: string
  DOCStoredObject_StatusCode: string
  DOCStoredObject_DeletedAt: string | null
}

async function attachQuoteDocument(admin: Db, value: unknown) {
  const view = value && typeof value === "object" && !Array.isArray(value) ? value as PublicQuoteView : null
  if (!view || view.state !== "active") return value
  const documentId = typeof view.documentId === "string" ? view.documentId : ""
  const quoteId = typeof view.quote?.id === "string" ? view.quote.id : ""
  if (!documentId || !quoteId) {
    throw new QuoteResponseError(409, "This quote document is still being prepared. Ask your freight contact to resend it.")
  }
  const { data: stored, error: storedError } = await admin
    .from("DOC_StoredObjects")
    .select("DOCStoredObject_Container,DOCStoredObject_BlobName,DOCStoredObject_OriginalFileName,DOCStoredObject_MimeType,DOCStoredObject_AggregateID,DOCStoredObject_ConcernCode,DOCStoredObject_AggregateType,DOCStoredObject_StatusCode,DOCStoredObject_DeletedAt")
    .eq("DOCStoredObject_ID", documentId)
    .maybeSingle()
  const storedObject = stored as StoredQuoteDocument | null
  if (storedError || !storedObject
      || storedObject.DOCStoredObject_ConcernCode !== "quote"
      || storedObject.DOCStoredObject_AggregateType !== "CusQuote_Header"
      || String(storedObject.DOCStoredObject_AggregateID) !== quoteId
      || storedObject.DOCStoredObject_MimeType !== "application/pdf"
      || storedObject.DOCStoredObject_StatusCode !== "active"
      || storedObject.DOCStoredObject_DeletedAt) {
    throw new QuoteResponseError(410, "This quote document is no longer available. Ask your freight contact for a new link.")
  }
  const { data: signed, error: signedError } = await admin.storage
    .from(String(storedObject.DOCStoredObject_Container))
    .createSignedUrl(String(storedObject.DOCStoredObject_BlobName), signedUrlLifetimeSeconds)
  if (signedError || !signed?.signedUrl) {
    throw new QuoteResponseError(503, "The quote document could not be opened. Refresh this page and try again.")
  }
  const { documentId: _documentId, ...publicView } = view
  return {
    ...publicView,
    document: {
      url: signed.signedUrl,
      fileName: String(storedObject.DOCStoredObject_OriginalFileName || "Quote.pdf"),
      mimeType: "application/pdf",
      expiresAt: new Date(Date.now() + signedUrlLifetimeSeconds * 1000).toISOString(),
    },
  }
}

function publicBrandContract(brand: TenantBrand) {
  return {
    displayName: brand.displayName,
    logoUrl: brand.logoUrl,
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    backgroundColor: brand.backgroundColor,
    surfaceColor: brand.surfaceColor,
    textColor: brand.textColor,
    appearanceMode: brand.appearanceMode,
    cornerStyle: brand.cornerStyle,
    emailSignOff: brand.emailSignOff,
  }
}

/**
 * Public quote links receive only the saved tenant brand contract. A missing or
 * unreadable configuration deliberately degrades to the fixed Multideck public
 * fallback instead of making the quote itself unavailable.
 */
async function attachQuoteBrand(admin: Db, tokenHash: string, value: unknown) {
  const view = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
  if (!view) return value
  try {
    const { data: link, error } = await admin.schema("quote_api")
      .from("customer_response_links")
      .select("company_id")
      .eq("token_hash", tokenHash)
      .maybeSingle()
    if (error) throw error
    const companyId = link?.company_id ? String(link.company_id) : ""
    const brand = companyId ? await readConfiguredTenantBrand(admin, companyId) : null
    return { ...view, branding: brand ? publicBrandContract(brand) : null }
  } catch (error) {
    console.error("Public quote branding fallback used", { reason: error instanceof Error ? error.message : "Unknown branding read failure" })
    return { ...view, branding: null }
  }
}

function readNamedKey(jsonValue: string | undefined) {
  if (!jsonValue) return null
  try {
    const keys = JSON.parse(jsonValue) as Record<string, string>
    return keys.default ?? Object.values(keys)[0] ?? null
  } catch {
    return null
  }
}

function getSecretKey() {
  return readNamedKey(Deno.env.get("SUPABASE_SECRET_KEYS"))
    ?? Deno.env.get("SUPABASE_SECRET_KEY")
    ?? Deno.env.get("SB_SECRET_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
}

export function isAllowedOrigin(origin: string | null) {
  return isQuoteResponseOriginAllowed(origin)
}

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  }
  if (origin && isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin
  return headers
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  })
}

function requestIp(request: Request) {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
    ?? null
}

async function requestIpHash(request: Request) {
  const ip = requestIp(request)
  const pepper = Deno.env.get("QUOTE_RESPONSE_AUDIT_PEPPER")
  return ip && pepper ? await sha256Hex(`${pepper}:${ip}`) : null
}

Deno.serve(async (request) => {
  const requestOrigin = request.headers.get("Origin")
  if (!isAllowedOrigin(requestOrigin)) return json(null, { error: "This quote link is not available on this workspace." }, 403)
  const origin = parseQuoteResponseOrigin(requestOrigin)
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) })
  if (request.method !== "POST") return json(origin, { error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const secretKey = getSecretKey()
  if (!supabaseUrl || !secretKey) return json(origin, { error: "The quote response service is unavailable." }, 500)
  const admin = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })

  try {
    const contentType = request.headers.get("content-type") ?? ""
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData()
      if (form.get("action") !== "upload") throw new QuoteResponseError(400, "Choose a supported quote action.")
      const token = parseToken(form.get("token"))
      const suppliedIdempotencyKey = String(form.get("idempotencyKey") ?? "").trim()
      if (suppliedIdempotencyKey && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedIdempotencyKey)) {
        throw new QuoteResponseError(400, "The attachment upload request is invalid.")
      }
      const idempotencyKey = suppliedIdempotencyKey || crypto.randomUUID()
      const file = form.get("file")
      if (!(file instanceof File)) throw new QuoteResponseError(400, "Choose a competitor quote to attach.")
      assertCompetitorQuote(file)
      const tokenHash = await sha256Hex(token)
      const sourceIpHash = await requestIpHash(request)
      const { data: reservationData, error: reservationError } = await admin.rpc("quote_customer_response_reserve_upload", {
        requested_token_hash: tokenHash,
        requested_response_origin: origin,
        requested_idempotency_key: idempotencyKey,
        requested_file_size_bytes: file.size,
        requested_source_ip_hash: sourceIpHash,
      })
      if (reservationError || !reservationData) throw reservationError ?? new Error("Attachment upload capacity could not be reserved")
      const reservation = reservationData as {
        reservationId: string
        blobName: string
        completed?: boolean
        storedObjectId?: string | null
      }
      const fileName = safeFileName(file.name)
      if (reservation.completed && reservation.storedObjectId) {
        return json(origin, { documentId: reservation.storedObjectId, fileName, fileSizeBytes: file.size, reused: true })
      }
      const bytes = await file.arrayBuffer()
      const fileHash = await sha256Hex(bytes)
      const blobName = reservation.blobName
      const { error: uploadError } = await admin.storage.from(documentBucket).upload(blobName, bytes, {
        contentType: file.type,
        upsert: true,
      })
      if (uploadError) {
        await admin.rpc("quote_customer_response_cancel_upload", {
          requested_token_hash: tokenHash,
          requested_response_origin: origin,
          requested_reservation_id: reservation.reservationId,
        })
        throw uploadError
      }
      const { data: stored, error: storedError } = await admin.rpc("quote_customer_response_complete_upload", {
        requested_token_hash: tokenHash,
        requested_response_origin: origin,
        requested_reservation_id: reservation.reservationId,
        requested_file_name: fileName,
        requested_mime_type: file.type,
        requested_sha256: fileHash,
      })
      if (storedError || !stored) {
        await admin.storage.from(documentBucket).remove([blobName])
        await admin.rpc("quote_customer_response_cancel_upload", {
          requested_token_hash: tokenHash,
          requested_response_origin: origin,
          requested_reservation_id: reservation.reservationId,
        })
        throw storedError ?? new Error("Competitor quote catalogue entry failed")
      }
      const completed = stored as {
        documentId: string
        fileName: string
        fileSizeBytes: number
        oldBlobName?: string | null
      }
      if (completed.oldBlobName && completed.oldBlobName !== blobName) {
        const { error: cleanupError } = await admin.storage.from(documentBucket).remove([completed.oldBlobName])
        if (cleanupError) console.error("Superseded competitor quote cleanup failed", { reason: cleanupError.message })
      }
      return json(origin, { documentId: completed.documentId, fileName: completed.fileName, fileSizeBytes: completed.fileSizeBytes })
    }

    const body = await request.json() as Record<string, unknown>
    const token = parseToken(body.token)
    const tokenHash = await sha256Hex(token)
    if (body.action === "view") {
      const { data, error } = await admin.rpc("quote_customer_response_view", {
        requested_token_hash: tokenHash,
        requested_response_origin: origin,
      })
      if (error || !data) throw error ?? new Error("Quote response view returned no result")
      const view = await attachQuoteDocument(admin, data)
      return json(origin, await attachQuoteBrand(admin, tokenHash, view))
    }
    if (body.action === "submit") {
      const decision = parseDecision(body.decision)
      const message = parseMessage(body.message, decision)
      const declineReasonCode = parseDeclineReason(body.declineReasonCode, decision)
      const competitorDocumentId = body.competitorDocumentId === null || body.competitorDocumentId === undefined || body.competitorDocumentId === ""
        ? null
        : String(body.competitorDocumentId)
      if (competitorDocumentId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(competitorDocumentId)) {
        throw new QuoteResponseError(400, "The competitor quote attachment is invalid.")
      }
      const { data, error } = await admin.rpc("quote_customer_response_submit", {
        requested_token_hash: tokenHash,
        requested_response_origin: origin,
        requested_decision: decision,
        requested_message: message,
        requested_competitor_document_id: competitorDocumentId,
        requested_source_ip_hash: await requestIpHash(request),
        requested_user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        requested_decline_reason: declineReasonCode,
      })
      if (error || !data) throw error ?? new Error("Quote response submission returned no result")
      return json(origin, data)
    }
    throw new QuoteResponseError(400, "Choose a supported quote action.")
  } catch (error) {
    const safe = toClientError(error)
    console.error("Public quote response failed", { status: safe.status, reason: safe.auditMessage })
    return json(origin, { error: safe.clientMessage }, safe.status)
  }
})
