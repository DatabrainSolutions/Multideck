import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const [app, controller, statusPill, styles, settings, shortcuts, shortcutPanel, galleryData, galleryPage] = await Promise.all([
  read("../src/App.tsx"),
  read("../src/components/multideck/dictation-controller.tsx"),
  read("../src/components/multideck/dictation-status-pill.tsx"),
  read("../src/styles.css"),
  read("../src/pages/settings-page.tsx"),
  read("../src/data/keyboard-shortcuts-data.ts"),
  read("../src/components/multideck/keyboard-shortcuts-panel.tsx"),
  read("../src/data/multideck-data.ts"),
  read("../src/pages/components-gallery-page.tsx"),
])

test("dictation is mounted once across authenticated workspace routes", () => {
  assert.match(app, /<DictationController \/>/)
  assert.match(controller, /dictatableInputTypes/)
  assert.match(controller, /textarea/)
  assert.match(controller, /contenteditable='true'/)
  assert.match(controller, /data-dictation='off'/)
})

test("dictation is push-to-talk with no field icon or pause control", () => {
  assert.match(controller, /window\.addEventListener\("keyup", release/)
  assert.match(controller, /holdActiveRef/)
  assert.match(controller, /releaseEndsBinding/)
  assert.match(controller, /phase === "idle"/)
  assert.doesNotMatch(controller, /md-dictation-field-button|<button|Pause|<Square|<Microphone/)
  assert.doesNotMatch(styles, /md-dictation-field-button/)
  assert.doesNotMatch(controller, /getBoundingClientRect|ResizeObserver|md-dictation-field-overlay/)
  assert.doesNotMatch(styles, /md-dictation-field-overlay|md-dictation-wave/)
  assert.match(controller, /md-dictation-status-dock/)
  assert.match(settings, /hold the shortcut while speaking\. Release it to transcribe\./i)
})

test("stale microphone permission responses cannot hijack a newer hold", () => {
  assert.match(controller, /holdAttemptRef/)
  assert.match(controller, /attempt !== holdAttemptRef\.current/)
  assert.match(controller, /stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/)
  assert.match(controller, /holdAttemptRef\.current \+= 1/)
})

test("the shortcut recorder keeps simultaneous key capture synchronous", () => {
  assert.match(shortcutPanel, /stepsRef\.current = \[step\]/)
  assert.match(shortcutPanel, /callbacksRef\.current = \{ onStepsChange, onCommit, onCancel \}/)
  assert.match(shortcutPanel, /heldKeysRef\.current\.has\(previous\[0\]\.key\)/)
  assert.match(shortcutPanel, /combineShortcutSteps\(previous\[0\], step\)/)
})

test("the Figma status pill is bottom-centred and morphs one set of shapes through every state", () => {
  assert.match(statusPill, /type DictationStatusPhase = "transcribing" \| "polishing" \| "complete" \| "error"/)
  assert.match(statusPill, /transcribing: 181/)
  assert.match(statusPill, /polishing: 134/)
  assert.match(statusPill, /complete: 149/)
  assert.match(statusPill, /shapeIds\.map/)
  assert.match(statusPill, /shapeTarget\(index, phase/)
  assert.match(statusPill, /useReducedMotion/)
  assert.match(statusPill, /phase === "error" \? "alert" : "status"/)
  assert.doesNotMatch(statusPill, /DotLottieReact|Renderer|Program|Mesh|fragmentShader|vertexShader|WebGL/)
  assert.match(styles, /\.md-dictation-status-dock[\s\S]*position: fixed/)
  assert.match(styles, /inset-inline: 0[\s\S]*justify-content: center/)
  assert.match(styles, /\.md-dictation-status-pill[\s\S]*height: 38px/)
  assert.match(styles, /border-radius: 19px/)
  assert.match(styles, /data-state="error"[\s\S]*var\(--md-red\)[\s\S]*#fecaca/)
  assert.match(controller, /setTimeout\(\(\) => \{[\s\S]*4_000/)
  assert.match(controller, /No clear audio detected/)
  assert.doesNotMatch(controller, /toast\.error/)
})

test("Dexter settings expose microphone, shortcut and private custom vocabulary controls", () => {
  assert.match(settings, /title=\{t\("Writing preferences"\)\}/)
  assert.match(settings, /title=\{t\("Voice and transcription"\)\}/)
  assert.match(settings, /title=\{t\("Privacy and control"\)\}/)
  assert.doesNotMatch(settings, /dexter-preference-marker|scrollIntoView|DexterSettingsLinkRow/)
  assert.match(settings, /function DexterFieldGroup/)
  assert.match(settings, /grid gap-x-6 gap-y-7 px-5 py-5 md:grid-cols-2/)
  assert.match(settings, /md:grid-cols-2 lg:grid-cols-3/)
  assert.doesNotMatch(settings, /Eligible history|Eligible messages|Last refreshed/)
  assert.match(settings, /System default/)
  assert.match(settings, /addEventListener\?\.\("devicechange"/)
  assert.doesNotMatch(settings, /Refresh microphones/)
  assert.match(settings, /Writing profile updates/)
  assert.match(settings, /Update from sent emails/)
  assert.doesNotMatch(settings, /Profile status/)
  assert.match(settings, /Custom dictionary/)
  assert.match(settings, /Saved privately to your profile/)
  assert.match(settings, /No recording history/)
  assert.match(shortcuts, /id: "dictation\.toggle"[\s\S]*defaultBinding: chord\("Fn"\)/)
})

test("the reusable dictation status pill is documented and previewed in the components gallery", () => {
  assert.match(galleryData, /id: "dictation-status-pill"/)
  assert.match(galleryData, /Dexter voice settings/)
  assert.match(galleryPage, /id === "dictation-status-pill"/)
  assert.match(galleryPage, /<DictationStatusPill[\s\S]*phase=\{previewDictationPhase\}[\s\S]*No clear audio detected/)
})
