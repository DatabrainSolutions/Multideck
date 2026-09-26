import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const source = readFileSync(new URL('../src/components/multideck/dexter-activity-trail.tsx', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
const primitive = tag => ({ children, initial, animate, transition, onAnimationComplete, forceMount, onOpenChange, isStreaming, ...props }) => React.createElement(tag, props, children)
const icon = () => React.createElement('svg')
const dependencies = {
  react: React,
  'motion/react': { motion: { div: primitive('div') }, useReducedMotion: () => true },
  '@/components/ui/tooltip': { Tooltip: primitive('div'), TooltipContent: primitive('div'), TooltipTrigger: primitive('div') },
  '@/components/ai-elements/reasoning': { Reasoning: primitive('div'), ReasoningContent: primitive('div'), ReasoningTrigger: primitive('button') },
  '@/components/ai-elements/shimmer': { Shimmer: primitive('span') },
  '@/components/icons/hugeicons': { AlertCircle: icon, Check: icon, ChevronDown: icon, Search: icon },
  '@/assets/integrations/gmail.svg': 'gmail.svg', '@/assets/integrations/outlook.png': 'outlook.png',
  '@/i18n/language-provider': { useLanguage: () => ({ t: value => value }) },
  '@/lib/utils': { cn: (...args) => args.filter(Boolean).join(' ') },
}
const exports = {}
new Function('require', 'exports', 'React', compiled)(name => { if (!(name in dependencies)) throw new Error(name); return dependencies[name] }, exports, React)
const render = props => renderToStaticMarkup(React.createElement(exports.DexterActivityTrail, { content: '', activities: [], isStreaming: true, open: false, onOpenChange() {}, ...props }))
test('the empty thinking row leaves before answer text appears and stays absent at completion', () => {
  assert.match(render({}), /Thinking/)
  assert.equal(render({ answerStarted: true }), '')
  assert.equal(render({ answerStarted: true, isStreaming: false }), '')
  assert.equal(render({ isStreaming: false }), '')
})
test('retained reasoning has the same stable summary throughout answer streaming and completion', () => {
  const props = { content: 'Checked the available evidence.', answerStarted: true }
  assert.equal(render(props), render({ ...props, isStreaming: false }))
  assert.match(render(props), /Reasoning summary/)
  assert.doesNotMatch(render(props), /Writing response/)
})
test('real tool work remains visible while running, with a persistent summary afterwards', () => {
  const activity = { id: 'read', label: 'Reading emails', status: 'running', providers: ['gmail'] }
  assert.match(render({ answerStarted: true, activities: [activity] }), /Reading emails/)
  const props = { answerStarted: true, activities: [{ ...activity, status: 'completed' }] }
  assert.match(render(props), /Used Gmail/)
  assert.equal(render(props), render({ ...props, isStreaming: false }))
})
