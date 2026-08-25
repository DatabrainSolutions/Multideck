import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const [sidebar, menu, galleryData] = await Promise.all([
  readFile(new URL("../src/components/multideck/app-sidebar.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/multideck/sidebar-item-menu.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/data/multideck-data.ts", import.meta.url), "utf8"),
])

test("sidebar favourites are user-persisted, capped at two and fixed above Dexter", () => {
  assert.match(sidebar, /const maximumSidebarFavourites = 2/u)
  assert.match(sidebar, /useSidebarLayoutScope\(favouritesScopeId\)/u)
  assert.match(sidebar, /saveFavourites\(next\.length > 0 \? \{ order: \[\], pinned: next \} : null\)/u)
  assert.match(sidebar, /\{todoSidebarItem\}\{favouriteSidebarItems\}\{dexterSidebarItem\}/u)
  assert.match(sidebar, /favouritesScope\.pinned[\s\S]{0,160}\.slice\(0, maximumSidebarFavourites\)/u)
})

test("the right-click menu explains favourite state and the two-item limit", () => {
  assert.match(menu, /"Add to favourites"/u)
  assert.match(menu, /"Remove from favourites"/u)
  assert.match(menu, /"2 maximum"/u)
  assert.match(menu, /disabled=\{!favourite && favouriteDisabled\}/u)
})

test("the reusable sidebar menu documentation includes global favourites", () => {
  assert.match(galleryData, /Favourites stay in the fixed rail above Dexter and stop at two/u)
})
