import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import ts from "typescript"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")
const editor = read("../src/pages/booking-links-page.tsx")
const page = read("../src/pages/public-booking-page.tsx")
const builder = read("../src/components/multideck/booking-link-builder.tsx")
const ast = ts.createSourceFile("public-booking-page.tsx", page, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const nodes = []
function visit(node) { nodes.push(node); ts.forEachChild(node, visit) }
visit(ast)

test("the editor uses a centred, scroll-contained dialog with separate form and preview regions", () => {
  assert.doesNotMatch(editor, /SideDrawer/)
  assert.match(editor, /<DialogContent/)
  assert.match(editor, /max-h-\[calc\(100dvh-2rem\)\]/)
  assert.match(editor, /overflow-y-auto overscroll-contain/)
  assert.match(editor, /aria-label="Form settings"/)
  assert.match(editor, /aria-label="Live booking form preview"/)
  assert.match(editor, /onCloseAutoFocus[\s\S]*restoreFocusTo\.focus/)
  assert.match(editor, /showCloseButton=\{!saving\}/)
})

test("live draft values use the actual public form and only saved company branding", () => {
  assert.match(editor, /getTenantBranding\(session\.access_token\)/)
  assert.match(editor, /setBrand\(saved\.configured \? saved : null\)/)
  assert.match(editor, /<PublicBookingPage[\s\S]*preview=\{\{ title:[\s\S]*durationMinutes: Number\(duration\), provider, location, questions/)
  assert.match(editor, /brandError[\s\S]*Your form changes are still here/)
  assert.match(editor, /setBrandAttempt\(\(attempt\) => attempt \+ 1\)/)
  assert.match(page, /const booking = preview \?\? loadedBooking/)
  assert.match(page, /publicBrandTheme\(brand\)/)
  assert.doesNotMatch(editor, /loadCompanyAppearance|pendingImport|localStorage|matchMedia/)
})

test("preview effects cannot fetch public bookings, availability or start refreshes", () => {
  const effects = nodes.filter((node) => ts.isCallExpression(node) && node.expression.getText(ast) === "useEffect")
  for (const api of ["getPublicBooking", "getPublicBookingSlots", "startPublicBrandRefresh"]) {
    const matching = effects.filter((effect) => effect.arguments[0]?.getText(ast).includes(`${api}(`))
    assert.ok(matching.length, `Find effect containing ${api}`)
    for (const effect of matching) {
      const first = effect.arguments[0].body.statements[0]
      assert.ok(ts.isIfStatement(first))
      assert.match(first.getText(ast), /^if \(isPreview(?: \|\|[^)]*)?\) return$/)
      assert.match(effect.arguments[1].getText(ast), /isPreview/)
    }
  }
})

test("all booking actions return before doing work in preview mode", () => {
  for (const name of ["holdTime", "verify", "resend", "checkFinalisation", "backToTimes"]) {
    const fn = nodes.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name)
    assert.ok(fn, name)
    assert.equal(fn.body.statements[0].getText(ast), "if (isPreview) return")
  }
  assert.match(page, /disabled=\{submitting \|\| isPreview\}/)
  assert.match(page, /autoFocus=\{!isPreview\}/)
  assert.match(page, /Preview only\. No time is held and no email is sent\./)
})

test("custom question controls respond to their column width, not the full browser width", () => {
  assert.match(builder, /@container grid gap-3/)
  assert.match(builder, /@min-\[540px\]:grid-cols-/)
  assert.doesNotMatch(builder, /sm:grid-cols-\[auto_minmax\(0,1fr\)_128px_auto_auto\]/)
})
