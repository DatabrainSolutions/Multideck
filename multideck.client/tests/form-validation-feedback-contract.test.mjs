import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8")
}

const [
  styles,
  feedbackHook,
  input,
  textarea,
  select,
  checkbox,
  switchControl,
  auth,
  bookingWizard,
  customs,
  translations,
] = await Promise.all([
  source("src/styles.css"),
  source("src/components/ui/use-invalid-feedback.ts"),
  source("src/components/ui/input.tsx"),
  source("src/components/ui/textarea.tsx"),
  source("src/components/ui/select.tsx"),
  source("src/components/ui/checkbox.tsx"),
  source("src/components/ui/switch.tsx"),
  source("src/components/multideck/auth-flow.tsx"),
  source("src/pages/booking-wizard-page.tsx"),
  source("src/pages/customs-declarations-page.tsx"),
  source("src/i18n/translate.ts"),
])

test("shared controls replay one-shot invalid feedback without animating initial render", () => {
  assert.match(feedbackHook, /const wasInvalid = React\.useRef\(invalid\)/u)
  assert.match(feedbackHook, /invalid && !wasInvalid\.current/u)

  for (const control of [input, textarea, select, checkbox, switchControl]) {
    assert.match(control, /useInvalidFeedback/u)
    assert.match(control, /data-invalid-feedback=\{invalidFeedback\}/u)
    assert.match(control, /invalidFeedbackMotion\?: boolean/u)
  }
})

test("invalid styling is persistent while motion is short and reduced-motion safe", () => {
  assert.match(styles, /\[aria-invalid="true"\]/u)
  assert.match(styles, /:user-invalid/u)
  assert.match(styles, /\[data-field-invalid="true"\]/u)
  assert.match(styles, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*180ms ease-out/u)
  assert.doesNotMatch(styles, /md-field-invalid-nudge[^}]*infinite/u)
})

test("authentication errors identify fields without revealing which credential failed", () => {
  assert.match(auth, /aria-describedby=\{emailError \? emailErrorId : undefined\}/u)
  assert.match(auth, /aria-describedby=\{passwordError \? passwordErrorId : undefined\}/u)
  assert.match(auth, /Email or password is incorrect\. Check both and try again\./u)
  assert.match(auth, /isInvalidCredentialsError\(passwordError\)/u)
  assert.match(auth, /showFieldError\("email", "Enter a valid work email\."/u)
  assert.match(auth, /showFieldError\("password", "Enter your password to continue\."/u)
  assert.match(auth, /focusAuthControl\(controlId\)/u)
})

test("wizard validation uses the same field marker and focuses the first missing field", () => {
  assert.match(bookingWizard, /data-field-invalid=\{missing \|\| undefined\}/u)
  assert.match(bookingWizard, /This field is required\./u)
  assert.match(bookingWizard, /setFocusFieldLabel\(missingCurrent\[0\]\)/u)
  assert.match(customs, /SelectTrigger aria-invalid=\{invalid \|\| undefined\}/u)
})

test("new validation guidance is localised including Arabic", () => {
  for (const phrase of [
    "Enter a valid work email.",
    "Email or password is incorrect. Check both and try again.",
    "Unable to sign you in right now. Check your connection and try again.",
    "This field is required.",
  ]) {
    const entry = translations.slice(translations.indexOf(`\"${phrase}\"`), translations.indexOf(`\"${phrase}\"`) + 500)
    assert.match(entry, /de:/u)
    assert.match(entry, /fr:/u)
    assert.match(entry, /ar:/u)
  }
})
