import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFileSync(new URL(path, root), "utf8")

test("Paper Tray is removed from routes, navigation, shortcuts, settings and the component gallery", () => {
  const surfaces = [
    "multideck.client/src/App.tsx",
    "multideck.client/src/components/multideck/app-breadcrumbs.tsx",
    "multideck.client/src/components/multideck/app-shortcuts.tsx",
    "multideck.client/src/data/keyboard-shortcuts-data.ts",
    "multideck.client/src/data/multideck-data.ts",
    "multideck.client/src/data/navigation-data.ts",
    "multideck.client/src/i18n/translate.ts",
    "multideck.client/src/pages/components-gallery-page.tsx",
    "multideck.client/src/pages/settings-page.tsx",
  ]

  for (const surface of surfaces) {
    assert.doesNotMatch(read(surface), /paper[ -]?tray|PaperTray|paperTray/i, surface)
  }
})

test("Paper Tray implementation and bounded-read infrastructure no longer exist", () => {
  const removed = [
    "multideck.client/src/pages/paper-tray-page.tsx",
    "multideck.client/src/components/multideck/paper-tray.tsx",
    "multideck.client/src/data/paper-tray-data.ts",
    "multideck.client/benchmarks/paper-tray-initial-load.mjs",
    "supabase/migrations/20260818230000_paper_tray_bounded_read.sql",
    "supabase/tests/paper-tray-bounded-read-contract.test.mjs",
  ]

  for (const path of removed) assert.equal(existsSync(new URL(path, root)), false, path)
  assert.doesNotMatch(read("multideck.client/src/lib/application-data-api.ts"), /PaperTray|paper-tray|multideck_paper_tray_page/)
})
