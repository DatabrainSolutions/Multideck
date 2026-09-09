import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const editor = await readFile(new URL("../src/components/multideck/crm-pipeline-editor.tsx", import.meta.url), "utf8")
const settings = await readFile(new URL("../src/components/multideck/crm-components.tsx", import.meta.url), "utf8")

test("read-only pipeline editors remove every pipeline and stage mutation entry point", () => {
  assert.match(editor, /canEdit\?: boolean/u)
  assert.match(editor, /\{canEdit \? \([\s\S]*?PipelineTemplatesDialog/u)
  assert.match(editor, /canEdit && stage\.id === renamingStageId/u)
  assert.match(editor, /canEdit=\{canEdit\}/u)
  assert.match(editor, /\{canEdit \? \([\s\S]*?t\("Create pipeline"\)[\s\S]*?t\("Templates"\)[\s\S]*?\) : null\}/u)
  assert.match(editor, /disabled=\{!canEdit \|\| selectedIndex <= 0\}/u)
  assert.match(editor, /disabled=\{!canEdit \|\| selectedIndex >= stages\.length - 1\}/u)
  assert.match(editor, /<TonePicker disabled=\{!canEdit\}/u)
  assert.match(editor, /<ProbabilityTrack[\s\S]*?disabled=\{!canEdit\}/u)
  assert.match(editor, /disabled=\{!canEdit\}[\s\S]*?selectedStage\.rule/u)
  assert.match(editor, /function updatePipeline\([\s\S]*?if \(!canEdit\) return/u)
  assert.match(editor, /function updateStage\([\s\S]*?if \(!canEdit\) return/u)
  assert.match(editor, /if \(!canEdit\) return[\s\S]*?function moveStage/u)
  assert.match(editor, /if \(!canEdit\) return[\s\S]*?function insertStage/u)
  assert.match(editor, /if \(!canEdit\) return[\s\S]*?function duplicateStage/u)
  assert.match(editor, /if \(!canEdit\) return[\s\S]*?function removeStage/u)
  assert.match(editor, /if \(!canEdit\) return[\s\S]*?function createPipeline/u)
  assert.match(editor, /if \(!canEdit\) return[\s\S]*?async function saveChanges/u)
  assert.match(editor, /if \(!canEdit\) return[\s\S]*?async function deletePipeline/u)
  assert.match(editor, /if \(!canEdit\) return[\s\S]*?async function movePipeline/u)
})

test("read-only Settings users cannot change deal-card field preferences from the CRM settings surface", () => {
  assert.match(settings, /function toggleDealCardField\(key: DealCardFieldKey\) \{\s*if \(!canEdit\) return/u)
  assert.match(settings, /<Button[\s\S]*?disabled=\{!canEdit\}[\s\S]*?t\("Choose fields"\)/u)
  assert.match(settings, /disabled=\{!canEdit \|\| \(!checked && dealCardFields\.length >= dealCardFieldLimit\)\}/u)
  assert.match(settings, /disabled=\{!canEdit \|\| dealCardFields\.length === 1\}/u)
})
