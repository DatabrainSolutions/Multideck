import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { renderEmailMarkdown } from "../functions/_shared/email-markdown.ts"

const edge = readFileSync(new URL("../functions/developer-broadcasts/index.ts", import.meta.url), "utf8")
const client = readFileSync(new URL("../../multideck.client/src/components/multideck/broadcast-settings.tsx", import.meta.url), "utf8")
const phrases = readFileSync(new URL("../../multideck.client/src/i18n/broadcast-settings-phrases.ts", import.meta.url), "utf8")

test("broadcast email Markdown becomes safe headings, lists, emphasis and readable plain text", () => {
  const rendered = renderEmailMarkdown(`# Overview\n\n## What changed\n\n- **Faster** loading\n- Clearer errors\n\n### Next steps\n\n1. Review\n2. Confirm\n\n<script>alert(1)</script>`)
  assert.match(rendered.html, /<h2[^>]*>Overview<\/h2>/)
  assert.match(rendered.html, /<h2[^>]*>What changed<\/h2>/)
  assert.match(rendered.html, /<h3[^>]*>Next steps<\/h3>/)
  assert.match(rendered.html, /<ul[^>]*>[\s\S]*<strong[^>]*>Faster<\/strong>/)
  assert.match(rendered.html, /<ol[^>]*>[\s\S]*<li/)
  assert.match(rendered.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(rendered.html, /<script>/)
  assert.match(rendered.text, /• Faster loading/)
  assert.match(rendered.text, /1\. Review/)
})

test("AI drafting requests structured copy and preview delivery share the same renderer", () => {
  assert.match(edge, /Markdown ## and ### subheadings/)
  assert.match(edge, /body: \[message\], bodyFormat: "markdown"/)
  assert.match(edge, /const rendered = renderedMessage\(locked\.Broadcast_Subject, locked\.Broadcast_Body\)/)
  assert.match(client, /Formatting: ## subheading, ### small heading, - bullet, 1\. numbered step, \*\*bold\*\*\./)
  assert.match(phrases, /"Formatting: ## subheading[\s\S]* ar:/)
})
