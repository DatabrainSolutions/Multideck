function exactAppOrigin(value: string) {
  if (!value.trim()) throw new Error("APP_URL is not configured")
  const url = new URL(value)
  const localDevelopment = url.hostname === "localhost" || url.hostname === "127.0.0.1"
  if ((url.protocol !== "https:" && !(localDevelopment && url.protocol === "http:")) || url.username || url.password) {
    throw new Error("APP_URL must be an exact HTTPS tenant origin")
  }
  if (url.pathname !== "/" || url.search || url.hash) throw new Error("APP_URL must not include a path, query, or fragment")
  return url.origin
}

export function buildPasswordRecoveryUrl(appUrl: string, redirectTo: string, tokenHash: string) {
  const appOrigin = exactAppOrigin(appUrl)
  const redirect = new URL(redirectTo)
  if (redirect.origin !== appOrigin || redirect.pathname !== "/auth" || redirect.searchParams.get("mode") !== "reset-password") {
    throw new Error("Password recovery must return to the configured tenant application")
  }
  if (tokenHash.length < 20 || tokenHash.length > 2048 || !/^[A-Za-z0-9._~-]+$/.test(tokenHash)) {
    throw new Error("Password recovery token hash is missing or malformed")
  }

  const recoveryUrl = new URL("/auth?mode=reset-password", appOrigin)
  recoveryUrl.hash = new URLSearchParams({ token_hash: tokenHash, type: "recovery" }).toString()
  return recoveryUrl.toString()
}
