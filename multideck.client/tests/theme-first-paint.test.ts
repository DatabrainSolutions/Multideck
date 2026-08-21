import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import test from "node:test"

const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8")
const themePreferences = readFileSync(new URL("../src/lib/theme-preferences.tsx", import.meta.url), "utf8")
const themeProvider = readFileSync(new URL("../src/lib/theme-provider.tsx", import.meta.url), "utf8")
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8")
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8")
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : []
  })
}

/** The literal the pre-paint script and `ThemeProvider` both have to agree on. */
const storageKey = themePreferences.match(/export const themeStorageKey = "([^"]+)"/)?.[1]

test("the pre-paint script reads the same storage key the provider writes", () => {
  assert.ok(storageKey, "themeStorageKey is no longer declared as a plain string literal")
  assert.match(indexHtml, new RegExp(`localStorage\\.getItem\\("${storageKey}"\\)`))
})

test("the pre-paint script installs both modes and colour scheme before the body", () => {
  const scriptIndex = indexHtml.indexOf("localStorage.getItem")
  const bodyIndex = indexHtml.indexOf("<body")

  assert.notEqual(scriptIndex, -1, "index.html no longer applies the stored theme before paint")
  assert.ok(scriptIndex < bodyIndex, "the theme script must be in <head>, ahead of the body")
  assert.doesNotMatch(
    indexHtml.slice(0, bodyIndex),
    /<script[^>]*\b(defer|async)\b/,
    "deferring the theme script puts the class back after first paint",
  )
  assert.match(indexHtml, /var initialTheme = "light"/)
  assert.match(indexHtml, /initialTheme = "dark"/)
  assert.match(indexHtml, /classList\.remove\("light", "dark"\)/)
  assert.match(indexHtml, /classList\.add\(initialTheme\)/)
  assert.match(indexHtml, /style\.colorScheme = initialTheme/)
})

