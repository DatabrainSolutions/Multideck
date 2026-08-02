const expectedSurface = "app"
const surface = process.env.MULTIDECK_SURFACE
const tenantSlug = process.env.VITE_MULTIDECK_TENANT_SLUG
const projectName = process.env.VERCEL_PROJECT_NAME
const configuredRef = process.env.VITE_SUPABASE_PROJECT_REF
const supabaseUrl = process.env.VITE_SUPABASE_URL
const isVercel = process.env.VERCEL === "1"

function fail(message) {
  console.error(`Multideck App build blocked: ${message}`)
  process.exit(1)
}

if (surface && surface !== expectedSurface) fail(`MULTIDECK_SURFACE must be "${expectedSurface}", received "${surface}".`)
if (isVercel && !surface) fail("MULTIDECK_SURFACE is required on Vercel.")
if (tenantSlug && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(tenantSlug)) fail("VITE_MULTIDECK_TENANT_SLUG is invalid.")
if (isVercel && !tenantSlug) fail("VITE_MULTIDECK_TENANT_SLUG is required on Vercel.")
if (isVercel && projectName !== `multideck-app-${tenantSlug}`) fail(`Vercel project must be multideck-app-${tenantSlug}; received "${projectName ?? "unset"}".`)
if (isVercel && (!configuredRef || !supabaseUrl)) fail("VITE_SUPABASE_PROJECT_REF and VITE_SUPABASE_URL are required on Vercel.")
if (configuredRef && supabaseUrl) {
  const urlRef = new URL(supabaseUrl).hostname.split(".")[0]
  if (urlRef !== configuredRef) fail("VITE_SUPABASE_URL does not match VITE_SUPABASE_PROJECT_REF.")
}
