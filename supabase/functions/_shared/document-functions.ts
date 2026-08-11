
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"

export const generatedDocumentsBucket = "multideck-generated"
export const templateSourcesBucket = "multideck-template-sources"
export const signedUrlLifetimeSeconds = 300
export const maximumGeneratedFileBytes = 50 * 1024 * 1024

type FunctionContext = {
  admin: SupabaseClient
  userId: string
}

function readNamedKey(jsonValue: string | undefined) {
  if (!jsonValue) return null
  try {
    const keys = JSON.parse(jsonValue) as Record<string, string>
    return keys.default ?? Object.values(keys)[0] ?? null
  } catch {
    return null
  }
}

function getPublishableKey() {
  return readNamedKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"))
    ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")
    ?? Deno.env.get("SB_PUBLISHABLE_KEY")
    ?? Deno.env.get("SUPABASE_ANON_KEY")
}

function getSecretKey() {
  return readNamedKey(Deno.env.get("SUPABASE_SECRET_KEYS"))
    ?? Deno.env.get("SUPABASE_SECRET_KEY")
    ?? Deno.env.get("SB_SECRET_KEY")
    ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
}

function allowedOrigin(request: Request) {
  const origin = request.headers.get("Origin")
  const configured = Deno.env.get("DOCUMENT_ALLOWED_ORIGINS")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  if (!configured?.length) return "*"
  return origin && configured.includes(origin) ? origin : configured[0]
}

export function corsHeaders(request: Request) {
  return {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Vary": "Origin",
  }
}

export function jsonResponse(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  })
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function parseJobNumber(value: unknown) {
  const normalised = typeof value === "string" ? value.trim().toUpperCase() : ""
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,49}$/.test(normalised)) {
    throw new FunctionError(400, "Enter a valid job number.", "Job number validation failed")
  }
  return normalised
}

export async function authenticateRequest(request: Request): Promise<FunctionContext> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const publishableKey = getPublishableKey()
  const secretKey = getSecretKey()
  const authorization = request.headers.get("Authorization") ?? ""

  if (!supabaseUrl || !publishableKey || !secretKey) {
    throw new FunctionError(500, "The secure document service is not configured.", "Supabase function keys are unavailable")
  }
  if (!authorization.startsWith("Bearer ")) {
    throw new FunctionError(401, "Authentication required.", "Authorization header is missing")
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) {
    throw new FunctionError(401, "Authentication required.", "Supabase user JWT validation failed")
  }

  return {
    userId: data.user.id,
    admin: createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  }
}

export class FunctionError extends Error {
  constructor(
    public readonly status: number,
    public readonly clientMessage: string,
    public readonly auditMessage: string,
  ) {
    super(auditMessage)
  }
}

export function toFunctionError(error: unknown) {
  if (error instanceof FunctionError) return error
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : ""
  if (code === "42501" || code === "PGRST301") {
    return new FunctionError(403, "You are not authorised to use this document.", "Document authorization was rejected")
  }
  if (code === "MD404") {
    return new FunctionError(404, "No authorised job matches that job number.", "Job number was not found in the caller's authorised offices")
  }
  if (code === "MD409") {
    return new FunctionError(409, "More than one authorised job uses that number.", "Job number resolution was ambiguous")
  }
  return new FunctionError(500, "The secure document service could not complete the request.", "Unexpected document function failure")
}

export function safeFailureMessage(error: unknown) {
  return error instanceof FunctionError ? error.auditMessage : "Unexpected document render failure"
}
