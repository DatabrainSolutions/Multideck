import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../../", import.meta.url)
const read = (path) => readFile(new URL(path, root), "utf8")

test("Carbone Studio component remains authenticated and server-hosted", async () => {
  const [edge, client, page, config] = await Promise.all([
    read("supabase/functions/document-studio/index.ts"),
    read("multideck.client/src/lib/document-builder-api.ts"),
    read("multideck.client/src/pages/documents-page.tsx"),
    read("supabase/config.toml"),
  ])

  assert.match(config, /\[functions\.document-studio\]\s+verify_jwt = true/)
  assert.match(edge, /authenticateRequest\(request\)/)
  assert.match(edge, /payload\.action === "component"/)
  assert.match(edge, /getCarboneAuthorization\(\)/)
  assert.match(edge, /\/carbone-studio\.js\?v=/)
  assert.match(edge, /CARBONE_STUDIO_VERSION/)
  assert.match(edge, /maximumStudioComponentBytes = 5 \* 1024 \* 1024/)
  assert.match(client, /Authorization: `Bearer \$\{session\.access_token\}`/)
  assert.match(client, /JSON\.stringify\(\{ action: "component" \}\)/)
  assert.match(page, /getDocumentStudioComponent\(\)/)
  assert.match(page, /script\.type = "module"/)
  assert.match(page, /setRenderOptions\(activeSession\.renderOptions, false\)[\s\S]+openTemplateDataURI/)
  assert.match(page, /template:updated[\s\S]+refreshPreview\(base64\)/)
  assert.match(page, /renderDocumentStudioPreview[\s\S]+URL\.createObjectURL/)
  assert.match(page, /title=\{t\("Live document preview"\)\}/)
  assert.doesNotMatch(page, /bin\.carbone\.io/)
  assert.doesNotMatch(client, /CARBONE_(?:AUTH|USERNAME|PASSWORD|API_TOKEN)/)
})
