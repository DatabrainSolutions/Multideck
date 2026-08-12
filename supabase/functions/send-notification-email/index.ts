import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import { normaliseLocale, renderBrandedEmail, safeMultideckUrl } from "../_shared/email-template.ts"
import { MULTIDECK_EMAIL_FROM, MULTIDECK_EMAIL_REPLY_TO } from "../_shared/email-sender.ts"

type NotificationRow = {
  CommNotif_ID: string
  CommNotif_UserID: string
  CommNotif_Title: string
  CommNotif_Body: string
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

async function sendWithResend(to: string, subject: string, html: string, text: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MULTIDECK_EMAIL_FROM,
      reply_to: MULTIDECK_EMAIL_REPLY_TO,
      to: [to],
      subject,
      html,
      text,
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
    const requestBody = await request.json() as { action?: string; notificationId?: string; locale?: string }
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
        .select("User_ID,User_Email,Auth_User_ID")
        .eq("Auth_User_ID", authData.user.id)
        .single()
      : { data: null, error: null }
    if (!isServiceRequest && !isDatabaseWebhook && (currentWorkspaceError || !currentWorkspaceUser)) {
      return json({ error: "Workspace profile not found" }, 403)
    }

    const locale = normaliseLocale(requestBody.locale ?? authData.user?.user_metadata?.preferred_language)

    if (requestBody.action === "test") {
      if (!authData.user || !currentWorkspaceUser) return json({ error: "A user session is required for test emails" }, 403)
      const subject = "Your Multideck emails are ready"
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
      })
      const delivery = await sendWithResend(currentWorkspaceUser.User_Email ?? authData.user.email, subject, rendered.html, rendered.text)
      return json({ delivered: true, id: delivery.id ?? null })
    }

    if (requestBody.action !== "dispatch" || !requestBody.notificationId) {
      return json({ error: "Unsupported notification request" }, 400)
    }

    const { data: notification, error: notificationError } = await adminClient
      .from("Comm_Notifications")
      .select("CommNotif_ID,CommNotif_UserID,CommNotif_Title,CommNotif_Body,CommNotif_MetadataJSON")
      .eq("CommNotif_ID", requestBody.notificationId)
      .single<NotificationRow>()
    if (notificationError || !notification) return json({ error: "Notification not found" }, 404)
    if (!isServiceRequest && !isDatabaseWebhook && notification.CommNotif_UserID !== currentWorkspaceUser?.User_ID) {
      return json({ error: "Notification access denied" }, 403)
    }

    const { data: recipient, error: recipientError } = await adminClient
      .from("cmp_Users")
      .select("User_ID,User_Email,Auth_User_ID")
      .eq("User_ID", notification.CommNotif_UserID)
      .single()
    if (recipientError || !recipient?.User_Email) return json({ error: "Notification recipient not found" }, 404)

    const metadata = notification.CommNotif_MetadataJSON ?? {}
    const eventType = String(metadata.event_type ?? "product_updates")
    const { data: preference } = await adminClient
      .from("Comm_UserNotificationPreferences")
      .select("CommNotifPref_IsEnabled")
      .eq("CommNotifPref_UserID", recipient.User_ID)
      .eq("CommNotifPref_ChannelCode", "email")
      .eq("CommNotifPref_EventType", eventType)
      .maybeSingle()

    // Watch email is explicitly opt-in. A missing preference (for example on a
    // newly provisioned user) must not silently turn a high-volume channel on.
    if (
      preference?.CommNotifPref_IsEnabled === false ||
      (eventType === "dexter_watch" && preference?.CommNotifPref_IsEnabled !== true)
    ) return json({ delivered: false, skipped: "preference_disabled" })

    const actionUrl = safeMultideckUrl(metadata.action_url)
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
    })
    const delivery = await sendWithResend(
      recipient.User_Email,
      notification.CommNotif_Title,
      rendered.html,
      rendered.text,
    )

    await adminClient
      .from("Comm_Notifications")
      .update({
        CommNotif_MetadataJSON: {
          ...metadata,
          email_delivery: {
            delivered_at: new Date().toISOString(),
            resend_id: delivery.id ?? null,
          },
        },
      })
      .eq("CommNotif_ID", notification.CommNotif_ID)

    return json({ delivered: true, id: delivery.id ?? null })
  } catch (error) {
    console.error("Notification email delivery failed", error)
    return json({ error: "Email delivery failed" }, 500)
  }
})
