import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const pageSource = await readFile(new URL("../src/pages/agent-dexter-page.tsx", import.meta.url), "utf8")
const apiSource = await readFile(new URL("../src/lib/dexter-api.ts", import.meta.url), "utf8")
const composerSource = await readFile(new URL("../src/components/multideck/agent-dexter-components.tsx", import.meta.url), "utf8")
const sidebarSource = await readFile(new URL("../src/components/multideck/app-sidebar.tsx", import.meta.url), "utf8")
const iconSource = await readFile(new URL("../src/components/icons/hugeicons.tsx", import.meta.url), "utf8")

test("optimistic sends retain a recoverable draft and never submit local branch ids", () => {
  assert.match(pageSource, /setActiveConversation\(pendingConversation\)[\s\S]*setComposerValue\(""\)/u)
  assert.match(pageSource, /persistedDexterMessageIds\(previousBranchMessages\)/u)
  assert.match(pageSource, /setActiveConversation\(conversation\)/u)
  assert.doesNotMatch(pageSource, /retainStreamingAssistantId/u)
  assert.match(pageSource, /messages: base\.messages\.filter\(\(item\) => item\.id !== assistantStreamMessage\.id\)/u)
  assert.match(pageSource, /setFailedPrompt\(\{[\s\S]*input: requestInput[\s\S]*draft,/u)
  assert.match(pageSource, /setComposerValue\(\(current\) => current\.trim\(\) \? current : draft\.value\)/u)
  assert.doesNotMatch(pageSource, /historyMessageIds: previousBranchMessages\.map\(dexterMessageServerId\)/u)
})

test("request ownership, cancellation, timeout and explicit recovery remain bounded", () => {
  assert.match(pageSource, /promptSubmissionInFlightRef\.current = true/u)
  assert.match(pageSource, /activePromptAbortControllerRef\.current\?\.abort\(\)/u)
  assert.match(pageSource, /onRetryError=\{failedPrompt/u)
  assert.match(pageSource, /onDismissError=\{\(\) => \{/u)
  assert.match(apiSource, /const DEXTER_STREAM_TIMEOUT_MS = 120_000/u)
  assert.match(apiSource, /response\.status === 401[\s\S]*supabase\.auth\.refreshSession\(\)/u)
  assert.match(apiSource, /Your message is safe — retry when you are ready\./u)
  assert.match(apiSource, /error instanceof TypeError/u)
})

test("the thread follows the latest message and the composer reserves only its measured height", () => {
  assert.match(pageSource, /<MessageScroller\.Provider[\s\S]*autoScroll/u)
  assert.match(pageSource, /style=\{\{ paddingBottom: composerInset \+ 24 \}\}/u)
  assert.match(pageSource, /pb-\[max\(var\(--md-page-stack-gap\),env\(safe-area-inset-bottom\)\)\]/u)
  assert.match(pageSource, /h-\[100dvh\] min-h-0/u)
  assert.match(composerSource, /className="ms-auto flex shrink-0 items-center gap-2"[\s\S]*<DexterAccessModeToggle[\s\S]*<DexterActionPill/u)
})

test("the access selector changes width with its visible label without exposing both labels", () => {
  assert.match(composerSource, /md-composer-chip inline-flex h-9 w-fit[^\n]*rounded-full/u)
  assert.match(composerSource, /layout="size"/u)
  assert.match(composerSource, /const label = isFullAccess \? fullAccessLabel : approveLabel/u)
  assert.match(composerSource, /<span className="shrink-0 whitespace-nowrap leading-5" aria-hidden="true">[\s\S]*\{label\}/u)
  assert.match(composerSource, /aria-label=\{`\$\{label\}\. \$\{description\}`\}/u)
  assert.doesNotMatch(composerSource, /labelWidths/u)
  assert.doesNotMatch(composerSource, /reservedLabelWidth/u)
})

test("attempt navigation belongs to the user prompt and only changes the paired response", () => {
  assert.match(pageSource, /aria-label=\{`\$\{t\("Attempt version"\)\}/u)
  assert.match(pageSource, /onSelectResponse\(message\.id, previous\.id\)/u)
  assert.match(pageSource, /onSelectResponse\(message\.id, next\.id\)/u)
  assert.doesNotMatch(pageSource, /function assistantMessageView\([\s\S]{0,500}versionCount/u)
})

test("conversation rename uses the shared rounded Hugeicons pencil adapter", () => {
  assert.match(iconSource, /PencilEdit01Icon as PencilEdit01IconData/u)
  assert.match(iconSource, /export const PencilEdit01 = createMultideckIcon\(PencilEdit01IconData/u)
  assert.match(sidebarSource, /aria-label=\{t\(confirmingDeleteId === conversation\.id \? "Cancel delete" : "Rename conversation"\)\}/u)
  assert.match(sidebarSource, /<PencilEdit01/u)
  assert.doesNotMatch(sidebarSource, /<Pencil\b/u)
})
