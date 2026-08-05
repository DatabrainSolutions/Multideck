const authReturnToStorageKey = "multideck.auth.returnTo"

function isSafeAppPath(path: string | null): path is string {
  return Boolean(path && path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/auth"))
}

export function getCurrentAuthReturnPath() {
  if (typeof window === "undefined") return "/"
  return `${window.location.pathname}${window.location.search}`
}

export function rememberAuthReturnPath(path = getCurrentAuthReturnPath()) {
  if (typeof window === "undefined" || !isSafeAppPath(path)) return
  window.sessionStorage.setItem(authReturnToStorageKey, path)
}

export function takeAuthReturnPath() {
  if (typeof window === "undefined") return "/app"

  const path = window.sessionStorage.getItem(authReturnToStorageKey)
  window.sessionStorage.removeItem(authReturnToStorageKey)

  return isSafeAppPath(path) ? path : "/app"
}
