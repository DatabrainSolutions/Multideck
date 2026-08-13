import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.108.2"

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export function isTrustedMultideckOrigin(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return false
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true
    return url.protocol === "https:" && (url.hostname === "multideck.app" || url.hostname.endsWith(".multideck.app"))
  } catch {
    return false
  }
}

export function readAllowedAppOrigins() {
  const values = [
    Deno.env.get("APP_URL")?.trim() || "https://dev.multideck.app",
    ...(Deno.env.get("APP_ALLOWED_ORIGINS") ?? "").split(","),
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]
  const origins = new Set<string>()
  for (const value of values) {
    try {
      const candidate = value.trim()
      const url = new URL(candidate)
      if (url.origin === candidate && isTrustedMultideckOrigin(candidate)) origins.add(candidate)
    } catch { /* ignore malformed configuration */ }
  }
  return origins
}

export function corsHeaders(request: Request) {
  const appUrl = Deno.env.get("APP_URL")?.trim() || "https://dev.multideck.app"
  const origin = request.headers.get("Origin")?.trim() || appUrl
  const allowed = readAllowedAppOrigins().has(origin)
  return {
    "Access-Control-Allow-Origin": allowed ? origin : appUrl,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
    Vary: "Origin",
  }
}

export function json(request: Request, body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  })
}

export function failure(request: Request, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500
  const message = error instanceof Error ? error.message : "The request could not be completed."
  console.error(error)
  return json(request, { detail: message }, status)
}

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) throw new HttpError(503, "Supabase server credentials are not configured.")
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function authenticate(request: Request, admin = adminClient()) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!token) throw new HttpError(401, "Sign in again to continue.")
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, "Your session is no longer valid. Sign in again.")
  return { admin, user: data.user, token }
}

export async function currentInternalUser(admin: SupabaseClient, authUser: User) {
  const { data, error } = await admin.from("cmp_Users").select("*").eq("Auth_User_ID", authUser.id).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(403, "Your Supabase account is not linked to a Multideck company profile yet.")
  if (data.User_AccessStatus && data.User_AccessStatus !== "active") {
    throw new HttpError(403, "Your Multideck access has been deactivated. Contact a workspace administrator.")
  }
  return data
}

export async function permissionValues(admin: SupabaseClient, userId: string) {
  const { data: assignments, error: assignmentError } = await admin
    .from("cmp_Users_Roles").select("sys_UserRole_ID").eq("User_ID", userId)
  if (assignmentError) throw new HttpError(500, assignmentError.message)
  const roleIds = (assignments ?? []).map((row) => row.sys_UserRole_ID)
  if (!roleIds.length) return [] as string[]
  const { data: links, error: linkError } = await admin
    .from("sys_UserRole_Permissions").select("sys_Permission_ID").in("sys_UserRole_ID", roleIds)
  if (linkError) throw new HttpError(500, linkError.message)
  const permissionIds = [...new Set((links ?? []).map((row) => row.sys_Permission_ID))]
  if (!permissionIds.length) return [] as string[]
  const { data, error } = await admin.from("sys_Permissions").select("sys_Permission_Value").in("sys_Permission_ID", permissionIds)
  if (error) throw new HttpError(500, error.message)
  return [...new Set((data ?? []).map((row) => row.sys_Permission_Value))].sort()
}

export async function requirePermission(admin: SupabaseClient, userId: string, permission: string) {
  const permissions = await permissionValues(admin, userId)
  if (!permissions.includes(permission)) throw new HttpError(403, "You do not have permission to do that.")
  return permissions
}

export async function body<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T
  } catch {
    throw new HttpError(400, "Send a valid JSON request.")
  }
}

export function routeParts(request: Request, functionName: string) {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean)
  const index = parts.lastIndexOf(functionName)
  return index >= 0 ? parts.slice(index + 1) : []
}

export function normalize(value: unknown) {
  const text = typeof value === "string" ? value.trim() : ""
  return text || null
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("")
}
