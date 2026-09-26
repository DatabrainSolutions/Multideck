import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import { normaliseLocale, renderBrandedEmail } from "../_shared/email-template.ts"
import { MULTIDECK_EMAIL_FROM, MULTIDECK_EMAIL_REPLY_TO } from "../_shared/email-sender.ts"
import { readConfiguredTenantBrand } from "../_shared/tenant-branding.ts"
import { isUuid, prepareCompanyEventInvitation, type EmailAttachment } from "./company-event-invitation.ts"

type NotificationRow = {
  CommNotif_ID: string
  CommNotif_UserID: string
  CommNotif_Title: string
  CommNotif_Body: string
  CommNotif_TargetTable: string | null
  CommNotif_TargetID: string | null
  CommNotif_MetadataJSON: Record<string, unknown> | null
}

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Origin": "*",
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function secretsMatch(left: string | null, right: string | null) {
  if (!left || !right || left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

async function sendWithResend(to: string, subject: string, html: string, text: string, idempotencyKey?: string, attachments: EmailAttachment[] = []) {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      from: MULTIDECK_EMAIL_FROM,
      reply_to: MULTIDECK_EMAIL_REPLY_TO,
      to: [to],
      subject,
      html,
      text,
      ...(attachments.length ? { attachments } : {}),
    }),
  })

  if (!response.ok) throw new Error(`Resend rejected the email (${response.status})`)
  return await response.json() as { id?: string }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Function configuration is incomplete" }, 500)

  try {
    const authorization = request.headers.get("Authorization") ?? ""
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    const requestBody = await request.json() as { action?: string; notificationId?: string; eventId?: string; requestId?: string; locale?: string; branding?: string }
    const bearerToken = authorization.replace(/^Bearer\s+/i, "")
    const isServiceRequest = bearerToken === serviceRoleKey
    const { data: expectedWebhookSecret } = await adminClient.rpc("Comm_GetNotificationWebhookSecret")
    const isDatabaseWebhook = secretsMatch(
      request.headers.get("x-multideck-notification-secret"),
      typeof expectedWebhookSecret === "string" ? expectedWebhookSecret : null,
    )
    const { data: authData, error: authError } = isServiceRequest || isDatabaseWebhook
      ? { data: { user: null }, error: null }
      : await userClient.auth.getUser()
    if (!isServiceRequest && !isDatabaseWebhook && (authError || !authData.user)) {
      return json({ error: "Authentication required" }, 401)
    }

    const { data: currentWorkspaceUser, error: currentWorkspaceError } = authData.user
      ? await adminClient
        .from("cmp_Users")
        .select("User_ID,User_Email,Auth_User_ID,Company_ID")
        .eq("Auth_User_ID", authData.user.id)
        .single()
      : { data: null, error: null }
    if (!isServiceRequest && !isDatabaseWebhook && (currentWorkspaceError || !currentWorkspaceUser)) {
      return json({ error: "Workspace profile not found" }, 403)
    }

    const locale = normaliseLocale(requestBody.locale ?? authData.user?.user_metadata?.preferred_language)

    if (requestBody.action === "test") {
      if (!authData.user || !currentWorkspaceUser) return json({ error: "A user session is required for test emails" }, 403)
      const brand = await readConfiguredTenantBrand(adminClient, currentWorkspaceUser.Company_ID)
      const subject = "Your branded notification emails are ready"
      const rendered = renderBrandedEmail({
        subject,
        preview: "Branded workspace email delivery is connected.",
        title: "Email delivery is connected",
        body: [
          "This test confirms that your Multideck workspace can send branded email notifications securely through Resend.",
          "Your saved notification preferences decide which operational updates arrive by email.",
        ],
        buttonLabel: "Review notification settings",
        buttonUrl: `${Deno.env.get("APP_URL") ?? "https://dev.multideck.app"}/settings?tab=notifications`,
        eyebrow: "Delivery test",
        footer: "Account security notices are always sent and cannot be disabled.",
        locale,
        brand,
      })
      const delivery = await sendWithResend(currentWorkspaceUser.User_Email ?? authData.user.email, subject, rendered.html, rendered.text)
      return json({ delivered: true, id: delivery.id ?? null })
    }

    // Renders an event's invitation to the signed-in colleague's own mailbox
    // only, labelled Test. It never reads a recipient from the request, never
    // creates notifications and never reaches the event's guest list.
    if (requestBody.action === "event_invitation_test") {
      if (!authData.user || !currentWorkspaceUser?.User_Email) return json({ error: "A user session is required for test emails" }, 403)
      if (!isUuid(requestBody.eventId)) return json({ error: "Choose an event" }, 400)
      if (requestBody.requestId !== undefined && !isUuid(requestBody.requestId)) return json({ error: "The request reference is not valid" }, 400)
      const invitation = await prepareCompanyEventInvitation({
        admin: adminClient,
        eventId: requestBody.eventId,
        userId: currentWorkspaceUser.User_ID,
        purpose: "test",
        appUrl: Deno.env.get("APP_URL"),
        tenantHost: Deno.env.get("MULTIDECK_TENANT_HOST"),
        locale: requestBody.locale,
        testBranding: requestBody.branding === "multideck" ? "multideck" : undefined,
      })
      if ("skipped" in invitation) return json({ error: "This event is not available" }, 404)
      const delivery = await sendWithResend(
        currentWorkspaceUser.User_Email,
        invitation.message.subject,
        invitation.message.html,
        invitation.message.text,
        // A retried request is one email: the caller's requestId when given,
        // otherwise repeated clicks within the same minute.
        `event-invitation-test/${invitation.context.id}/${currentWorkspaceUser.User_ID}/${requestBody.requestId?.toLowerCase() ?? `${invitation.context.editVersion}-${Math.floor(Date.now() / 60_000)}`}`,
        invitation.message.attachments,
      )
      const { error: auditError } = await adminClient.from("company_event_audit").insert({
        company_id: invitation.context.companyId,
        event_id: invitation.context.id,
        actor_id: currentWorkspaceUser.User_ID,
        kind: "invitation_test_emailed",
        details: { recipient: "self", requestId: requestBody.requestId ?? null, resendId: delivery.id ?? null, editVersion: invitation.context.editVersion, cover: invitation.message.receipt.cover },
      })
      if (auditError) throw new Error("The test invitation email could not be recorded")
      return json({ delivered: true, id: delivery.id ?? null })
    }

    if (requestBody.action !== "dispatch" || !requestBody.notificationId) {
      return json({ error: "Unsupported notification request" }, 400)
    }

    const { data: notification, error: notificationError } = await adminClient
      .from("Comm_Notifications")
      .select("CommNotif_ID,CommNotif_UserID,CommNotif_Title,CommNotif_Body,CommNotif_MetadataJSON,CommNotif_TargetTable,CommNotif_TargetID")
      .eq("CommNotif_ID", requestBody.notificationId)
      .single<NotificationRow>()
    if (notificationError || !notification) return json({ error: "Notification not found" }, 404)
    if (!isServiceRequest && !isDatabaseWebhook) {
      return json({ error: "Notification access denied" }, 403)
    }

    const { data: recipient, error: recipientError } = await adminClient
      .from("cmp_Users")
      .select("User_ID,User_Email,Auth_User_ID,Company_ID")
      .eq("User_ID", notification.CommNotif_UserID)
      .single()
    if (recipientError || !recipient?.User_Email) return json({ error: "Notification recipient not found" }, 404)

    const metadata = notification.CommNotif_MetadataJSON ?? {}
    if (metadata.in_app_only === true) {
      return json({ delivered: false, skipped: "in_app_only" })
    }
    const previousDelivery = metadata.email_delivery as { resend_id?: string } | undefined
    if (previousDelivery?.resend_id) return json({ delivered: true, id: previousDelivery.resend_id, skipped: "already_accepted" })
    const eventType = String(metadata.event_type ?? (metadata.suggestion_id ? "document_parse" : "product_updates"))
    const { data: preference, error: preferenceError } = await adminClient
      .from("Comm_UserNotificationPreferences")
      .select("CommNotifPref_IsEnabled")
      .eq("CommNotifPref_UserID", recipient.User_ID)
      .eq("CommNotifPref_ChannelCode", "email")
      .eq("CommNotifPref_EventType", eventType)
      .maybeSingle()

    if (preferenceError) throw new Error("Notification preferences could not be checked")

    // Watch email is explicitly opt-in. A missing preference (for example on a
    // newly provisioned user) must not silently turn a high-volume channel on.
    if (
      preference?.CommNotifPref_IsEnabled === false ||
      ((eventType === "dexter_watch" || eventType === "document_parse") && preference?.CommNotifPref_IsEnabled !== true)
    ) return json({ delivered: false, skipped: "preference_disabled" })

    let message: { subject: string; html: string; text: string; attachments?: EmailAttachment[] }
    let receiptDetails: Record<string, unknown> = {}
    if (eventType === "company_event_invitation") {
      // The invitation is re-checked at send time: a colleague removed from the
      // guest list, a cancelled or finished event, or Events switched off since
      // publishing means no email.
      const invitation = notification.CommNotif_TargetTable === "company_events" && notification.CommNotif_TargetID
        ? await prepareCompanyEventInvitation({
          admin: adminClient,
          eventId: notification.CommNotif_TargetID,
          userId: recipient.User_ID,
          purpose: "invitation",
          appUrl: Deno.env.get("APP_URL"),
          tenantHost: Deno.env.get("MULTIDECK_TENANT_HOST"),
        })
        : { skipped: "event_unavailable" as const }
      if ("skipped" in invitation) return json({ delivered: false, skipped: invitation.skipped })
      message = invitation.message
      receiptDetails = invitation.message.receipt
    } else {
      const configuredAppUrl = Deno.env.get("APP_URL")
      if (!configuredAppUrl) throw new Error("Notification application URL is not configured")
      const appOrigin = new URL(configuredAppUrl).origin
      const suggestionId = metadata.suggestion_id ?? (notification.CommNotif_TargetTable === "AI_InboxSuggestedUpdates" ? notification.CommNotif_TargetID : null)
      const recordPath = suggestionId ? `/inbox?view=suggested&suggestion=${encodeURIComponent(String(suggestionId))}`
        : notification.CommNotif_TargetTable === "CRM_Leads" && notification.CommNotif_TargetID ? `/crm/leads/${encodeURIComponent(notification.CommNotif_TargetID)}` : "/app"
      let actionUrl = `${appOrigin}${recordPath}`
      try {
        const candidate = new URL(String(metadata.action_url ?? metadata.url ?? recordPath), appOrigin)
        if (candidate.origin === appOrigin && !candidate.username && !candidate.password) actionUrl = candidate.toString()
      } catch { /* Keep the source record fallback. */ }
      const brand = await readConfiguredTenantBrand(adminClient, recipient.Company_ID)
      const rendered = renderBrandedEmail({
        subject: notification.CommNotif_Title,
        preview: notification.CommNotif_Body,
        title: notification.CommNotif_Title,
        body: [notification.CommNotif_Body],
        buttonLabel: metadata.action_label ? String(metadata.action_label) : "Open in Multideck",
        buttonUrl: actionUrl,
        eyebrow: metadata.eyebrow ? String(metadata.eyebrow) : "Workspace update",
        footer: "You can change operational email preferences in Multideck settings.",
        locale,
        brand,
      })
      message = { subject: notification.CommNotif_Title, html: rendered.html, text: rendered.text }
    }
    const delivery = await sendWithResend(
      recipient.User_Email,
      message.subject,
      message.html,
      message.text,
      `notification/${notification.CommNotif_ID}`,
      message.attachments,
    )

    const { error: receiptError } = await adminClient
      .from("Comm_Notifications")
      .update({
        CommNotif_MetadataJSON: {
          ...metadata,
          email_delivery: {
            accepted_at: new Date().toISOString(),
            resend_id: delivery.id ?? null,
            ...receiptDetails,
          },
        },
      })
      .eq("CommNotif_ID", notification.CommNotif_ID)

    if (receiptError) throw new Error("Notification email acceptance could not be recorded")
    return json({ delivered: true, accepted: true, id: delivery.id ?? null })
  } catch (error) {
    console.error("Notification email delivery failed", error)
    return json({ error: "Email delivery failed" }, 500)
  }
})
