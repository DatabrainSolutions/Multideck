export type WorkspaceBootstrapPreferences = {
  themeMode: "light" | "dark" | null
  locale: string | null
  accentPreset: string | null
  sidebar: {
    collapsed: boolean
    layout: Record<string, unknown>
  }
  keyboardShortcuts: Record<string, unknown>
  tablePinnedColumns: Record<string, unknown>
}

export type WorkspaceBootstrapProfileMedia = {
  profilePhotoPath: string | null
  profilePhotoUrl: string | null
  coverPhotoPath: string | null
  coverPhotoUrl: string | null
  expiresAt: string | null
}

export type WorkspaceBootstrapPayload = {
  preferences: WorkspaceBootstrapPreferences | null
  profileMedia: WorkspaceBootstrapProfileMedia
}

type BootstrapSession = { workspace?: WorkspaceBootstrapPayload | null }
type BootstrapLoader<T extends BootstrapSession> = () => Promise<T>

let activeAccessToken: string | null = null
let activeRequest: Promise<BootstrapSession> | null = null

/**
 * Shares the account bootstrap across App, the dashboard connection check and
 * every preference store. Tokens remain in memory only and a rejected request
 * is never cached, so a transient failure can be retried immediately.
 */
export function getOrCreateWorkspaceBootstrap<T extends BootstrapSession>(
  accessToken: string,
  loader: BootstrapLoader<T>,
): Promise<T> {
  if (activeAccessToken === accessToken && activeRequest) return activeRequest as Promise<T>

  activeAccessToken = accessToken
  const request = loader()
  activeRequest = request
  void request.catch(() => {
    if (activeRequest === request) {
      activeAccessToken = null
      activeRequest = null
    }
  })

  return request
}

/** Clear after sign-out or any profile/preference mutation to avoid stale reuse. */
export function invalidateWorkspaceBootstrap() {
  activeAccessToken = null
  activeRequest = null
}

/** Keep the settled bootstrap coherent after a local-first preference write. */
export function updateWorkspaceBootstrapPreferences(patch: Partial<WorkspaceBootstrapPreferences>) {
  if (!activeRequest) return

  activeRequest = activeRequest.then((session) => {
    const preferences = session.workspace?.preferences
    if (preferences) Object.assign(preferences, patch)
    return session
  })
}
