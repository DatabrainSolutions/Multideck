const preloadRecoveryKey = "multideck.preload-recovery-at"
const preloadRecoveryWindowMs = 60_000

export function canRecoverFromPreloadError(lastRecoveryAt: number | null, now = Date.now()) {
  return lastRecoveryAt === null || !Number.isFinite(lastRecoveryAt) || now - lastRecoveryAt >= preloadRecoveryWindowMs
}

function readLastRecoveryAt() {
  try {
    const saved = window.sessionStorage.getItem(preloadRecoveryKey)
    return saved === null ? null : Number(saved)
  } catch {
    return null
  }
}

function rememberRecovery(now: number) {
  try {
    window.sessionStorage.setItem(preloadRecoveryKey, String(now))
  } catch {
    // A browser that blocks session storage can still recover once in this page.
  }
}

export function installDeploymentPreloadRecovery() {
  window.addEventListener("vite:preloadError", (event) => {
    const now = Date.now()
    if (!canRecoverFromPreloadError(readLastRecoveryAt(), now)) return

    // A new deployment can replace the HTML shell while an already-open tab still
    // references an older lazy chunk. Refresh once so the shell and chunk manifest
    // come from the same deployment instead of showing a misleading fatal error.
    event.preventDefault()
    rememberRecovery(now)
    window.location.reload()
  })
}
