import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/components/multideck/lifecycle-notes.tsx', import.meta.url), 'utf8')

test('notes keep the composer explicit without the repeated introduction or empty stage', () => {
  assert.doesNotMatch(source, /Notes added earlier in the journey|grid min-h-36|rounded-\[26px\]/)
  assert.match(source, /aria-label=\{t\("Write a note"\)\}/)
  assert.match(source, /Type @ to notify a person or department by email/)
  assert.match(source, /sendShortcut="mod-enter"/)
})

test('confirmed additions animate alone and respect reduced motion', () => {
  assert.match(source, /note.id === addedNoteId \? "motion-safe:animate-in/)
  assert.match(source, /motion-safe:duration-200/)
  assert.match(source, /motion-reduce:transition-none/)
  assert.match(source, /window.cancelAnimationFrame\(scrollFrameRef.current\)/)
})

test('submission locks synchronously and preserves newer drafts', () => {
  assert.match(source, /savingRef.current \|\| !canWrite\) return\s+savingRef.current = true/)
  assert.match(source, /draftRevisionRef.current === submittedRevision/)
  assert.match(source, /finally \{\s+savingRef.current = false\s+setSaving\(false\)/)
})

test('all lifecycle entry points retain the shared notes implementation', () => {
  for (const path of ['pages/quotes-page.tsx', 'components/multideck/booking-components.tsx', 'pages/customs-declarations-page.tsx']) {
    const page = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
    assert.match(page, /<LifecycleNotes/)
  }
})
