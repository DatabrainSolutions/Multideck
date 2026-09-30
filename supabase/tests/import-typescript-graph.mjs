import { readFileSync } from "node:fs"
import { stripTypeScriptTypes } from "node:module"

// Imports a TypeScript module and its relative .ts imports under plain Node,
// for backend and shared modules that Deno runs directly. Type-only imports
// (including npm: specifiers) are erased; value imports must be relative.
export function importTypeScriptGraph(url) {
  const seen = new Map()
  const encode = (moduleUrl) => {
    const key = moduleUrl.href
    if (seen.has(key)) return seen.get(key)
    const source = stripTypeScriptTypes(readFileSync(moduleUrl, "utf8"))
      .replace(/(from\s+|import\s+)(["'])(\.{1,2}\/[^"']+\.ts)\2/g, (_, prefix, quote, specifier) => `${prefix}${quote}${encode(new URL(specifier, moduleUrl))}${quote}`)
    const encoded = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
    seen.set(key, encoded)
    return encoded
  }
  return import(encode(url))
}