test("a deliberate choice invalidates any older profile read", () => {
  assert.match(themePreferences, /function recordChoice\(mode: ThemeMode\) \{\s*latestChoice = mode\s*preferenceRevision \+= 1/)
  assert.match(themePreferences, /const startedRevision = preferenceRevision/)
  assert.match(themePreferences, /const profileReadIsStale = preferenceRevision !== startedRevision/)
  assert.match(themePreferences, /latestChoice && \(profileReadIsStale \|\| profileConflictsWithChoice\)/)
})

test("a cached profile value can never repaint over the latest choice", () => {
  assert.match(themePreferences, /const profileConflictsWithChoice = latestChoice !== null && savedTheme !== latestChoice/)
  assert.match(themePreferences, /if \(savedTheme === latestChoice\) lastPersistedTheme = latestChoice/)
  assert.match(themePreferences, /else saveTheme\(latestChoice\)/)
})

test("a pending operator choice survives reloads and hot module replacement", () => {
  assert.match(themePreferences, /export const themeIntentStorageKey = "multideck\.theme\.intent"/)
  assert.match(themePreferences, /persistThemeIntent\(mode\)\s*setTheme\(mode\)/)
  assert.match(themePreferences, /function claimStoredThemeIntent\(userId: string\)/)
  assert.match(themePreferences, /storedIntent\.userId !== null && storedIntent\.userId !== userId/)
  assert.match(themePreferences, /if \(!latestChoice && pendingIntent\) \{\s*recordChoice\(pendingIntent\.mode\)/)
})

test("a successful profile write clears only its matching pending intent", () => {
  assert.match(themePreferences, /function clearStoredThemeIntent\(mode: ThemeMode, userId: string\)/)
  assert.match(themePreferences, /storedIntent\.mode !== mode/)
  assert.match(themePreferences, /storedIntent\.userId !== null && storedIntent\.userId !== userId/)
  assert.match(themePreferences, /window\.localStorage\.removeItem\(themeIntentStorageKey\)/)
  assert.match(themePreferences, /if \(lastPersistedTheme === mode && saveQueue === null && pendingThemeSave === null\) \{\s*clearStoredThemeIntent\(mode, userId\)\s*return/)
  assert.match(themePreferences, /updateWorkspaceBootstrapPreferences\(\{ themeMode: pending\.mode \}\)\s*clearStoredThemeIntent\(pending\.mode, pending\.userId\)/)
})

test("only a genuine account change discards this browser's choice", () => {
  // Clearing on the first resolve would drop a click made while the session
  // lookup was still in flight; not clearing at all would hand one operator's
  // choice to the next person signing in on this browser.
  assert.match(themePreferences, /if \(activeUserId !== null && activeUserId !== userId\)/)
})

test("the Multideck provider commits React theme state and CSS tokens before paint", () => {
  assert.match(themeProvider, /useLayoutEffect\(\(\) => \{/)
  assert.match(themeProvider, /const commitTheme = useCallback/)
  assert.match(themeProvider, /applyDocumentTheme\(mode\)/)
  assert.match(themeProvider, /root\.classList\.remove\("light", "dark"\)/)
  assert.match(themeProvider, /root\.classList\.add\(mode\)/)
  assert.match(themeProvider, /root\.style\.colorScheme = mode/)
  assert.match(themeProvider, /resolvedTheme: theme/)
  assert.match(themeProvider, /window\.requestAnimationFrame/)
  assert.doesNotMatch(themePreferences, /flushSync|useLayoutEffect|classList\.(?:add|remove)|style\.colorScheme/)
  assert.doesNotMatch(themePreferences, /startViewTransition/)
  assert.doesNotMatch(styles, /::view-transition-(?:old|new)\(root\)/)
  assert.match(app, /<ThemeProvider[\s\S]*?disableTransitionOnChange/)
})

test("a same-state request repairs document and React state divergence", () => {
  const setter = themeProvider.match(/const setTheme = useCallback\([\s\S]*?\n  \}, \[commitTheme\]\)/)?.[0] ?? ""
  const commit = themeProvider.match(/const commitTheme = useCallback\([\s\S]*?\n  \}, \[applyDocumentTheme, storageKey\]\)/)?.[0] ?? ""

  assert.match(setter, /commitTheme\(resolved\)/)
  assert.doesNotMatch(setter, /resolved === themeRef\.current/)
  assert.ok(commit.indexOf("themeRef.current = mode") < commit.indexOf("applyDocumentTheme(mode)"))
  assert.match(commit, /if \(stateChanged\) setThemeState\(mode\)/)
})

test("an older concurrent render cannot repaint over the latest theme choice", () => {
  const providerSetup = themeProvider.slice(
    themeProvider.indexOf("const [theme, setThemeState]"),
    themeProvider.indexOf("const applyDocumentTheme"),
  )
  const layoutCommit = themeProvider.match(/useLayoutEffect\(\(\) => \{[\s\S]*?\n  \}, \[commitTheme, theme\]\)/)?.[0] ?? ""

  assert.doesNotMatch(providerSetup, /themeRef\.current = theme/)
  assert.match(layoutCommit, /commitTheme\(themeRef\.current, \{ persist: false \}\)/)
  assert.doesNotMatch(layoutCommit, /commitTheme\(theme, /)
})

test("the provider repairs an external root-class drift without polling", () => {
  assert.match(themeProvider, /const reconcileDocumentTheme = \(\) => \{/)
  assert.match(themeProvider, /const expectedMode = readStoredTheme\(storageKey, themeRef\.current\)/)
  assert.match(themeProvider, /if \(!documentHasTheme\(expectedMode\)\) applyDocumentTheme\(expectedMode\)/)
  assert.match(themeProvider, /new MutationObserver\(reconcileDocumentTheme\)/)
  assert.match(themeProvider, /attributeFilter: \["class", "style"\]/)
  assert.match(themeProvider, /return \(\) => observer\.disconnect\(\)/)
  assert.match(themeProvider, /\}, \[applyDocumentTheme, storageKey\]\)/)
  assert.doesNotMatch(themeProvider, /setInterval/)
})

test("a stale observer follows the shared cached choice instead of its private ref", () => {
  const observer = themeProvider.match(/const reconcileDocumentTheme = \(\) => \{[\s\S]*?\n    \}/)?.[0] ?? ""

  assert.match(observer, /readStoredTheme\(storageKey, themeRef\.current\)/)
  assert.doesNotMatch(observer, /documentHasTheme\(themeRef\.current\)/)
  assert.doesNotMatch(observer, /applyDocumentTheme\(themeRef\.current\)/)
})

test("no production surface can reintroduce next-themes' passive-effect boundary", () => {
  const imports = sourceFiles(sourceRoot)
    .filter((path) => /from ["']next-themes["']/.test(readFileSync(path, "utf8")))
    .map((path) => path.slice(sourceRoot.length + 1))

  assert.deepEqual(imports, [])
})

test("the transition lock covers CSS transitions without restarting ambient animation", () => {
  assert.match(themeProvider, /style\.dataset\.mdThemeTransitionLock = "true"/)
  assert.match(themeProvider, /transition:none!important/)
  assert.doesNotMatch(themeProvider, /animation-(?:duration|delay)/)
  assert.match(themeProvider, /window\.getComputedStyle\(root\)\.color/)
})

test("profile hydration is stable across theme renders and token refreshes", () => {
  assert.match(themePreferences, /const setThemeRef = useRef\(setTheme\)/)
  assert.match(themePreferences, /hydratedUserId === userId \|\| hydratingUserId === userId/)
  assert.match(themePreferences, /\n  \}, \[\]\)\n\n  return null/)
})

test("production theme writers cannot bypass the shared flicker guard", () => {
  const directThemeWriters = sourceFiles(sourceRoot)
    .filter((path) => !path.endsWith("/lib/theme-preferences.tsx"))
    .filter((path) => {
      const source = readFileSync(path, "utf8")
      return /from ["']@\/lib\/theme-provider["']/.test(source) && /\bsetTheme\s*\(/.test(source)
    })
    .map((path) => path.slice(sourceRoot.length + 1))

  assert.deepEqual(
    directThemeWriters,
    [],
    "Call setThemeWithProfileIntent instead of setTheme so profile writes cannot bypass the shared ordering rule.",
  )
})

test("rapid toggles coalesce profile writes around the latest requested mode", () => {
  assert.match(themePreferences, /pendingThemeSave = \{ mode, userId \}/)
  assert.match(themePreferences, /while \(pendingThemeSave\)/)
  assert.match(themePreferences, /pendingThemeSave = null/)
  assert.match(themePreferences, /if \(pendingThemeSave\) saveTheme\(pendingThemeSave\.mode\)/)
  assert.match(themePreferences, /recordChoice\(mode\)\s*persistThemeIntent\(mode\)\s*setTheme\(mode\)\s*saveTheme\(mode\)/)
})

test("the profile layer records cross-tab intent without making a visual write", () => {
  assert.match(themePreferences, /event\.key !== themeStorageKey \|\| !isThemeMode\(event\.newValue\)/)
  assert.match(themePreferences, /recordChoice\(event\.newValue\)/)
  const listener = themePreferences.match(/const noteThemeFromAnotherTab = \(event: StorageEvent\) => \{[\s\S]*?\n    \}/)?.[0] ?? ""
  assert.doesNotMatch(listener, /setTheme|saveTheme/)
  assert.match(themePreferences, /window\.addEventListener\("storage", noteThemeFromAnotherTab\)/)
  assert.match(themePreferences, /window\.removeEventListener\("storage", noteThemeFromAnotherTab\)/)
})

test("cross-tab theme state uses the same layout-phase provider", () => {
  assert.match(themeProvider, /event\.key !== storageKey \|\| !isThemeMode\(event\.newValue\)/)
  assert.match(themeProvider, /commitTheme\(event\.newValue, \{ persist: false \}\)/)
  assert.match(themeProvider, /window\.addEventListener\("storage", adoptThemeFromAnotherTab\)/)
})
