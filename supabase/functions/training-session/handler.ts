import { createClient } from "npm:@supabase/supabase-js@2.108.2"
import { authenticate, corsHeaders, currentInternalUser, HttpError, json, readAllowedAppOrigins } from "../_shared/backend.ts"

type Dependencies = {
  env: (name: string) => string | undefined
  createClient: typeof createClient
  authenticate: typeof authenticate
  currentInternalUser: typeof currentInternalUser
  allowedOrigins: typeof readAllowedAppOrigins
  now: () => number
}

// Deployed on MAIN only. No passwords, OAuth tokens, MFA factors, or refresh
// tokens are copied or returned. Training Auth holds a credentialless identity.
export function createTrainingSessionHandler(overrides: Partial<Dependencies> = {}) {
  const deps: Dependencies = { env: name => Deno.env.get(name), createClient, authenticate, currentInternalUser,
    allowedOrigins: readAllowedAppOrigins, now: Date.now, ...overrides }
  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
    try {
      if (request.method !== "POST") throw new HttpError(405, "Use POST to open training.")
      const origin = request.headers.get("Origin")
      if (origin && !deps.allowedOrigins().has(origin)) throw new HttpError(403, "This workspace origin is not allowed.")
      const mainUrl = (deps.env("SUPABASE_URL") ?? "").replace(/\/$/, "")
      const targetUrl = (deps.env("TRAINING_SUPABASE_URL") ?? "").replace(/\/$/, "")
      const targetKey = deps.env("TRAINING_SUPABASE_SERVICE_ROLE_KEY") ?? ""
      const targetAnon = deps.env("TRAINING_SUPABASE_ANON_KEY") ?? ""
      const sourceCompany = deps.env("TRAINING_SOURCE_COMPANY_ID") ?? ""
      if (!targetUrl || !targetKey || !targetAnon || !sourceCompany) throw new HttpError(503, "Training has not been configured for this workspace.")
      const target = new URL(targetUrl)
      if (target.protocol !== "https:" || target.origin !== targetUrl || target.origin === new URL(mainUrl).origin) {
        throw new HttpError(503, "Training must use a separate, correctly configured Supabase project.")
      }
      const { admin, user } = await deps.authenticate(request)
      const profile = await deps.currentInternalUser(admin, user)
      if (profile.Company_ID !== sourceCompany) throw new HttpError(403, "Training is not available for this company profile.")
      const training = deps.createClient(targetUrl, targetKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) },
      })
      const pair = await training.rpc("assert_training_pair_v1", { p_main_project_url: mainUrl, p_main_company_id: sourceCompany })
      if (pair.error || !pair.data) throw new HttpError(503, "The training database has not been paired with this main workspace.")

      const { data: assignments, error: assignmentError } = await admin.from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", profile.User_ID)
      if (assignmentError) throw new HttpError(503, "Your workspace permissions could not be checked.")
      const officeLinks = await admin.from("cmp_Users_Offices").select("Office_ID").eq("User_ID", profile.User_ID)
      if (officeLinks.error) throw new HttpError(503, "Your office access could not be checked.")
      const officeIds = (officeLinks.data ?? []).map(row => row.Office_ID).sort()
      const roleIds = (assignments ?? []).map(row => row.sys_UserRole_ID)
      const roles: { id: string; name: string; permissions: string[] }[] = []
      for (const id of roleIds) {
        const [role, links] = await Promise.all([
          admin.from("sys_UserRoles").select("sys_UserRole_Name").eq("sys_UserRole_ID", id).single(),
          admin.from("sys_UserRole_Permissions").select("sys_Permission_ID").eq("sys_UserRole_ID", id),
        ])
        if (role.error || links.error) throw new HttpError(503, "Your workspace permissions could not be checked.")
        const ids = (links.data ?? []).map(row => row.sys_Permission_ID)
        const permissions = ids.length ? await admin.from("sys_Permissions").select("sys_Permission_Value").in("sys_Permission_ID", ids) : { data: [], error: null }
        if (permissions.error) throw new HttpError(503, "Your workspace permissions could not be checked.")
        roles.push({ id, name: role.data.sys_UserRole_Name, permissions: permissions.data!.map(row => row.sys_Permission_Value).sort() })
      }
      roles.sort((a, b) => a.id.localeCompare(b.id))
      // An undeliverable, deterministic address prevents training OTP/recovery
      // from becoming a second way to sign in after main access is removed.
      const shadowEmail = `${user.id}@training.multideck.invalid`
      let shadow = await training.auth.admin.getUserById(user.id)
      if (!shadow.data.user) {
        if (shadow.error && shadow.error.status !== 404) throw new HttpError(503, "The training identity could not be checked.")
        const created = await training.auth.admin.createUser({ id: user.id, email: shadowEmail, email_confirm: true,
          app_metadata: { training_main_project: mainUrl } })
        shadow = created.error ? await training.auth.admin.getUserById(user.id) : created
      }
      if (shadow.error || shadow.data.user?.email !== shadowEmail || shadow.data.user.app_metadata.training_main_project !== mainUrl) {
        throw new HttpError(409, "The training identity conflicts with an existing account. Contact your administrator.")
      }
      const synced = await training.rpc("sync_training_identity_v1", {
        p_main_project_url: mainUrl, p_main_company_id: sourceCompany,
        p_profile: { authUserId: user.id, userId: profile.User_ID, email: profile.User_Email, firstName: profile.User_Firstname, lastName: profile.User_Lastname, officeIds },
        p_roles: roles,
      })
      if (synced.error) throw new HttpError(503, "The training profile, office mapping or permission catalogue needs administrator attention.")
      const link = await training.auth.admin.generateLink({ type: "magiclink", email: shadowEmail })
      if (link.error || link.data.user.id !== user.id) throw new HttpError(503, "The training session could not be prepared.")
      const verifier = deps.createClient(targetUrl, targetAnon, { auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }) } })
      const verified = await verifier.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token })
      const session = verified.data.session
      if (verified.error || !session || session.user.id !== user.id) throw new HttpError(503, "The training session could not be opened.")
      if (!session.expires_at || session.expires_at > deps.now() / 1000 + 330) {
        throw new HttpError(503, "Set the training Supabase JWT expiry to 300 seconds before enabling training.")
      }
      return new Response(JSON.stringify({ accessToken: session.access_token, expiresAt: session.expires_at, authUserId: user.id, projectUrl: targetUrl }),
        { headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" } })
    } catch (error) {
      // Never log Auth responses, tokens, links, configuration keys or credentials.
      return json(request, { detail: error instanceof HttpError ? error.message : "Training could not be opened. Contact your administrator." },
        error instanceof HttpError ? error.status : 503)
    }
  }
}
