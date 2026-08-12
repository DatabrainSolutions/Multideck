import { writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { customsDeclarationTemplate } from "../../functions/_shared/customs-declaration-template.ts"

const root = dirname(fileURLToPath(import.meta.url))

await Promise.all([
  writeFile(resolve(root, "CDS_Export_Carbone_Template.html"), customsDeclarationTemplate("export")),
  writeFile(resolve(root, "CDS_Import_Carbone_Template.html"), customsDeclarationTemplate("import")),
])
