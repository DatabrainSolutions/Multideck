import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import ts from "typescript"

const root = resolve(import.meta.dirname, "..")
const dataPath = resolve(root, "src/data/multideck-data.ts")
const pagePath = resolve(root, "src/pages/components-gallery-page.tsx")
const dataSource = readFileSync(dataPath, "utf8")
const pageSource = readFileSync(pagePath, "utf8")

function sourceFile(path, source, kind) {
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
}

function variableInitializer(file, name) {
  let initializer

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      initializer = node.initializer
      return
    }
    ts.forEachChild(node, visit)
  }

  visit(file)
  assert.ok(initializer, `${name} must remain declared.`)
  return initializer
}

function stringProperty(object, name) {
  const property = object.properties.find((item) => (
    ts.isPropertyAssignment(item)
    && ts.isIdentifier(item.name)
    && item.name.text === name
  ))
  return property && ts.isStringLiteralLike(property.initializer) ? property.initializer.text : null
}

const dataFile = sourceFile(dataPath, dataSource, ts.ScriptKind.TS)
const pageFile = sourceFile(pagePath, pageSource, ts.ScriptKind.TSX)
const galleryArray = variableInitializer(dataFile, "galleryComponents")
const sidebarGroups = variableInitializer(pageFile, "gallerySidebarGroups")

assert.ok(ts.isArrayLiteralExpression(galleryArray), "galleryComponents must remain a literal array so it can be audited.")
assert.ok(ts.isArrayLiteralExpression(sidebarGroups), "gallerySidebarGroups must remain a literal array so it can be audited.")

const entries = galleryArray.elements.filter(ts.isObjectLiteralExpression)
const galleryIds = entries.map((entry) => stringProperty(entry, "id")).filter(Boolean)
const sidebarIds = sidebarGroups.elements.flatMap((group) => {
  if (!ts.isObjectLiteralExpression(group)) return []
  const ids = group.properties.find((item) => (
    ts.isPropertyAssignment(item)
    && ts.isIdentifier(item.name)
    && item.name.text === "ids"
  ))
  if (!ids || !ts.isPropertyAssignment(ids) || !ts.isArrayLiteralExpression(ids.initializer)) return []
  return ids.initializer.elements.filter(ts.isStringLiteralLike).map((item) => item.text)
})
const previewIds = [...pageSource.matchAll(/id\s*===\s*["']([^"']+)["']/gu)].map((match) => match[1])

test("every gallery component is navigable and has one live preview", () => {
  assert.equal(new Set(galleryIds).size, galleryIds.length, "Gallery component ids must be unique.")
  assert.equal(new Set(sidebarIds).size, sidebarIds.length, "Sidebar component ids must be unique.")
  assert.deepEqual(new Set(sidebarIds), new Set(galleryIds), "The sidebar must expose every gallery component and no stale ids.")
  assert.deepEqual(new Set(previewIds), new Set(galleryIds), "Every gallery component must have exactly one reachable preview branch.")
})

test("every gallery entry carries the documentation contract", () => {
  for (const entry of entries) {
    const id = stringProperty(entry, "id") ?? "unknown"
    const propertyNames = new Set(entry.properties.flatMap((property) => (
      ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) ? [property.name.text] : []
    )))

    for (const property of ["name", "category", "description", "details", "foundOn", "componentCode", "usageCode"]) {
      assert.ok(propertyNames.has(property), `${id} must include ${property}.`)
    }
  }
})

test("the catalogue reflects current reusable patterns instead of gallery-only demos", () => {
  for (const id of ["inline-fields", "wizard-dialog", "side-drawer"]) {
    assert.ok(galleryIds.includes(id), `${id} must remain documented.`)
  }
  for (const id of ["ai-edge-glow", "mailbox-provider-switch"]) {
    assert.ok(!galleryIds.includes(id), `${id} is not used by a product surface and must not return as a gallery-only entry.`)
  }
})
