import { Webhook } from "npm:standardwebhooks@1.0.0"
import { normaliseLocale, renderBrandedEmail, safeMultideckUrl } from "../_shared/email-template.ts"
import { MULTIDECK_EMAIL_FROM, MULTIDECK_EMAIL_REPLY_TO } from "../_shared/email-sender.ts"
import { createInvitationTicket, parseInvitationExpiry, type InvitationExpiry } from "../_shared/invitation-ticket.ts"

type AuthEmailData = {
  token?: string
  token_hash?: string
  redirect_to?: string
  email_action_type?: string
  site_url?: string
}

type AuthHookPayload = {
  user: {
    id?: string
    email?: string
    user_metadata?: Record<string, unknown>
  }
  email_data: AuthEmailData
}

type Copy = {
  subject: string
  title: string
  body: string[]
  buttonLabel?: string
  eyebrow: string
  footer: string
}

const translations: Record<string, Record<"en", Copy>> = {
  recovery: {
    en: { subject: "Reset your Multideck password", title: "Reset your password", body: ["We received a request to reset the password for your Multideck workspace.", "Use the secure link below to choose a new password."], buttonLabel: "Choose a new password", eyebrow: "Account recovery", footer: "If you did not request this, you can safely ignore this email." },

  },
  invite: {
    en: { subject: "Your Multideck workspace is ready", title: "You’re invited to Multideck", body: ["Your workspace administrator has created your private Multideck account.", "Accept the invitation below, then create your password to enter the workspace."], buttonLabel: "Accept invitation", eyebrow: "Workspace invitation", footer: "This invitation is only for the email address it was sent to." },

  },
  magiclink: {
    en: { subject: "Sign in to Multideck", title: "Your secure sign-in link", body: ["Use the link below or enter the six-digit code in Multideck.", "The link can only be used once and expires shortly."], buttonLabel: "Sign in securely", eyebrow: "Private workspace access", footer: "If you did not request this sign-in, you can ignore this email." },

  },
  signup: {
    en: { subject: "Confirm your Multideck email", title: "Confirm your email address", body: ["Confirm this email address to complete access to your administrator-created Multideck account."], buttonLabel: "Confirm email", eyebrow: "Email verification", footer: "Multideck is invite-only. No account is created from this email alone." },

  },
  email_change: {
    en: { subject: "Confirm your new Multideck email", title: "Confirm your new email address", body: ["A request was made to change the email address connected to your Multideck account.", "Confirm the new address using the secure link below."], buttonLabel: "Confirm new email", eyebrow: "Account security", footer: "If you did not request this change, contact your workspace administrator immediately." },

  },
  reauthentication: {
    en: { subject: "Confirm this Multideck action", title: "Confirm it’s you", body: ["Use this one-time code to continue the sensitive account action you started in Multideck."], eyebrow: "Security check", footer: "Never share this code. Multideck support will not ask you for it." },

  },
}

const securityCopy: Record<string, { subject: string; title: string; body: string }> = {
  password_changed_notification: { subject: "Your Multideck password changed", title: "Password changed", body: "The password for your Multideck account was changed." },
  email_changed_notification: { subject: "Your Multideck email changed", title: "Email address changed", body: "The email address used by your Multideck account was changed." },
  phone_changed_notification: { subject: "Your Multideck phone changed", title: "Phone number changed", body: "The phone number connected to your Multideck account was changed." },
  identity_linked_notification: { subject: "A sign-in method was connected", title: "Sign-in method connected", body: "A new identity was connected to your Multideck account." },
  identity_unlinked_notification: { subject: "A sign-in method was removed", title: "Sign-in method removed", body: "An identity was removed from your Multideck account." },
  mfa_factor_enrolled_notification: { subject: "A security factor was added", title: "Security factor added", body: "A new multi-factor authentication method was added to your Multideck account." },
  mfa_factor_unenrolled_notification: { subject: "A security factor was removed", title: "Security factor removed", body: "A multi-factor authentication method was removed from your Multideck account." },
}

