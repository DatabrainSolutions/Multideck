export type TrainingGrant = { accessToken: string; expiresAt: number; authUserId: string; projectUrl: string }

/** Memory only: never persist a training token or expose a training refresh token. */
export function createTrainingAccessCache() {
  let generation = 0
  let sourceIdentity = ""
  const issuedTokens = new Set<string>()
  let cached: { sourceToken: string; grant: TrainingGrant } | null = null
  let pending: { sourceToken: string; request: Promise<TrainingGrant> } | null = null
  return {
    clear() { generation++; cached = null; pending = null; sourceIdentity = ""; issuedTokens.clear() },
    accepts(token: string, sourceToken: string) { return token === sourceToken || (sourceIdentity === sourceToken && issuedTokens.has(token)) },
    async get(sourceToken: string, load: () => Promise<TrainingGrant>) {
      if (cached?.sourceToken === sourceToken && cached.grant.expiresAt * 1000 > Date.now() + 30_000) return cached.grant
      if (pending?.sourceToken === sourceToken) return pending.request
      if (sourceIdentity !== sourceToken) { issuedTokens.clear(); sourceIdentity = sourceToken }
      // A new main token supersedes any older in-flight identity request.
      const version = ++generation
      cached = null
      const request = load().then(grant => {
        if (version !== generation) throw new Error("Your workspace session changed. Sign in again.")
        // Keep only the previous and current grant for requests crossing expiry.
        if (issuedTokens.size >= 2) issuedTokens.delete(issuedTokens.values().next().value!)
        issuedTokens.add(grant.accessToken)
        cached = { sourceToken, grant }
        return grant
      }).finally(() => { if (pending?.request === request) pending = null })
      pending = { sourceToken, request }
      return request
    },
  }
}
