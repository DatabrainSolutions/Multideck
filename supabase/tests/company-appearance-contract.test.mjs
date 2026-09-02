import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")

const migration = await read("../migrations/20260901233000_company_accent_preference.sql")
const sharedBrand = await read("../functions/_shared/tenant-branding.ts")
const companyAppearance = await read("../../multideck.client/src/lib/company-appearance.ts")
const accentTheme = await read("../../multideck.client/src/lib/accent-theme.ts")
const accentPicker = await read("../../multideck.client/src/components/multideck/accent-picker.tsx")
const sidebar = await read("../../multideck.client/src/components/multideck/app-sidebar.tsx")
const settings = await read("../../multideck.client/src/pages/settings-page.tsx")
const gallery = await read("../../multideck.client/src/data/multideck-data.ts")

test("company is a bounded authenticated profile accent preference", () => {
  assert.match(migration, /'fuchsia',\s*'company'/)
  assert.match(migration, /v_auth_user_id uuid := auth\.uid\(\)/)
  assert.match(migration, /where "Auth_User_ID" = v_auth_user_id/)
  assert.match(migration, /revoke all on function public\.set_current_user_accent_preference\(text\) from public, anon/)
  assert.match(migration, /grant execute on function public\.set_current_user_accent_preference\(text\) to authenticated/)
})

test("the company choice uses a complete saved Admin brand with an initials fallback when its logo is absent", () => {
  assert.match(sharedBrand, /configured: settings\.version === 1/)
  assert.match(companyAppearance, /brand\.configured === true/)
  assert.match(companyAppearance, /typeof brand\.configured === "undefined"/)
  assert.match(companyAppearance, /typeof brand\.brandId === "string"/)
  assert.match(companyAppearance, /typeof brand\.updatedAt === "string"/)
  assert.match(companyAppearance, /typeof brand\.displayName === "string"/)
  assert.match(companyAppearance, /isHex\(brand\.primaryColor\)/)
  assert.match(companyAppearance, /isHex\(brand\.secondaryColor\)/)
  assert.match(companyAppearance, /export function companyAppearanceInitials/)
  assert.match(companyAppearance, /import\.meta\.env\.DEV && state\.brand/)
  assert.match(accentPicker, /companyAppearance\.brand \? \[/)
  assert.match(accentPicker, /label: `\$\{companyAppearance\.brand\.displayName\} theme`/)
  assert.match(accentPicker, /\] : accentPresets/)
})

test("company colours stay readable and an invalidated brand falls back to Multideck teal", () => {
  assert.match(accentTheme, /const darkAccent = derive\(primary, \{ l: 0\.82, c: 0\.72 \}\)/)
  assert.match(accentTheme, /accentInk: readableInk\(primaryHex\)/)
  assert.match(accentTheme, /accentInk: readableInk\(darkAccent\)/)
  assert.match(accentTheme, /company\.status === "unavailable"[\s\S]*applySavedAccent\(defaultAccentPresetId\)/)
  assert.match(accentTheme, /saveRemoteAccent\(defaultAccentPresetId\)/)
})

test("the expanded sidebar keeps company and Multideck identities inside the control-safe header", () => {
  assert.match(sidebar, /accentPreferenceId === companyAccentPreferenceId/)
  assert.match(sidebar, /activeCompanyBrand\.displayName}, with Multideck/)
  // The bounded intrinsic-width logo leaves room for the separator and product
  // mark in the 144px lockup; both adjacent controls keep their own 36px slots.
  assert.match(sidebar, /h-7 w-auto max-w-\[104px\] shrink-0 object-contain/)
  assert.match(sidebar, /flex min-w-0 flex-1 items-center gap-1\.5 overflow-hidden/)
  assert.match(sidebar, /size-5 shrink-0 object-contain/)
  assert.match(sidebar, /src=\{multideckLogoMark\}[^\n]*dark:brightness-0 dark:invert/)
  assert.match(sidebar, />×<\/span>/)
  assert.match(sidebar, /multideckLogoMark/)
  assert.match(sidebar, /companyAppearanceInitials\(activeCompanyBrand\.displayName\)/)
  assert.match(sidebar, /size-9 shrink-0 rounded-full/)
})

test("the company preview logo keeps a light backing in dark mode", () => {
  // Literal bg-white utilities are remapped to dark surfaces by the legacy
  // dark-mode rules; the colour token preserves the imported logo's contrast.
  assert.match(accentPicker, /h-4 w-\[76px\].*bg-\[var\(--color-white\)\]/)
  assert.match(accentPicker, /h-3 w-full object-contain object-left/)
})

test("Customisation and the component gallery explain the optional company treatment", () => {
  assert.match(settings, /when Admin Branding is complete, your company identity/)
  assert.match(gallery, /id: "accent-picker"/)
  assert.match(gallery, /compact initials mark as the safe fallback/)
  assert.ok(gallery.includes('label: \\`\\${company.brand.displayName} theme\\`'), "gallery source must preserve the company theme label in its escaped code sample")
  assert.match(gallery, /route: "\/settings\?tab=customisation"/)
})
