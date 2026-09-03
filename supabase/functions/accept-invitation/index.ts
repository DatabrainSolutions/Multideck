import { requireMainIdentityAdministration } from "../_shared/training-environment.ts"
import { adminClient, body, corsHeaders, failure, HttpError, json } from "../_shared/backend.ts"
import { verifyInvitationTicket } from "../_shared/invitation-ticket.ts"
import { getPasswordPolicyError } from "../_shared/password-policy.ts"

type AcceptInvitationRequest = {
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
    if (passwordPolicyError) throw new HttpError(400, passwordPolicyError)

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

    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      app_metadata: {
        ...current.user.app_metadata,
        multideck_password_created_at: new Date().toISOString(),
      },
    })
    if (updateError || !updated.user) throw new HttpError(500, "Your password could not be saved. Try again.")

    return json(request, { email: current.user.email })
  } catch (error) {
    return failure(request, error)
  }
})
