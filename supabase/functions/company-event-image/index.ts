import { authenticate, corsHeaders, currentInternalUser, failure, HttpError, json, requirePermission } from "../_shared/backend.ts"
import { eventImageBucket, eventImageLimit, eventImageModel, eventImagePrompt, falImageUrl, isWebp, type ImageBrief } from "./core.ts"
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

// Dexter chat and Watching for you deliberately do not start or watch this
// transient visual job: doing so could silently buy repeated provider images.
// The event itself remains in Dexter's existing permissioned event domain.

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const endpoint = `https://queue.fal.run/${eventImageModel}`
type Admin = Awaited<ReturnType<typeof authenticate>>["admin"]

async function falJson(url: string, key: string, init: RequestInit = {}) {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { Authorization: `Key ${key}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(20_000),
    })
  } catch { throw new HttpError(502, "Dexter could not reach the image provider. Try again.") }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as Record<string, unknown> | null
    console.error("Fal event image request failed", { path: new URL(url).pathname, status: response.status, error: typeof body?.error === "string" ? body.error.slice(0, 120) : null })
    throw new HttpError(502, "Dexter could not create the event image. Try again.")
  }
  return await response.json() as Record<string, unknown>
}

async function generateImage(key: string, brief: ImageBrief) {
  const submitted = await falJson(endpoint, key, {
    method: "POST",
    body: JSON.stringify({ prompt: eventImagePrompt(brief), aspect_ratio: "21:9", num_images: 1, output_format: "webp" }),
  })
  const requestId = submitted.request_id
  if (typeof requestId !== "string" || !requestIdPattern.test(requestId)) throw new HttpError(502, "The image provider did not accept the request. Try again.")
  // Fal returns the canonical queue URLs. The route may differ from the submit endpoint.
  const queueUrl = (value: unknown, suffix: string) => {
    if (typeof value !== "string") throw new HttpError(502, "The image provider did not return a request address.")
    const url = new URL(value)
    if (url.protocol !== "https:" || url.hostname !== "queue.fal.run" || url.username || url.password
      || url.port || !url.pathname.endsWith(`/requests/${requestId}${suffix}`)) {
      throw new HttpError(502, "The image provider returned an invalid request address.")
    }
    return url.toString()
  }
  const statusUrl = queueUrl(submitted.status_url, "/status")
  const resultUrl = queueUrl(submitted.response_url, "")
  const deadline = Date.now() + 95_000
  while (Date.now() < deadline) {
    const status = await falJson(statusUrl, key)
    if (status.status === "COMPLETED") {
      const result = await falJson(resultUrl, key)
      const images = Array.isArray(result.images) ? result.images : []
      const image = images[0] && typeof images[0] === "object" ? images[0] as Record<string, unknown> : {}
      return falImageUrl(image.url)
    }
    if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
      throw new HttpError(502, "Dexter could not create the event image. Try again.")
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new HttpError(504, "The image is taking too long. Save again to retry.")
}

async function imageBytes(url: URL) {
  let response: Response
  try { response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "error" }) }
  catch { throw new HttpError(502, "The event image could not be downloaded. Try again.") }
  if (!response.ok || !response.body) throw new HttpError(502, "The event image could not be downloaded. Try again.")
  if (Number(response.headers.get("content-length") || 0) > eventImageLimit) throw new HttpError(502, "The created image is too large. Upload your own image instead.")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > eventImageLimit) { await reader.cancel(); throw new HttpError(502, "The created image is too large. Upload your own image instead.") }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  if (!isWebp(bytes)) throw new HttpError(502, "The image provider returned an invalid image. Try again.")
  return bytes
}

async function createCover(admin: Admin, eventId: string, companyId: string, actorId: string, path: string, startedAt: string, brief: ImageBrief, key: string) {
  try {
    const bytes = await imageBytes(await generateImage(key, brief))
    const { error: uploadError } = await admin.storage.from(eventImageBucket).upload(path, bytes, {
      contentType: "image/webp", cacheControl: "3600", upsert: false,
    })
    if (uploadError) throw new Error("The event image could not be saved.")
    const { data: updated, error: updateError } = await admin.from("company_events")
      .update({ image_path: path, image_generation_status: "complete", image_generation_started_at: null, updated_at: new Date().toISOString() })
      .eq("id", eventId).eq("company_id", companyId).eq("image_generation_status", "generating")
      .eq("image_generation_started_at", startedAt).is("image_path", null)
      .in("status", ["draft", "published"]).select("id").maybeSingle()
    if (updateError) throw new Error("The event cover could not be attached.")
    if (updated) {
      await admin.from("company_event_audit").insert({ company_id: companyId, event_id: eventId, actor_id: actorId, kind: "image_generated", details: { source: "fal_muse_image" } })
    } else {
      // An organiser uploaded a cover or cancelled the event while this job ran.
      await admin.storage.from(eventImageBucket).remove([path])
    }
  } catch (error) {
    console.error("Company event cover generation failed", { eventId, reason: error instanceof Error ? error.message.slice(0, 160) : "unknown" })
    const { error: stateError } = await admin.from("company_events")
      .update({ image_generation_status: "failed", image_generation_started_at: null })
      .eq("id", eventId).eq("company_id", companyId).eq("image_generation_status", "generating")
      .eq("image_generation_started_at", startedAt).is("image_path", null)
    if (stateError) console.error("Company event cover failure state could not be saved", { eventId })
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    if (request.method !== "POST") throw new HttpError(405, "Use POST to create an event image.")
    const { admin, user } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    await requirePermission(admin, current.User_ID, "Events.Manage")
    const { data: settings, error: settingsError } = await admin.from("company_event_settings")
      .select("enabled").eq("company_id", current.Company_ID).maybeSingle()
    if (settingsError) throw new HttpError(500, "Event settings could not be checked.")
    if (!settings?.enabled) throw new HttpError(403, "Events are turned off for this workspace.")

    const input = await request.json().catch(() => null) as { eventId?: string } | null
    if (!input || !requestIdPattern.test(input.eventId ?? "")) throw new HttpError(400, "Choose a saved event to create the image.")
    const { data: event, error: eventError } = await admin.from("company_events")
      .select("id,company_id,title,location,details,starts_at,image_path,status,image_generation_status,image_generation_started_at")
      .eq("id", input.eventId).eq("company_id", current.Company_ID).maybeSingle()
    if (eventError) throw new HttpError(500, "The event could not be checked.")
    if (!event || event.status === "archived" || event.status === "cancelled") throw new HttpError(404, "The event is not available.")
    if (event.image_path) return json(request, { status: "complete" })
    if (event.image_generation_status === "generating" && event.image_generation_started_at
      && Date.now() - Date.parse(event.image_generation_started_at) < 130_000) return json(request, { status: "generating" }, 202)
    const key = Deno.env.get("FAL_API_KEY")?.trim()
    if (!key) throw new HttpError(503, "Event image creation is not configured for this workspace.")
    const startedAt = new Date().toISOString()
    let claim = admin.from("company_events")
      .update({ image_generation_status: "generating", image_generation_started_at: startedAt })
      .eq("id", event.id).eq("company_id", current.Company_ID).eq("image_generation_status", event.image_generation_status).is("image_path", null)
    claim = event.image_generation_started_at ? claim.eq("image_generation_started_at", event.image_generation_started_at) : claim.is("image_generation_started_at", null)
    const { data: claimed, error: claimError } = await claim.select("id").maybeSingle()
    if (claimError) throw new HttpError(503, "The event image could not be started. Try again.")
    if (!claimed) return json(request, { status: "generating" }, 202)
    const path = `${user.id}/${crypto.randomUUID()}.webp`
    EdgeRuntime.waitUntil(createCover(admin, event.id, current.Company_ID, current.User_ID, path, startedAt,
      { title: event.title, location: event.location, details: event.details, startsAt: event.starts_at }, key))
    return json(request, { status: "generating" }, 202)
  } catch (error) { return failure(request, error) }
})
