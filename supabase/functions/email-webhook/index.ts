import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import {
  cleanString,
  constantTimeEqual,
  decodePubSubData,
  getSecret,
  isPlainObject,
  isWebhookProvider,
  microsoftDedupeKey,
  microsoftProviderEventId,
  parseResolvedSubscription,
  resourceMatches,
  verifyGooglePushJwt,
  type ResolvedSubscription,
  type WebhookProvider,
} from "./core.ts"

type JsonObject = Record<string, unknown>
type AdminClient = ReturnType<typeof createClient<any, "public", any>>

type ProviderConnectionRow = {
  CommConn_ID: string
  CommConn_ProviderTypeCode: string
  CommConn_ProviderTenantID: string | null
}

type MailboxRow = {
  CommMailbox_ID: string
  CommMailbox_ConnectionID: string
  CommMailbox_NormalizedAddress: string
}

const MAX_BODY_BYTES = 128 * 1024

function json(body: JsonObject, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

function failure(code: string, status: number) {
  const messages: Record<string, string> = {
    provider_required: "A supported email provider is required.",
    request_too_large: "The notification is too large.",
    notification_invalid: "The provider notification is invalid.",
    webhook_unauthorized: "The provider notification could not be verified.",
    subscription_not_found: "The provider subscription is not active for this workspace.",
    subscription_mismatch: "The provider notification did not match its mailbox subscription.",
    webhook_configuration_missing: "Email notifications are not configured for this workspace.",
    enqueue_failed: "The notification could not be queued.",
    method_not_allowed: "Method not allowed.",
  }
  return json({ code, message: messages[code] ?? messages.notification_invalid }, status)
}

function runtime() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim() ?? ""
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? ""
  if (!supabaseUrl || !serviceRoleKey) throw new Error("webhook_configuration_missing")
  return { supabaseUrl, serviceRoleKey }
}

async function readBody(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) throw new Error("request_too_large")
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw new Error("request_too_large")
  let body: unknown
  try {
    body = JSON.parse(raw || "null")
  } catch {
    throw new Error("notification_invalid")
  }
  if (!isPlainObject(body)) throw new Error("notification_invalid")
  return body
}

function providerType(provider: WebhookProvider) {
  return provider === "gmail" ? "google_workspace" : "microsoft_365"
}

async function resolveSubscription(
  adminClient: AdminClient,
  providerSubscriptionId: string | null,
  providerResource: string | null,
) {
  const { data, error } = await adminClient.rpc("comm_resolve_email_provider_subscription", {
    p_provider_subscription_id: providerSubscriptionId,
    p_provider_resource: providerResource,
  })
  const subscription = parseResolvedSubscription(data)
  if (error || !subscription) throw new Error("subscription_not_found")
  return subscription
}

async function assertConnectionAndMailbox(
  adminClient: AdminClient,
  subscription: ResolvedSubscription,
  provider: WebhookProvider,
  mailboxAddress?: string,
) {
  const { data: connection, error: connectionError } = await adminClient
    .from("Comm_ProviderConnections")
    .select("CommConn_ID,CommConn_ProviderTypeCode,CommConn_ProviderTenantID")
    .eq("CommConn_ID", subscription.connectionId)
    .eq("CommConn_ProviderTypeCode", providerType(provider))
    .eq("CommConn_IsDeleted", false)
    .eq("CommConn_InboundEnabled", true)
    .maybeSingle<ProviderConnectionRow>()
  if (connectionError || !connection) throw new Error("subscription_mismatch")

  let mailbox: MailboxRow | null = null
  if (subscription.mailboxId) {
    let query = adminClient
      .from("Comm_Mailboxes")
      .select("CommMailbox_ID,CommMailbox_ConnectionID,CommMailbox_NormalizedAddress")
      .eq("CommMailbox_ID", subscription.mailboxId)
      .eq("CommMailbox_ConnectionID", subscription.connectionId)
      .eq("CommMailbox_IsDeleted", false)
      .eq("CommMailbox_InboundEnabled", true)
    if (mailboxAddress) query = query.eq("CommMailbox_NormalizedAddress", mailboxAddress.toLowerCase())
    const result = await query.maybeSingle<MailboxRow>()
    if (result.error || !result.data) throw new Error("subscription_mismatch")
    mailbox = result.data
  } else if (mailboxAddress) {
    throw new Error("subscription_mismatch")
  }

  return { connection, mailbox }
}

async function enqueue(
  adminClient: AdminClient,
  subscription: ResolvedSubscription,
  providerEventId: string | null,
  providerMessageId: string | null,
  dedupeKey: string,
  payload: JsonObject,
) {
  const { data, error } = await adminClient.rpc("comm_enqueue_email_inbound_event", {
    p_connection_id: subscription.connectionId,
    p_mailbox_id: subscription.mailboxId,
    p_provider_event_id: providerEventId,
    p_provider_message_id: providerMessageId,
    p_dedupe_key: dedupeKey,
    p_payload: payload,
    p_received_at: new Date().toISOString(),
  })
  const eventId = cleanString(Array.isArray(data) ? data[0] : data, 80)
  if (error || !eventId) throw new Error("enqueue_failed")
  return eventId
}

