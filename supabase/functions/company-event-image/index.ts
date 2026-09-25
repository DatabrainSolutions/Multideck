import { authenticate, corsHeaders, currentInternalUser, failure, HttpError, json, requirePermission } from "../_shared/backend.ts"
import { eventImageBucket, eventImageLimit, eventImageModel, eventImagePrompt, falImageUrl, isWebp, type ImageBrief } from "./core.ts"

const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const endpoint = `https://queue.fal.run/${eventImageModel}`

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

    const input = await request.json().catch(() => null) as (ImageBrief & { requestId?: string }) | null
    if (!input || typeof input !== "object" || !requestIdPattern.test(input.requestId ?? "")
      || typeof input.title !== "string" || typeof input.location !== "string"
      || (input.details !== undefined && typeof input.details !== "string")
      || (input.startsAt !== undefined && typeof input.startsAt !== "string")) {
      throw new HttpError(400, "Add valid event details before creating the image.")
    }
    if (!input.title.trim() || input.title.length > 160 || !input.location.trim() || input.location.length > 240
      || (input.details?.length ?? 0) > 8000) throw new HttpError(400, "Check the event title, location and details.")
    const path = `${user.id}/${input.requestId}.webp`
    const { data: previous, error: listError } = await admin.storage.from(eventImageBucket)
      .list(user.id, { search: `${input.requestId}.webp`, limit: 1 })
    if (listError) throw new HttpError(503, "Event image storage is unavailable. Try again.")
    if (previous?.some((object) => object.name === `${input.requestId}.webp`)) return json(request, { imagePath: path })

    const key = Deno.env.get("FAL_API_KEY")?.trim()
    if (!key) throw new HttpError(503, "Event image creation is not configured for this workspace.")
    const bytes = await imageBytes(await generateImage(key, input))
    const { error: uploadError } = await admin.storage.from(eventImageBucket).upload(path, bytes, {
      contentType: "image/webp", cacheControl: "3600", upsert: false,
    })
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) {
      throw new HttpError(503, "The event image could not be saved. Try again.")
    }
    return json(request, { imagePath: path })
  } catch (error) { return failure(request, error) }
})
