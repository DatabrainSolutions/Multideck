import assert from "node:assert/strict"
import test from "node:test"

import {
  getOrCreateWorkspaceBootstrap,
  invalidateWorkspaceBootstrap,
  updateWorkspaceBootstrapPreferences,
} from "../src/lib/workspace-bootstrap.ts"

test.beforeEach(() => invalidateWorkspaceBootstrap())

test("deduplicates every concurrent consumer onto one authenticated bootstrap", async () => {
  let calls = 0
  let resolveLoad
  const load = () => {
    calls += 1
    return new Promise((resolve) => { resolveLoad = resolve })
  }

  const requests = Array.from({ length: 8 }, () => getOrCreateWorkspaceBootstrap("token-a", load))
  assert.equal(calls, 1)

  resolveLoad({ workspace: { preferences: null, profileMedia: {} } })
  const results = await Promise.all(requests)
  assert.equal(new Set(results).size, 1)
})

test("never reuses one access token's bootstrap for another token", async () => {
  let calls = 0
  const load = async () => ({ workspace: null, request: ++calls })

  assert.equal((await getOrCreateWorkspaceBootstrap("token-a", load)).request, 1)
  assert.equal((await getOrCreateWorkspaceBootstrap("token-b", load)).request, 2)
  assert.equal(calls, 2)
})

test("updates cached preferences after a local-first write", async () => {
  const session = await getOrCreateWorkspaceBootstrap("token-a", async () => ({
    workspace: {
      preferences: {
        themeMode: "light",
        locale: "en-GB",
        accentPreset: "teal",
        sidebar: { collapsed: false, layout: {} },
        keyboardShortcuts: {},
        tablePinnedColumns: {},
      },
      profileMedia: {},
    },
  }))

  updateWorkspaceBootstrapPreferences({ themeMode: "dark", locale: "en-US" })
  const cached = await getOrCreateWorkspaceBootstrap("token-a", async () => assert.fail("cache missed"))

  assert.equal(cached, session)
  assert.equal(cached.workspace.preferences.themeMode, "dark")
  assert.equal(cached.workspace.preferences.locale, "en-US")
})

test("a failed bootstrap is discarded so the same session can retry", async () => {
  await assert.rejects(
    getOrCreateWorkspaceBootstrap("token-a", async () => { throw new Error("temporary") }),
    /temporary/,
  )

  const recovered = await getOrCreateWorkspaceBootstrap("token-a", async () => ({ workspace: null, recovered: true }))
  assert.equal(recovered.recovered, true)
})