async function handleGmail(
  request: Request,
  adminClient: AdminClient,
  body: JsonObject,
) {
  const expectedAudience = Deno.env.get("GMAIL_PUBSUB_PUSH_AUDIENCE")?.trim() ?? ""
  const expectedServiceAccount = Deno.env.get("GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT")?.trim() ?? ""
  const expectedSubscription = Deno.env.get("GMAIL_PUBSUB_SUBSCRIPTION")?.trim() ?? ""
  if (!expectedAudience || !expectedServiceAccount || !expectedSubscription) {
    throw new Error("webhook_configuration_missing")
  }
  await verifyGooglePushJwt(
    request.headers.get("Authorization")?.trim() ?? "",
    expectedAudience,
    expectedServiceAccount,
  )

  const subscriptionName = cleanString(body.subscription, 500)
  const message = isPlainObject(body.message) ? body.message : null
  if (subscriptionName !== expectedSubscription || !message) throw new Error("subscription_mismatch")
  const messageId = cleanString(message.messageId ?? message.message_id, 240)
  const publishTime = cleanString(message.publishTime ?? message.publish_time, 80)
  const notification = decodePubSubData(message.data)
  const emailAddress = cleanString(notification.emailAddress, 320).toLowerCase()
  const historyId = cleanString(notification.historyId, 240)
  if (!messageId || !emailAddress || !historyId) throw new Error("notification_invalid")

  const subscription = await resolveSubscription(adminClient, subscriptionName, emailAddress)
  await assertConnectionAndMailbox(adminClient, subscription, "gmail", emailAddress)
  const eventId = await enqueue(
    adminClient,
    subscription,
    messageId,
    historyId,
    `gmail:${messageId}`,
    {
      version: 1,
      provider: "gmail",
      kind: "history_available",
      emailAddress,
      historyId,
      publishTime: publishTime || null,
      subscription: subscriptionName,
    },
  )
  return json({ accepted: true, eventId }, 202)
}

async function handleOutlook(
  adminClient: AdminClient,
  body: JsonObject,
) {
  if (!Array.isArray(body.value) || body.value.length === 0 || body.value.length > 100) {
    throw new Error("notification_invalid")
  }
  const secretRpc = async (functionName: string, parameters: Record<string, unknown>) => {
    const { data, error } = await adminClient.rpc(functionName, parameters)
    return { data, error }
  }
  const eventIds: string[] = []

  for (const rawNotification of body.value) {
    if (!isPlainObject(rawNotification)) throw new Error("notification_invalid")
    const providerSubscriptionId = cleanString(rawNotification.subscriptionId, 320)
    const resource = cleanString(rawNotification.resource, 500)
    const clientState = cleanString(rawNotification.clientState, 1_000)
    const changeType = cleanString(rawNotification.changeType, 80)
    const tenantId = cleanString(rawNotification.tenantId, 180)
    const lifecycleEvent = cleanString(rawNotification.lifecycleEvent, 80)
    if (!providerSubscriptionId || !resource || !clientState || (!changeType && !lifecycleEvent)) {
      throw new Error("notification_invalid")
    }

    const subscription = await resolveSubscription(adminClient, providerSubscriptionId, null)
    if (!resourceMatches(subscription.providerResource, resource) || !subscription.clientStateSecretRef) {
      throw new Error("subscription_mismatch")
    }
    const expectedClientState = await getSecret(secretRpc, subscription.clientStateSecretRef)
    if (!await constantTimeEqual(clientState, expectedClientState)) throw new Error("webhook_unauthorized")

    const { connection } = await assertConnectionAndMailbox(adminClient, subscription, "outlook")
    if (connection.CommConn_ProviderTenantID && connection.CommConn_ProviderTenantID !== tenantId) {
      throw new Error("subscription_mismatch")
    }

    const resourceData = isPlainObject(rawNotification.resourceData) ? rawNotification.resourceData : {}
    const providerMessageId = cleanString(resourceData.id, 240) || null
    const providerEventId = microsoftProviderEventId(rawNotification)
    const dedupeKey = await microsoftDedupeKey(rawNotification)
    const eventId = await enqueue(
      adminClient,
      subscription,
      providerEventId,
      providerMessageId,
      dedupeKey,
      {
        version: 1,
        provider: "outlook",
        kind: lifecycleEvent ? "subscription_lifecycle" : "message_changed",
        subscriptionId: providerSubscriptionId,
        changeType: changeType || null,
        lifecycleEvent: lifecycleEvent || null,
        resource,
        resourceDataId: providerMessageId,
        tenantId: tenantId || null,
        notificationHash: await microsoftDedupeKey(rawNotification),
      },
    )
    eventIds.push(eventId)
  }

  return json({ accepted: true, eventIds }, 202)
}

Deno.serve(async (request) => {
  const url = new URL(request.url)
  const provider = url.searchParams.get("provider")
  if (!isWebhookProvider(provider)) return failure("provider_required", 400)

  const validationToken = url.searchParams.get("validationToken")
  if (provider === "outlook" && validationToken !== null) {
    if (request.method !== "POST") return failure("method_not_allowed", 405)
    if (!validationToken || validationToken.length > 1_024 || /[\u0000-\u001f\u007f]/.test(validationToken)) {
      return failure("notification_invalid", 400)
    }
    return new Response(validationToken, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    })
  }
  if (request.method !== "POST") return failure("method_not_allowed", 405)

  let configuration: ReturnType<typeof runtime>
  let body: JsonObject
  try {
    configuration = runtime()
    body = await readBody(request)
  } catch (error) {
    const code = error instanceof Error ? error.message : "notification_invalid"
    return failure(code, code === "request_too_large" ? 413 : code === "webhook_configuration_missing" ? 503 : 400)
  }

  const adminClient = createClient(configuration.supabaseUrl, configuration.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  try {
    return provider === "gmail"
      ? await handleGmail(request, adminClient, body)
      : await handleOutlook(adminClient, body)
  } catch (error) {
    const code = error instanceof Error ? error.message : "notification_invalid"
    const status = code === "webhook_unauthorized"
      ? 401
      : code === "subscription_not_found"
      ? 404
      : code === "webhook_configuration_missing" || code === "enqueue_failed"
      ? 503
      : 400
    return failure(code, status)
  }
})
