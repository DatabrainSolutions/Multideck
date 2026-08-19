import {
  authenticate,
  body,
  corsHeaders,
  currentInternalUser,
  failure,
  HttpError,
  json,
  routeParts,
} from "../_shared/backend.ts"

const tenantAdministratorRoles = new Set(["administrator", "company admin"])

function cleanRoute(value: unknown) {
  const route = typeof value === "string" ? value.trim() : ""
  if (!route || route.length > 180 || !route.startsWith("/") || route.includes("?") || route.includes("#")) return null
  return route
}

function requestIp(request: Request) {
  const candidate = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0],
    request.headers.get("x-real-ip"),
  ].find((value) => value?.trim())?.trim() ?? ""
  return /^[0-9a-f:.]{3,64}$/i.test(candidate) ? candidate : null
}

function cleanUserAgent(request: Request) {
  const value = request.headers.get("user-agent")?.trim() ?? ""
  return value ? value.slice(0, 500) : null
}

async function requireTenantAdministrator(admin: any, current: any) {
  const { data: links, error: linkError } = await admin
    .from("cmp_Users_Roles")
    .select("sys_UserRole_ID")
    .eq("User_ID", current.User_ID)
  if (linkError) throw new HttpError(500, linkError.message)

  const roleIds = (links ?? []).map((link: any) => link.sys_UserRole_ID)
  const { data: roles, error: roleError } = roleIds.length
    ? await admin.from("sys_UserRoles").select("sys_UserRole_Name").in("sys_UserRole_ID", roleIds)
    : { data: [], error: null }
  if (roleError) throw new HttpError(500, roleError.message)

  const allowed = (roles ?? []).some((role: any) => tenantAdministratorRoles.has(String(role.sys_UserRole_Name ?? "").trim().toLowerCase()))
  if (!allowed) throw new HttpError(403, "Only tenant administrators can open Admin.")
}

async function recordPresence(admin: any, current: any, authUserId: string, request: Request) {
  const payload = await body<{ route?: string }>(request)
  const route = cleanRoute(payload.route)
  const now = new Date().toISOString()
  const { error } = await admin.from("Admin_UserPresence").upsert({
    Presence_UserID: current.User_ID,
    Presence_AuthUserID: authUserId,
    Presence_CompanyID: current.Company_ID,
    Presence_LastRoute: route,
    Presence_IPAddress: requestIp(request),
    Presence_UserAgent: cleanUserAgent(request),
    Presence_LastSeenAt: now,
  }, { onConflict: "Presence_UserID" })
  if (error) throw new HttpError(500, error.message)
  return { recorded: true, lastSeenAt: now }
}

async function activeUsers(admin: any, current: any) {
  const activeSince = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data: presence, error: presenceError } = await admin
    .from("Admin_UserPresence")
    .select("Presence_UserID,Presence_LastRoute,Presence_IPAddress,Presence_UserAgent,Presence_LastSeenAt")
    .eq("Presence_CompanyID", current.Company_ID)
    .gte("Presence_LastSeenAt", activeSince)
    .order("Presence_LastSeenAt", { ascending: false })
    .limit(100)
  if (presenceError) throw new HttpError(500, presenceError.message)

  const userIds = (presence ?? []).map((item: any) => item.Presence_UserID)
  const { data: users, error: userError } = userIds.length
    ? await admin.from("cmp_Users").select("User_ID,User_Firstname,User_Lastname,User_Email").in("User_ID", userIds)
    : { data: [], error: null }
  if (userError) throw new HttpError(500, userError.message)
  const usersById = new Map((users ?? []).map((user: any) => [user.User_ID, user]))

  return (presence ?? []).map((item: any) => {
    const user = usersById.get(item.Presence_UserID) as any
    return {
      id: item.Presence_UserID,
      name: [user?.User_Firstname, user?.User_Lastname].filter(Boolean).join(" ") || user?.User_Email || "Workspace user",
      email: user?.User_Email ?? null,
      route: item.Presence_LastRoute,
      ipAddress: item.Presence_IPAddress,
      userAgent: item.Presence_UserAgent,
      lastSeenAt: item.Presence_LastSeenAt,
    }
  })
}

function missingAuditPageReadModel(error: { code?: string } | null) {
  return error?.code === "42883" || error?.code === "PGRST202"
}

function cleanAuditQuery(value: string | null) {
  const query = value?.trim() ?? ""
  return query ? query.slice(0, 120).toLowerCase() : null
}

function cleanAuditCategory(value: string | null) {
  return value === "authentication" || value === "application" ? value : "all"
}

function cleanAuditDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null
}

function auditSearchText(row: Record<string, unknown>) {
  return [
    row.title,
    row.action,
    row.actor_name,
    row.actor_email,
    row.source,
    row.record_type,
    row.record_id,
    row.field_name,
    row.ip_address,
    row.detail,
    row.old_value == null ? null : JSON.stringify(row.old_value),
    row.new_value == null ? null : JSON.stringify(row.new_value),
  ].filter(Boolean).join(" ").toLowerCase()
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })

  try {
    const { admin, user } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    const parts = routeParts(request, "admin-audit")

    if (parts.length === 1 && parts[0] === "presence" && request.method === "POST") {
      return json(request, await recordPresence(admin, current, user.id, request))
    }

    if (parts.length || request.method !== "GET") throw new HttpError(405, "Method not allowed.")
    await requireTenantAdministrator(admin, current)

    const url = new URL(request.url)
    const view = url.searchParams.get("view") === "detailed" ? "detailed" : "activity"
    const query = cleanAuditQuery(url.searchParams.get("query"))
    const category = cleanAuditCategory(url.searchParams.get("category"))
    const startDate = cleanAuditDate(url.searchParams.get("startDate"))
    const endDate = cleanAuditDate(url.searchParams.get("endDate"))
    const sortDirection = url.searchParams.get("sortDirection") === "asc" ? "asc" : "desc"
    const requestedLimit = Number(url.searchParams.get("limit") ?? 25)
    const requestedOffset = Number(url.searchParams.get("offset") ?? 0)
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50) : 25
    const offset = Number.isFinite(requestedOffset) ? Math.min(Math.max(Math.trunc(requestedOffset), 0), 1_000_000) : 0
    const [pageResult, active] = await Promise.all([
      admin.rpc("Admin_AuditLogPage", {
        p_actor_user_id: current.User_ID,
        p_detailed: view === "detailed",
        p_query: query,
        p_category: category,
        p_start_date: startDate,
        p_end_date: endDate,
        p_sort_direction: sortDirection,
        p_limit: limit,
        p_offset: offset,
      }),
      view === "activity" ? activeUsers(admin, current) : Promise.resolve([]),
    ])

    if (!pageResult.error) {
      const page = pageResult.data && typeof pageResult.data === "object" ? pageResult.data : {}
      return json(request, {
        view,
        rows: Array.isArray(page.rows) ? page.rows : [],
        total: Number(page.total ?? 0),
        offset: Number(page.offset ?? offset),
        limit: Number(page.limit ?? limit),
        activeUsers: active,
      })
    }
    if (!missingAuditPageReadModel(pageResult.error)) {
      throw new HttpError(pageResult.error.code === "42501" ? 403 : 500, pageResult.error.message)
    }

    throw new HttpError(503, "Paged audit history is still being prepared. Try again shortly.")
  } catch (error) {
    return failure(request, error)
  }
})
