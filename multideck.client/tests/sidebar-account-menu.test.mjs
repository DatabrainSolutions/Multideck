import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const sidebar = await readFile(new URL("../src/components/multideck/app-sidebar.tsx", import.meta.url), "utf8")
const accountMenu = sidebar.slice(sidebar.indexOf("<Popover open={accountMenuOpen}"), sidebar.indexOf("</Popover>", sidebar.indexOf("<Popover open={accountMenuOpen}")))
const buttons = [...accountMenu.matchAll(/<button\b[\s\S]*?<\/button>/g)].map(([button]) => button)
const signOut = buttons.find((button) => button.includes('t("Sign out")'))
const settings = buttons.find((button) => button.includes('t("Account settings")'))

test("account settings is the bottom action nearest the profile trigger, not sign out", () => {
  assert.ok(signOut)
  assert.ok(settings)
  assert.equal(buttons.at(-1), settings)
  assert.ok(accountMenu.indexOf(signOut) < accountMenu.indexOf('t("Usage")'))
  assert.ok(accountMenu.indexOf(signOut) < accountMenu.indexOf('t("Support")'))
  assert.ok(accountMenu.indexOf(signOut) < accountMenu.indexOf("<ThemeToggle"))
  assert.ok(accountMenu.indexOf(settings) > accountMenu.indexOf("<ThemeToggle"))
})

test("reordering preserves the real handlers and distinct sign-out styling", () => {
  assert.match(signOut, /setAccountMenuOpen\(false\)/)
  assert.match(signOut, /supabase\?\.auth\.signOut\(\)/)
  assert.match(signOut, /<LogOut/)
  assert.match(signOut, /text-\[var\(--md-red\)\]/)
  assert.match(settings, /setAccountMenuOpen\(false\)/)
  assert.match(settings, /openSettingsSection\("profile"\)/)
  assert.match(settings, /<Settings/)
  assert.doesNotMatch(settings, /signOut\(/)
})

test("settings keeps its customer restriction without hiding sign out", () => {
  const restriction = accountMenu.indexOf("{!isCustomer ? <>")
  assert.ok(restriction > accountMenu.indexOf(signOut))
  assert.ok(restriction < accountMenu.indexOf(settings))
  assert.match(accountMenu.slice(restriction), /<\/button>\s*<\/> : null\}/)
})
