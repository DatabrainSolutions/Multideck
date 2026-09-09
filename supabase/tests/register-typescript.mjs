import { registerHooks } from "node:module"

// Edge Functions are Deno ES modules. The repository root is CommonJS, so
// Node's focused backend tests must not infer CommonJS for their .ts imports.
registerHooks({
  load(url, context, nextLoad) {
    return nextLoad(url, url.endsWith(".ts") ? { ...context, format: "module-typescript" } : context)
  },
})
