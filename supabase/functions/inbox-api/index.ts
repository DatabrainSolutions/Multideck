import {
  InboxHttpError,
  assertAllowedRequestOrigin,
  corsHeaders,
  jsonResponse,
  parseFunctionPath,
  problemResponse,
  readAllowedOrigins,
  readJson,
  safeFileName,
} from "./core.ts"
import {
  attachment,
  addGroupMailbox,
  addSharedMailbox,
  aiContextSources,
  authorize,
  connections,
  deleteDraft,
  disconnect,
  getThread,
  inboxWorkspace,
  listMailboxes,
  listThreads,
  providers,
  requireActor,
  runtimeClients,
  saveDraft,
  sendMail,
  summarize,
  syncMailbox,
  trashThread,
  updateThreadState,
} from "./runtime.ts"

const allowedOrigins = readAllowedOrigins({
  EMAIL_ALLOWED_REDIRECT_ORIGINS: Deno.env.get("EMAIL_ALLOWED_REDIRECT_ORIGINS"),
  EMAIL_CANONICAL_APP_ORIGIN: Deno.env.get("EMAIL_CANONICAL_APP_ORIGIN"),
  APP_URL: Deno.env.get("APP_URL"),
})

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    const origin = request.headers.get("Origin")?.trim() ?? ""
    return new Response(null, {
      status: allowedOrigins.has(origin) ? 204 : 403,
      headers: corsHeaders(request, allowedOrigins),
    })
  }

  try {
    assertAllowedRequestOrigin(request, allowedOrigins)
    const authorization = request.headers.get("Authorization")?.trim() ?? ""
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      throw new InboxHttpError(401, "Sign in again to open the inbox.", "authentication_required")
    }
    const clients = runtimeClients(authorization)
    const actor = await requireActor(clients.user, clients.admin)
    const path = parseFunctionPath(request.url)
    const method = request.method.toUpperCase()

    if (method === "GET" && path.length === 1 && path[0] === "providers") {
      return jsonResponse(request, allowedOrigins, await providers())
    }
    if (method === "GET" && path.length === 1 && path[0] === "connections") {
      return jsonResponse(request, allowedOrigins, await connections(clients.admin, actor))
    }
    if (method === "GET" && path.length === 1 && path[0] === "workspace") {
      return jsonResponse(request, allowedOrigins, await inboxWorkspace(clients.admin, actor))
    }
    if (method === "POST" && path.length === 3 && path[0] === "connections" && path[2] === "authorize") {
      const body = await readJson(request)
      if (body.provider && body.provider !== path[1]) throw new InboxHttpError(400, "The email provider does not match the request path.", "provider_invalid")
      return jsonResponse(
        request,
        allowedOrigins,
        await authorize(clients.user, request, path[1], clients.url, clients.anon, body.accessMode, body.returnPath),
      )
    }
    if (method === "DELETE" && path.length === 2 && path[0] === "connections") {
      await disconnect(clients.admin, actor, path[1])
      return jsonResponse(request, allowedOrigins, null, 204)
    }
    if (method === "POST" && path.length === 3 && path[0] === "connections" && path[2] === "shared-mailboxes") {
      return jsonResponse(request, allowedOrigins, await addSharedMailbox(clients.admin, actor, path[1], await readJson(request)))
    }
    if (method === "POST" && path.length === 3 && path[0] === "connections" && path[2] === "group-mailboxes") {
      return jsonResponse(request, allowedOrigins, await addGroupMailbox(clients.admin, actor, path[1], await readJson(request)))
    }
    if (method === "GET" && path.length === 1 && path[0] === "mailboxes") {
      return jsonResponse(request, allowedOrigins, await listMailboxes(clients.admin, actor))
    }
    if (method === "GET" && path.length === 1 && path[0] === "ai-context-sources") {
      return jsonResponse(request, allowedOrigins, await aiContextSources(clients.admin, actor))
    }
    if (method === "POST" && path.length === 3 && path[0] === "mailboxes" && path[2] === "sync") {
      return jsonResponse(request, allowedOrigins, await syncMailbox(clients.admin, actor, path[1]))
    }
    if (method === "GET" && path.length === 1 && path[0] === "threads") {
      return jsonResponse(request, allowedOrigins, await listThreads(clients.admin, actor, new URL(request.url)))
    }
    if (method === "GET" && path.length === 2 && path[0] === "threads") {
      return jsonResponse(request, allowedOrigins, await getThread(clients.admin, actor, path[1]))
    }
    if (method === "PATCH" && path.length === 3 && path[0] === "threads" && path[2] === "read-state") {
      return jsonResponse(request, allowedOrigins, await updateThreadState(clients.admin, actor, path[1], await readJson(request)))
    }
    if (method === "POST" && path.length === 3 && path[0] === "threads" && path[2] === "trash") {
      return jsonResponse(request, allowedOrigins, await trashThread(clients.admin, actor, path[1]))
    }
    if (method === "POST" && path.length === 3 && path[0] === "threads" && path[2] === "summary") {
      return jsonResponse(request, allowedOrigins, await summarize(clients.admin, actor, path[1]))
    }
    if (method === "POST" && path.length === 1 && path[0] === "drafts") {
      return jsonResponse(request, allowedOrigins, await saveDraft(clients.admin, actor, await readJson(request)))
    }
    if (method === "PATCH" && path.length === 2 && path[0] === "drafts") {
      return jsonResponse(request, allowedOrigins, await saveDraft(clients.admin, actor, await readJson(request), path[1]))
    }
    if (method === "DELETE" && path.length === 2 && path[0] === "drafts") {
      await deleteDraft(clients.admin, actor, path[1])
      return jsonResponse(request, allowedOrigins, null, 204)
    }
    if (method === "POST" && path.length === 1 && path[0] === "send") {
      // Headroom for the body plus base64'd attachments, which inflate by a
      // third. `readOutboundAttachments` still holds the real per-file and
      // total limits; this only keeps a legitimate send from being cut off here.
      return jsonResponse(request, allowedOrigins, await sendMail(clients.admin, actor, await readJson(request, 24_000_000), request.headers.get("Idempotency-Key")?.trim() ?? ""))
    }
    if (method === "GET" && path.length === 2 && path[0] === "attachments") {
      const inline = new URL(request.url).searchParams.get("disposition") === "inline"
      const download = await attachment(clients.admin, actor, path[1], inline)
      const attachmentBuffer = new ArrayBuffer(download.bytes.byteLength)
      new Uint8Array(attachmentBuffer).set(download.bytes)
      return new Response(attachmentBuffer, {
        status: 200,
        headers: {
          ...corsHeaders(request, allowedOrigins),
          "Cache-Control": "private, no-store",
          "Content-Type": download.mimeType,
          "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(safeFileName(download.fileName))}`,
          "Content-Length": String(download.bytes.byteLength),
          "X-Content-Type-Options": "nosniff",
          "X-Content-Safety": "unscanned-provider-content",
        },
      })
    }

    throw new InboxHttpError(404, "This inbox route was not found.", "route_not_found")
  } catch (error) {
    if (!(error instanceof InboxHttpError)) console.error("inbox-api unhandled error", error)
    return problemResponse(request, allowedOrigins, error)
  }
})
