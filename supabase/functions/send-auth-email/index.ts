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

const translations: Record<string, Record<"en" | "de" | "fr" | "ar", Copy>> = {
  recovery: {
    en: { subject: "Reset your Multideck password", title: "Reset your password", body: ["We received a request to reset the password for your Multideck workspace.", "Use the secure link below to choose a new password."], buttonLabel: "Choose a new password", eyebrow: "Account recovery", footer: "If you did not request this, you can safely ignore this email." },
    de: { subject: "Multideck-Passwort zurücksetzen", title: "Passwort zurücksetzen", body: ["Wir haben eine Anfrage zum Zurücksetzen deines Multideck-Passworts erhalten.", "Über den sicheren Link kannst du ein neues Passwort festlegen."], buttonLabel: "Neues Passwort wählen", eyebrow: "Kontowiederherstellung", footer: "Wenn du dies nicht angefordert hast, kannst du diese E-Mail ignorieren." },
    fr: { subject: "Réinitialisez votre mot de passe Multideck", title: "Réinitialisez votre mot de passe", body: ["Nous avons reçu une demande de réinitialisation du mot de passe de votre espace Multideck.", "Utilisez le lien sécurisé ci-dessous pour choisir un nouveau mot de passe."], buttonLabel: "Choisir un nouveau mot de passe", eyebrow: "Récupération du compte", footer: "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail." },
    ar: { subject: "إعادة تعيين كلمة مرور Multideck", title: "أعد تعيين كلمة المرور", body: ["تلقينا طلبا لإعادة تعيين كلمة مرور مساحة عمل Multideck الخاصة بك.", "استخدم الرابط الآمن أدناه لاختيار كلمة مرور جديدة."], buttonLabel: "اختيار كلمة مرور جديدة", eyebrow: "استعادة الحساب", footer: "إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان." },
  },
  invite: {
    en: { subject: "Your Multideck workspace is ready", title: "You’re invited to Multideck", body: ["Your workspace administrator has created your private Multideck account.", "Accept the invitation below, then create your password to enter the workspace."], buttonLabel: "Accept invitation", eyebrow: "Workspace invitation", footer: "This invitation is only for the email address it was sent to." },
    de: { subject: "Dein Multideck-Arbeitsbereich ist bereit", title: "Du bist zu Multideck eingeladen", body: ["Dein Administrator hat dein privates Multideck-Konto erstellt.", "Nimm die Einladung an und erstelle anschließend dein Passwort."], buttonLabel: "Einladung annehmen", eyebrow: "Workspace-Einladung", footer: "Diese Einladung gilt nur für die Empfängeradresse." },
    fr: { subject: "Votre espace Multideck est prêt", title: "Vous êtes invité sur Multideck", body: ["Votre administrateur a créé votre compte Multideck privé.", "Acceptez l’invitation, puis créez votre mot de passe pour accéder à l’espace."], buttonLabel: "Accepter l’invitation", eyebrow: "Invitation à l’espace", footer: "Cette invitation est réservée à l’adresse qui l’a reçue." },
    ar: { subject: "مساحة Multideck الخاصة بك جاهزة", title: "تمت دعوتك إلى Multideck", body: ["أنشأ مسؤول مساحة العمل حساب Multideck الخاص بك.", "اقبل الدعوة ثم أنشئ كلمة المرور للدخول إلى مساحة العمل."], buttonLabel: "قبول الدعوة", eyebrow: "دعوة مساحة العمل", footer: "هذه الدعوة مخصصة فقط لعنوان البريد الذي استلمها." },
  },
  magiclink: {
    en: { subject: "Sign in to Multideck", title: "Your secure sign-in link", body: ["Use the link below or enter the six-digit code in Multideck.", "The link can only be used once and expires shortly."], buttonLabel: "Sign in securely", eyebrow: "Private workspace access", footer: "If you did not request this sign-in, you can ignore this email." },
    de: { subject: "Bei Multideck anmelden", title: "Dein sicherer Anmeldelink", body: ["Nutze den Link oder gib den sechsstelligen Code in Multideck ein.", "Der Link kann nur einmal verwendet werden und läuft in Kürze ab."], buttonLabel: "Sicher anmelden", eyebrow: "Privater Workspace-Zugang", footer: "Wenn du diese Anmeldung nicht angefordert hast, ignoriere diese E-Mail." },
    fr: { subject: "Connectez-vous à Multideck", title: "Votre lien de connexion sécurisé", body: ["Utilisez le lien ou saisissez le code à six chiffres dans Multideck.", "Le lien est à usage unique et expire rapidement."], buttonLabel: "Se connecter en sécurité", eyebrow: "Accès à l’espace privé", footer: "Si vous n’avez pas demandé cette connexion, ignorez cet e-mail." },
    ar: { subject: "تسجيل الدخول إلى Multideck", title: "رابط تسجيل الدخول الآمن", body: ["استخدم الرابط أدناه أو أدخل الرمز المكون من ستة أرقام في Multideck.", "يمكن استخدام الرابط مرة واحدة فقط وتنتهي صلاحيته قريبا."], buttonLabel: "تسجيل الدخول بأمان", eyebrow: "الوصول إلى مساحة العمل الخاصة", footer: "إذا لم تطلب تسجيل الدخول، فتجاهل هذه الرسالة." },
  },
  signup: {
    en: { subject: "Confirm your Multideck email", title: "Confirm your email address", body: ["Confirm this email address to complete access to your administrator-created Multideck account."], buttonLabel: "Confirm email", eyebrow: "Email verification", footer: "Multideck is invite-only. No account is created from this email alone." },
    de: { subject: "Multideck-E-Mail bestätigen", title: "E-Mail-Adresse bestätigen", body: ["Bestätige diese E-Mail-Adresse, um den Zugang zu deinem vom Administrator erstellten Konto abzuschließen."], buttonLabel: "E-Mail bestätigen", eyebrow: "E-Mail-Bestätigung", footer: "Multideck ist nur auf Einladung zugänglich." },
    fr: { subject: "Confirmez votre e-mail Multideck", title: "Confirmez votre adresse e-mail", body: ["Confirmez cette adresse pour finaliser l’accès au compte créé par votre administrateur."], buttonLabel: "Confirmer l’e-mail", eyebrow: "Vérification de l’e-mail", footer: "Multideck est accessible uniquement sur invitation." },
    ar: { subject: "تأكيد بريد Multideck", title: "أكد عنوان بريدك الإلكتروني", body: ["أكد هذا العنوان لإكمال الوصول إلى حساب Multideck الذي أنشأه المسؤول."], buttonLabel: "تأكيد البريد", eyebrow: "التحقق من البريد", footer: "الوصول إلى Multideck يكون بالدعوة فقط." },
  },
  email_change: {
    en: { subject: "Confirm your new Multideck email", title: "Confirm your new email address", body: ["A request was made to change the email address connected to your Multideck account.", "Confirm the new address using the secure link below."], buttonLabel: "Confirm new email", eyebrow: "Account security", footer: "If you did not request this change, contact your workspace administrator immediately." },
    de: { subject: "Neue Multideck-E-Mail bestätigen", title: "Neue E-Mail-Adresse bestätigen", body: ["Die E-Mail-Adresse deines Multideck-Kontos soll geändert werden.", "Bestätige die neue Adresse über den sicheren Link."], buttonLabel: "Neue E-Mail bestätigen", eyebrow: "Kontosicherheit", footer: "Wenn du dies nicht angefordert hast, kontaktiere sofort deinen Administrator." },
    fr: { subject: "Confirmez votre nouvel e-mail Multideck", title: "Confirmez votre nouvelle adresse", body: ["Une demande de modification de l’e-mail de votre compte Multideck a été effectuée.", "Confirmez la nouvelle adresse avec le lien sécurisé."], buttonLabel: "Confirmer le nouvel e-mail", eyebrow: "Sécurité du compte", footer: "Si vous n’êtes pas à l’origine de cette demande, contactez immédiatement votre administrateur." },
    ar: { subject: "تأكيد بريد Multideck الجديد", title: "أكد عنوان البريد الجديد", body: ["تم طلب تغيير البريد المرتبط بحساب Multideck الخاص بك.", "أكد العنوان الجديد باستخدام الرابط الآمن أدناه."], buttonLabel: "تأكيد البريد الجديد", eyebrow: "أمان الحساب", footer: "إذا لم تطلب هذا التغيير، فاتصل بمسؤول مساحة العمل فورا." },
  },
  reauthentication: {
    en: { subject: "Confirm this Multideck action", title: "Confirm it’s you", body: ["Use this one-time code to continue the sensitive account action you started in Multideck."], eyebrow: "Security check", footer: "Never share this code. Multideck support will not ask you for it." },
    de: { subject: "Multideck-Aktion bestätigen", title: "Bestätige deine Identität", body: ["Nutze diesen Einmalcode, um die sensible Kontoaktion in Multideck fortzusetzen."], eyebrow: "Sicherheitsprüfung", footer: "Teile diesen Code niemals. Der Multideck-Support wird nicht danach fragen." },
    fr: { subject: "Confirmez cette action Multideck", title: "Confirmez votre identité", body: ["Utilisez ce code à usage unique pour poursuivre l’action sensible commencée dans Multideck."], eyebrow: "Contrôle de sécurité", footer: "Ne partagez jamais ce code. Le support Multideck ne vous le demandera pas." },
    ar: { subject: "تأكيد إجراء Multideck", title: "أكد هويتك", body: ["استخدم هذا الرمز لمرة واحدة لمتابعة إجراء الحساب الحساس الذي بدأته في Multideck."], eyebrow: "فحص أمني", footer: "لا تشارك هذا الرمز أبدا. لن يطلب منك دعم Multideck هذا الرمز." },
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

function invitationExpirySentence(locale: "en" | "de" | "fr" | "ar", expiry: InvitationExpiry) {
  const duration = {
    en: { "3d": "three days", "7d": "seven days", "30d": "30 days" },
    de: { "3d": "drei Tage", "7d": "sieben Tage", "30d": "30 Tage" },
    fr: { "3d": "trois jours", "7d": "sept jours", "30d": "30 jours" },
    ar: { "3d": "ثلاثة أيام", "7d": "سبعة أيام", "30d": "30 يوما" },
  } as const
  if (expiry === "never") {
    return {
      en: "The link stays valid until you create your password, even if your email security system checks it first.",
      de: "Der Link bleibt gültig, bis du dein Passwort erstellst – auch wenn dein E-Mail-Sicherheitssystem ihn vorher prüft.",
      fr: "Le lien reste valable jusqu’à la création de votre mot de passe, même si votre système de sécurité des e-mails le vérifie d’abord.",
      ar: "يظل الرابط صالحا حتى تنشئ كلمة المرور، حتى إذا فحصه نظام أمان البريد الإلكتروني أولا.",
    }[locale]
  }
  return {
    en: `The link stays valid for ${duration.en[expiry]} until you create your password, even if your email security system checks it first.`,
    de: `Der Link bleibt ${duration.de[expiry]} gültig, bis du dein Passwort erstellst – auch wenn dein E-Mail-Sicherheitssystem ihn vorher prüft.`,
    fr: `Le lien reste valable ${duration.fr[expiry]} jusqu’à la création de votre mot de passe, même si votre système de sécurité des e-mails le vérifie d’abord.`,
    ar: `يظل الرابط صالحا لمدة ${duration.ar[expiry]} حتى تنشئ كلمة المرور، حتى إذا فحصه نظام أمان البريد الإلكتروني أولا.`,
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
