import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { renderEmailMarkdown } from "../functions/_shared/email-markdown.ts"
import { emailMarkdownToEditorHtml } from "../../multideck.client/src/lib/email-markdown-editor.ts"

test("email markdown preserves deliberate line breaks inside a paragraph", () => {
  const rendered = renderEmailMarkdown("Kind regards,\nHarry")
  assert.match(rendered.html, /Kind regards,<br>Harry/)
  assert.equal(rendered.text, "Kind regards,\nHarry")
})

const edge = readFileSync(new URL("../functions/developer-broadcasts/index.ts", import.meta.url), "utf8")
const client = readFileSync(new URL("../../multideck.client/src/components/multideck/broadcast-settings.tsx", import.meta.url), "utf8")

test("broadcast email Markdown becomes safe headings, lists, emphasis and readable plain text", () => {
  const rendered = renderEmailMarkdown(`# Overview\n\n## What changed\n\n- **Faster** loading\n• Clearer errors\n\n### Next steps\n\n1. Review\n2. Confirm\n\n<script>alert(1)</script>`)
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

test("the visual editor renders structure without exposing Markdown controls", () => {
  const editor = emailMarkdownToEditorHtml("## Added\n\n• Export declarations\n- Delete drafts\n\n### Important\n\nUse **Review** first.")
  assert.match(editor, /^<h2>Added<\/h2>/)
  assert.match(editor, /<ul><li>Export declarations<\/li><li>Delete drafts<\/li><\/ul>/)
  assert.match(editor, /<h3>Important<\/h3>/)
  assert.match(editor, /<strong>Review<\/strong>/)
  assert.doesNotMatch(editor, /##|\*\*|•/)
})

test("AI drafting requires structured copy and preview delivery share the same renderer", () => {
  assert.match(edge, /MUST group related information beneath consistent Markdown ## section headings/)
  assert.match(edge, /Never use Unicode bullet characters/)
  assert.match(edge, /body: \[message\], bodyFormat: "markdown"/)
  assert.match(edge, /const rendered = renderedMessage\(locked\.Broadcast_Subject, locked\.Broadcast_Body\)/)
  assert.match(client, /function BroadcastMessageEditor/)
  assert.match(client, /contentEditable/)
  assert.doesNotMatch(client, /Formatting: ## subheading/)
})
