import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(path, import.meta.url), "utf8")
const [adminPage, workflowApi, aiPromptMorph, broadcastSettings, galleryPage, galleryData] = await Promise.all([
  read("../src/pages/admin-page.tsx"),
  read("../src/lib/quote-workflow-api.ts"),
  read("../src/components/multideck/ai-prompt-morph.tsx"),
  read("../src/components/multideck/broadcast-settings.tsx"),
  read("../src/pages/components-gallery-page.tsx"),
  read("../src/data/multideck-data.ts"),
])

test("reference recipes hide implementation syntax behind readable tags", () => {
  assert.match(adminPage, /function referenceRecipeChunks/)
  assert.match(adminPage, /t\("Reference recipe"\)/)
  assert.match(adminPage, /t\("digit number"\)/)
  assert.match(adminPage, /replaceReferenceRecipeLiteral/)
  assert.doesNotMatch(adminPage, /<Input[\s\S]{0,200}value=\{pattern\}/)
  assert.doesNotMatch(adminPage, /Available rule parts/)
  assert.doesNotMatch(adminPage, /\{"\{NUMBER:/)
})

test("default quote, customer and booking prefixes stay visible while numbers use four-digit padding", () => {
  assert.match(adminPage, /useState\("CUS\{NUMBER:4\}"\)/)
  assert.match(adminPage, /defaultPattern: "B-\{NUMBER:4\}"/)
  assert.match(adminPage, /trimmed\.replace\(\/\\\{\(NUMBER\|LETTERS\)\\\}\/g, "\{\$1:4\}"\)/)
  assert.match(adminPage, /counterKey: "quote", title: "Quote references"/)
  assert.match(adminPage, /counterKey: "customer", title: "Customer references"/)
  assert.match(adminPage, /title: index === 0 \? "Booking references"/)
})

test("booking references use the same simple rule row as quotes and customers", () => {
  assert.match(adminPage, /bookingPatterns\.map\(\(item, index\) =>/)
  assert.match(adminPage, /title: index === 0 \? "Booking references"/)
  assert.doesNotMatch(adminPage, /const addBookingPattern = \(\) =>/)
  assert.doesNotMatch(adminPage, /onClick=\{addBookingPattern\}/)
  assert.doesNotMatch(adminPage, /onTitleChange/)
})

test("next sequence values are locked behind a keyboard-accessible duplicate warning", () => {
  assert.match(adminPage, /LockKeyIcon as LockKeyholeIcon/)
  assert.match(adminPage, /<HugeiconsIcon icon=\{LockKeyholeIcon\}/)
  assert.match(adminPage, /event\.key === "Enter" \|\| event\.key === " "/)
  assert.match(adminPage, /t\("Change the next value\?"\)/)
  assert.match(adminPage, /t\("Unlock value"\)/)
  assert.match(adminPage, /setUnlockedCounters/)
})

test("the shared custom-rule control uses a stable slot transition and collapses after an accepted rule", () => {
  assert.match(adminPage, /<AiPromptMorph/)
  assert.match(broadcastSettings, /<AiPromptMorph/)
  assert.match(aiPromptMorph, /mode="wait"/)
  assert.doesNotMatch(aiPromptMorph, /animate=\{\{ width:/)
  assert.doesNotMatch(aiPromptMorph, /filter: "blur/)
  assert.match(aiPromptMorph, /aria-expanded=\{open\}/)
  assert.match(aiPromptMorph, /onClick=\{\(\) => onOpenChange\(!open\)\}/)
  assert.match(aiPromptMorph, /showTriggerLabel \? <span>/)
  assert.match(aiPromptMorph, /<motion\.form[\s\S]*?<DexterActionPill[\s\S]*?type="submit"/)
  assert.match(aiPromptMorph, /SentIcon as SendHorizontalIcon/)
  assert.match(aiPromptMorph, /icon=\{SendHorizontalIcon\}/)
  assert.match(adminPage, /key="reference-fields"/)
  assert.match(adminPage, /exit=\{\{ opacity: 0, y: reduceMotion \? 0 : -48 \}\}/)
  assert.match(adminPage, /showTriggerLabel/)
  assert.match(adminPage, /className="absolute inset-x-0 bottom-0 max-w-none md:bottom-auto md:top-\[22px\]"/)
  assert.match(adminPage, /setRuleProgress\("working"\)/)
  assert.match(adminPage, /setRuleProgress\("crafting"\)/)
  assert.match(adminPage, /draft\.status === "accepted" && draft\.pattern/)
  assert.match(adminPage, /applyReferencePattern\(rule, draft\.pattern\)/)
  assert.match(adminPage, /setActiveRuleKey\(null\)/)
  assert.match(adminPage, /useReducedMotion\(\)/)
  assert.match(aiPromptMorph, /useReducedMotion\(\)/)
  assert.match(workflowApi, /action: "draft-reference-rule"/)
  assert.match(galleryPage, /id === "ai-prompt-morph"/)
  assert.match(galleryData, /id: "ai-prompt-morph"/)
  assert.match(galleryData, /route: "\/admin\/broadcast"/)
  assert.match(galleryData, /route: "\/admin\/system-preferences"/)
})

test("the picker chooses one numeric or alphabetic continuous sequence", () => {
  assert.match(adminPage, /function setReferenceCounterFormat/)
  assert.match(adminPage, /function formatReferenceLetters/)
  assert.match(adminPage, /value=\{`\$\{chunk\.token\}:\$\{chunk\.width \?\? 1\}`\}/)
  assert.match(adminPage, /token: "NUMBER", width: 4/)
  assert.match(adminPage, /token: "NUMBER", width: 7/)
  assert.match(adminPage, /token: "LETTERS", width: 5/)
  assert.match(adminPage, /token: "LETTERS", width: 7/)
  assert.match(adminPage, /\["4", "5", "6", "7"\]\.includes\(widthValue\)/)
  assert.match(adminPage, /NUMBER\|LETTERS/)
  assert.doesNotMatch(adminPage, /No letter code/)
  assert.doesNotMatch(adminPage, /data-reference-letter-code/)
  assert.match(adminPage, /t\("Restore default"\)/)
})

test("unsafe recipes require exactly one continuous sequence", () => {
  assert.match(adminPage, /counterTokens\.length !== 1/)
  assert.match(adminPage, /Every reference rule needs one continuous sequence\./)
})

test("directional booking recipes keep the visible recipe while supporting Import and Export", async () => {
  const migration = await read("../../supabase/migrations/20260826110000_directional_quote_booking_references.sql")
  assert.match(adminPage, /DIRECTION/u)
  assert.match(adminPage, /chunk\.token === "DIRECTION"[\s\S]*t\("Direction"\)[\s\S]*t\("first"\)/u)
  assert.match(migration, /\{DIRECTION(?::[0-9]{1,2})?\}/u)
  assert.match(migration, /when 'import' then 'I'/u)
  assert.match(migration, /when 'export' then 'E'/u)
  assert.match(migration, /booking_api\.allocate_reference\(company_id, 'default', direction_code\)/u)
  assert.match(migration, /facts->>'quoteType'/u)
  assert.match(migration, /Job_BookingReferenceSequenceKey/u)
  assert.match(migration, /J\{DIRECTION:1\}\{NUMBER:7\}/u)
})
