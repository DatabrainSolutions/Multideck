import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const sidebar = await readFile(new URL("../src/components/multideck/app-sidebar.tsx", import.meta.url), "utf8")
const dexterStyles = await readFile(new URL("../src/dexter-transfer.css", import.meta.url), "utf8")

test("the Agent Dexter sidebar option always owns the live shader and a painted fallback", () => {
  const navItem = sidebar.slice(sidebar.indexOf("export function SidebarNavItem"), sidebar.indexOf("function SidebarSectionItem"))
  assert.match(navItem, /isDexterItem && "md-sidebar-dexter-item/)
  assert.match(navItem, /<span className="md-dexter-pill__shader" aria-hidden="true">\s*<SpectralBloomShader \/>/)
  assert.match(navItem, /<span className="md-dexter-pill__contrast" aria-hidden="true" \/>/)
  assert.match(dexterStyles, /\.md-sidebar-dexter-item \{[\s\S]*background: var\(--md-accent\) !important/)
  assert.match(dexterStyles, /\.md-dexter-pill__shader \{[\s\S]*position: absolute;[\s\S]*inset: 0;/)
  assert.match(dexterStyles, /\.md-dexter-pill__shader canvas \{[\s\S]*width: 100% !important;[\s\S]*height: 100% !important;/)
})
