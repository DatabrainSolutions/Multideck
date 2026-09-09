// Build-time validation only. Never supply fallback tenant identities or print
// configured values: CI logs may be visible more widely than project settings.
export function productContextIssues(environment) {
  const surface = environment.MULTIDECK_SURFACE
  const tenantSlug = environment.VITE_MULTIDECK_TENANT_SLUG
  const projectName = environment.VERCEL_PROJECT_NAME
  const configuredRef = environment.VITE_SUPABASE_PROJECT_REF
  const supabaseUrl = environment.VITE_SUPABASE_URL
  const isVercel = environment.VERCEL === "1"
  const issues = []

  if (isVercel) {
    const missing = ["MULTIDECK_SURFACE", "VITE_MULTIDECK_TENANT_SLUG", "VERCEL_PROJECT_NAME", "VITE_SUPABASE_PROJECT_REF", "VITE_SUPABASE_URL"]
      .filter((key) => !environment[key])
    if (missing.length) issues.push(`Required Vercel configuration is missing: ${missing.join(", ")}.`)
  }
  if (surface && surface !== "app") issues.push('MULTIDECK_SURFACE must be "app".')
  if (tenantSlug && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tenantSlug)) issues.push("VITE_MULTIDECK_TENANT_SLUG is invalid.")
  if (isVercel && tenantSlug && projectName && projectName !== `multideck-app-${tenantSlug}`) {
    issues.push("VERCEL_PROJECT_NAME must match multideck-app-{VITE_MULTIDECK_TENANT_SLUG}.")
  }
  if (configuredRef && supabaseUrl) {
    try {
      if (new URL(supabaseUrl).hostname.split(".")[0] !== configuredRef) {
        issues.push("VITE_SUPABASE_URL does not match VITE_SUPABASE_PROJECT_REF.")
      }
    } catch {
      issues.push("VITE_SUPABASE_URL is not a valid URL.")
    }
  }
  return issues
}
