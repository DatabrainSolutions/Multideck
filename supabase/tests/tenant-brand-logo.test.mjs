import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const source = await readFile(new URL("../functions/_shared/tenant-brand-logo.ts", import.meta.url), "utf8")
const javascript = stripTypeScriptTypes(source, { mode: "strip" })
const { removeNonVisualSvgLinks } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`)

test("Jenkar-style numeric SVG links are removed without altering the artwork", () => {
  const artwork = '<path d="M0 0L10 10" style="fill:#316fab;"/>'
  const source = `<svg><g><a xlink:href="72.1635294117647">${artwork}</a></g></svg>`
  assert.equal(removeNonVisualSvgLinks(source), `<svg><g>${artwork}</g></svg>`)
})

test("ordinary navigation-only anchors become non-interactive artwork", () => {
  assert.equal(removeNonVisualSvgLinks('<svg><a href="https://example.com"><path/></a></svg>'), '<svg><path/></svg>')
  assert.equal(removeNonVisualSvgLinks("<svg><a href='javascript:alert(1)'><path/></a></svg>"), '<svg><path/></svg>')
})

test("visual, event-handler and malformed anchors are not silently changed", () => {
  for (const attrs of ['href="https://example.com" transform="scale(2)"', 'href="#local" onclick="alert(1)"', 'href=unquoted', 'href="https://example.com?a=1&amp;b=2"']) {
    const source = `<svg><a ${attrs}><path/></a></svg>`
    assert.equal(removeNonVisualSvgLinks(source), source)
  }
})

test("scripts and external image references remain for the safety validator to reject", () => {
  for (const content of ['<script>alert(1)</script>', '<image href="https://example.com/logo.png"/>', '<use href="https://example.com/logo.svg#mark"/>']) {
    assert.equal(removeNonVisualSvgLinks(`<svg><a href="#link">${content}</a></svg>`), `<svg>${content}</svg>`)
  }
})

test("already self-contained SVGs and internal gradients remain unchanged", () => {
  const source = '<svg><defs><linearGradient id="brand"/></defs><path fill="url(#brand)"/><use href="#mark"/></svg>'
  assert.equal(removeNonVisualSvgLinks(source), source)
})
