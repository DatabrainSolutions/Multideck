import { authenticate, body, corsHeaders, failure, HttpError, json } from "../_shared/backend.ts"
import { workspaceBootstrap } from "../_shared/workspace-bootstrap.ts"

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request)
    if (request.method === "GET") {
      const workspace = await workspaceBootstrap(admin, user)
      return json(request, {
        authenticated: true,
        user: { id: user.id, email: user.email ?? null, role: user.role ?? null, audience: user.aud ?? null },
        profile: workspace.profile,
        workspace: { preferences: workspace.preferences, profileMedia: workspace.profileMedia },
        expiresAt: null,
      })
    }
    if (request.method === "PATCH") {
      const payload = await body<{ jobTitle?: string | null }>(request)
      const jobTitle = payload.jobTitle?.trim() || null
      if (jobTitle && jobTitle.length > 120) throw new HttpError(400, "Keep the job title to 120 characters or fewer.")
      const { error } = await admin.from("cmp_Users").update({ User_JobTitle: jobTitle }).eq("Auth_User_ID", user.id)
      if (error) throw new HttpError(500, error.message)
      const workspace = await workspaceBootstrap(admin, user)
      if (!workspace.profile || workspace.profile.actorType !== "internal") {
        throw new HttpError(403, "Your account is not linked to an internal profile.")
      }
      return json(request, workspace.profile)
    }
    throw new HttpError(405, "Method not allowed.")
  } catch (error) { return failure(request, error) }
})
