const tenantAppHostname = /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.multideck\.app$/

export function normaliseMultideckAppOrigin(value: unknown) {
  const rawOrigin = typeof value === "string" ? value.trim() : ""
  if (!rawOrigin) return null

  try {
    const url = new URL(rawOrigin)
    const localDevelopment = url.hostname === "localhost" || url.hostname === "127.0.0.1"
    const validLocalOrigin = localDevelopment
      && (url.protocol === "http:" || url.protocol === "https:")
      && url.port === "3000"
    const validTenantOrigin = url.protocol === "https:"
      && !url.port
      && tenantAppHostname.test(url.hostname)

    if (!validLocalOrigin && !validTenantOrigin) return null
    if (url.username || url.password || url.search || url.hash) return null
    if (url.pathname !== "/" && url.pathname !== "") return null
    return url.origin
  } catch {
    return null
  }
}

export function isMultideckAppOrigin(value: unknown) {
  return normaliseMultideckAppOrigin(value) !== null
}
