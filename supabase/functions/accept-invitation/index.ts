import { requireMainIdentityAdministration } from "../_shared/training-environment.ts"
import { adminClient, body, corsHeaders, failure, HttpError, json } from "../_shared/backend.ts"
import { verifyInvitationTicket } from "../_shared/invitation-ticket.ts"
import { getPasswordPolicyError } from "../_shared/password-policy.ts"
import { initialOnboardingState } from "../_shared/account-onboarding.ts"

type AcceptInvitationRequest = {
  action?: "preview"
  ticket?: string
  password?: string
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })

  try {
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed.")
    const payload = await body<AcceptInvitationRequest>(request)
    const ticket = payload.ticket?.trim() ?? ""
    const password = payload.password ?? ""
    const passwordPolicyError = getPasswordPolicyError(password)
    if (payload.action !== "preview" && passwordPolicyError) throw new HttpError(400, passwordPolicyError)

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    let userId = ""
    try {
      userId = (await verifyInvitationTicket(ticket, serviceRoleKey)).userId
    } catch {
      throw new HttpError(410, "This invitation link is invalid or has expired. Ask your workspace administrator to resend it.")
    }

    const admin = adminClient()
    await requireMainIdentityAdministration(admin)
    const { data: current, error: currentError } = await admin.auth.admin.getUserById(userId)
    if (currentError || !current.user?.email) throw new HttpError(410, "This invitation is no longer available.")
    if (
      !current.user.invited_at
      || current.user.app_metadata?.multideck_password_created_at
      || current.user.user_metadata?.multideck_password_created_at
    ) {
      throw new HttpError(410, "This invitation has already been completed.")
    }
    if (current.user.banned_until && Date.parse(current.user.banned_until) > Date.now()) {
      throw new HttpError(403, "This account cannot currently accept an invitation.")
    }

    const { data: profile, error: profileError } = await admin.from("cmp_Users")
      .select("User_ID,User_Firstname,User_Lastname,Company_ID,User_AccessStatus")
      .eq("Auth_User_ID", userId).maybeSingle()
    if (profileError) throw new HttpError(500, "Your invitation could not be checked. Please try again.")
    if (profile && profile.User_AccessStatus !== "active") throw new HttpError(403, "This workspace invitation is no longer active.")
    if (payload.action === "preview") {
      const { data: company } = profile?.Company_ID ? await admin.from("cmp_Company").select("Company_Name").eq("Company_ID", profile.Company_ID).maybeSingle() : { data: null }
      return json(request, { firstName: profile?.User_Firstname || current.user.user_metadata?.first_name || "", name: [profile?.User_Firstname, profile?.User_Lastname].filter(Boolean).join(" "), email: current.user.email, workspaceName: company?.Company_Name || "your workspace" })
    }

    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      app_metadata: {
        ...current.user.app_metadata,
        multideck_password_created_at: new Date().toISOString(),
        ...(profile ? { multideck_onboarding: initialOnboardingState() } : {}),
      },
    })
    if (updateError || !updated.user) throw new HttpError(500, "Your password could not be saved. Try again.")

    return json(request, { email: current.user.email })
  } catch (error) {
    return failure(request, error)
  }
})
