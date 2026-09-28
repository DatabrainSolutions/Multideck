import assert from "node:assert/strict"
import test from "node:test"
import { sidebarNavigationIndex, searchSidebarNavigation } from "../src/lib/sidebar-navigation-search.ts"
import type { AdminHub, SidebarArea } from "../src/data/navigation-data.ts"

const icon = (() => null) as SidebarArea["icon"]
const operations: SidebarArea = { id: "operations", label: "Operations", icon, destinations: [
  { id: "bookings", label: "Bookings", icon, children: [
    { label: "All bookings", icon, route: "/bookings" },
    { label: "Planned feature", icon },
  ] },
] }
const hub: AdminHub = { id: "finance", label: "Finance", icon, route: "/admin/finance", description: "", display: "hub", blocks: [
  { id: "documents", title: "Documents", icon, description: "", links: [
    { label: "Payment terms", route: "/finance/documents", keywords: "settlement" },
    { label: "Document numbering", route: "/finance/documents" },
  ] },
] }

test("search only indexes allowed navigation, including customer areas and limited Admin access", () => {
  const entries = sidebarNavigationIndex([operations], [hub])
  assert.equal(searchSidebarNavigation(entries, "finance").length, 0)
  assert.equal(searchSidebarNavigation(entries, "planned").length, 0)
  const limitedAdmin: SidebarArea = { id: "administration", label: "Admin", icon, destinations: [{ id: "signatures", label: "Email signatures", icon, route: "/admin/email-signatures" }] }
  const limited = sidebarNavigationIndex([limitedAdmin], [hub])
  assert.equal(searchSidebarNavigation(limited, "payment").length, 0)
  assert.equal(searchSidebarNavigation(limited, "signatures")[0].route, "/admin/email-signatures")
})

test("ranks page names before context matches and supports multiple words, punctuation and accents", () => {
  const entries = sidebarNavigationIndex([operations], [], [{ label: "Résumé", icon, route: "/resume" }])
  assert.equal(searchSidebarNavigation(entries, "bookings")[0].label, "Bookings")
  assert.equal(searchSidebarNavigation(entries, "OPERATIONS / all bookings")[0].route, "/bookings")
  assert.equal(searchSidebarNavigation(entries, "resume")[0].route, "/resume")
  assert.deepEqual(searchSidebarNavigation(entries, "   "), [])
  assert.deepEqual(searchSidebarNavigation(entries, "unknown-page"), [])
})

test("nested Admin results preserve distinct settings on the same route and their navigation context", () => {
  const area: SidebarArea = { id: "administration", label: "Admin", icon, destinations: [{ id: "admin-finance", label: "Finance", icon, route: "/admin/finance" }] }
  const entries = sidebarNavigationIndex([area], [hub])
  const results = searchSidebarNavigation(entries, "finance documents")
  assert.equal(results.length, 2)
  assert.notEqual(results[0].id, results[1].id)
  const payment = searchSidebarNavigation(entries, "settlement")[0]
  assert.equal(payment.adminSetting?.hubId, "finance")
  assert.equal(payment.adminSetting?.link.label, "Payment terms")
})