function invitationExpirySentence(locale: "en", expiry: InvitationExpiry) {
  const duration = {
    en: { "3d": "three days", "7d": "seven days", "30d": "30 days" },

  } as const
  if (expiry === "never") {
    return {
      en: "The link stays valid until you create your password, even if your email security system checks it first.",

    }[locale]
  }
  return {
    en: `The link stays valid for ${duration.en[expiry]} until you create your password, even if your email security system checks it first.`,

  }[locale]
}

async function verificationUrl(emailData: AuthEmailData, useInvitationTicket = false, userId?: string, expiry: InvitationExpiry = "7d") {
  const projectUrl = Deno.env.get("SUPABASE_URL") ?? ""
  const actionType = emailData.email_action_type ?? "magiclink"
  const redirectTo = safeMultideckUrl(emailData.redirect_to ?? emailData.site_url)
  const tokenHash = emailData.token_hash ?? ""

  // This ticket is not consumed when a mail scanner opens the link. It remains
  // valid until the recipient actually saves a password or its chosen expiry.
  if (useInvitationTicket) {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    if (!userId || !serviceRoleKey) throw new Error("Invitation ticket configuration is missing")
    const confirmationUrl = new URL(redirectTo)
    confirmationUrl.searchParams.set("ticket", await createInvitationTicket(userId, serviceRoleKey, expiry))
    return confirmationUrl.toString()
  }

  return `${projectUrl}/auth/v1/verify?token=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(actionType)}&redirect_to=${encodeURIComponent(redirectTo)}`
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
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 })

  try {
    const secret = Deno.env.get("SEND_EMAIL_HOOK_SECRET")?.replace(/^v1,whsec_/, "")
    if (!secret) throw new Error("SEND_EMAIL_HOOK_SECRET is not configured")

    const body = await request.text()
    const payload = new Webhook(secret).verify(body, Object.fromEntries(request.headers)) as AuthHookPayload
    const email = payload.user.email?.trim().toLowerCase()
    if (!email) throw new Error("Auth hook payload did not contain an email")

    const locale = normaliseLocale(
      payload.user.user_metadata?.preferred_language
      ?? payload.user.user_metadata?.language
      ?? payload.user.user_metadata?.locale,
    )
    const actionType = payload.email_data.email_action_type ?? "magiclink"
    const security = securityCopy[actionType]

    if (security) {
      const rendered = renderBrandedEmail({
        subject: security.subject,
        preview: security.body,
        title: security.title,
        body: [security.body, "If this was not you, contact your workspace administrator immediately."],
        eyebrow: "Security notice",
        footer: "Security notices cannot be disabled.",
        locale,
      })
      await sendWithResend(email, security.subject, rendered.html, rendered.text)
      return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } })
    }

    const inviteRecovery = actionType === "recovery"
      && safeMultideckUrl(payload.email_data.redirect_to ?? payload.email_data.site_url).includes("mode=invite")
    const key = inviteRecovery ? "invite" : translations[actionType] ? actionType : "magiclink"
    const copy = translations[key][locale]
    const invitationExpiry = parseInvitationExpiry(payload.user.user_metadata?.multideck_invitation_expiry)
    const rendered = renderBrandedEmail({
      subject: copy.subject,
      preview: copy.body[0],
      title: copy.title,
      body: key === "invite" ? [...copy.body, invitationExpirySentence(locale, invitationExpiry)] : copy.body,
      buttonLabel: copy.buttonLabel,
      buttonUrl: await verificationUrl(payload.email_data, key === "invite", payload.user.id, invitationExpiry),
      code: key === "magiclink" ? payload.email_data.token : undefined,
      eyebrow: copy.eyebrow,
      footer: copy.footer,
      locale,
    })

    await sendWithResend(email, copy.subject, rendered.html, rendered.text)
    return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } })
  } catch (error) {
    console.error("Auth email delivery failed", error)
    return new Response(JSON.stringify({ error: "Email delivery failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
