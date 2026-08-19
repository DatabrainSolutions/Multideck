import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const conversion = readFileSync(new URL("../src/pages/lead-conversion-page.tsx", import.meta.url), "utf8")

test("organisation-free leads never preselect or submit a synthetic contact id", () => {
  assert.match(conversion, /primaryContactId: lead\.company\.organisationId\s*\? lead\.contacts\.find\(\(contact\) => contact\.isPrimary\)\?\.id \?\? ""\s*: ""/)
  assert.match(conversion, /primaryContactId: lead\.company\.organisationId \? data\.primaryContactId \|\| null : null/)
})

test("only organisation-backed leads can select an existing contact", () => {
  assert.match(conversion, /const isOrganisationBacked = Boolean\(lead\.company\.organisationId\)/)
  assert.match(conversion, /\{isOrganisationBacked \? \(\s*<Field label=\{t\("Primary contact"\)\}/)
  assert.match(conversion, /lead\.contacts\.map\(\(contact\) => <SelectItem/)
  assert.match(conversion, /\) : \(\s*<Field label=\{t\("Contact from this lead"\)\}/)
})

test("organisation-free conversion explains and reviews the lead-native contact truthfully", () => {
  assert.match(conversion, /lead\.primaryContactName \|\| lead\.primaryContactEmail/)
  assert.match(conversion, /t\("This lead is not linked to an account yet\. Its contact details will be used to create the primary contact during conversion\."\)/)
  assert.match(conversion, /t\("Created during conversion"\)/)
  assert.match(conversion, /t\(isOrganisationBacked \? "Primary contact" : "Contact created from lead"\)/)
  assert.match(conversion, /dir="auto"/)
  assert.match(conversion, /dir="ltr"/)
})

test("conversion load failure can retry or return directly to the lead register", () => {
  assert.match(conversion, /const \[reloadToken, setReloadToken\] = useState\(0\)/)
  assert.match(conversion, /\[leadId, reloadToken, t\]/)
  assert.match(conversion, /navigate\("\/crm\/leads"\)[\s\S]*t\("Back to leads"\)/)
  assert.match(conversion, /setReloadToken\(\(token\) => token \+ 1\)[\s\S]*t\("Try again"\)/)
  assert.doesNotMatch(conversion, /navigate\(`\/crm\/leads\/\$\{leadId\}`\)[\s\S]*t\("Back to lead"\)/)
})
