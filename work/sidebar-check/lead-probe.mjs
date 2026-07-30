import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const out = new URL("./lead-shots/", import.meta.url).pathname
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1600, height: 1100 },
  permissions: ["clipboard-read", "clipboard-write"],
})
const page = await context.newPage()

const errors = []
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))

await page.goto("http://localhost:5173/crm/leads", { waitUntil: "networkidle" })
await page.waitForTimeout(2000)
await page.screenshot({ path: `${out}00-leads.png`, fullPage: false })

// Open the first lead row to reach the detail view.
const row = page.locator('table tbody tr, [role="row"]').nth(1)
await row.click({ timeout: 10000 }).catch(() => {})
await page.waitForTimeout(2500)
console.log("url:", page.url())

await page.addStyleTag({ content: `[data-slot="copyable-field"] button { opacity: 1 !important; }` })
await page.screenshot({ path: `${out}01-lead-detail.png`, fullPage: true })

const audit = await page.evaluate(() => {
  const fields = [...document.querySelectorAll('[data-slot="copyable-field"]')]
  return {
    fieldCount: fields.length,
    // Any copy affordance that wraps an image/avatar rather than text is a mistake.
    nonTextFields: fields
      .filter((field) => field.querySelector('img, [data-slot="avatar"], svg[data-avatar]'))
      .map((field) => field.querySelector("button")?.getAttribute("aria-label")),
    fields: fields.map((field) => {
      const root = field.querySelector('[data-slot="copy-feedback-transition"]')
      const originalLayer = root.querySelector('[data-copy-layer="original"]')
      const button = field.querySelector("button")
      const textBox = originalLayer.getBoundingClientRect()
      const buttonBox = button.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(originalLayer)
      const firstLine = range.getClientRects()[0]
      range.detach()
      return {
        label: button.getAttribute("aria-label")?.replace(/^Copy /, ""),
        effect: root.dataset.effect,
        lines: firstLine ? Math.round(textBox.height / firstLine.height) : 1,
        // Distance from the end of the text block to the copy control.
        gapAfterText: Math.round(buttonBox.left - textBox.right),
        // Vertical offset of the control's centre from the first line's centre.
        offsetFromFirstLine: firstLine
          ? Math.round((buttonBox.top + buttonBox.height / 2) - (firstLine.top + firstLine.height / 2))
          : null,
      }
    }),
  }
})

console.log("fields:", audit.fieldCount)
console.log("copy affordance on non-text content:", audit.nonTextFields.length ? audit.nonTextFields : "none")
console.table(audit.fields)

const misaligned = audit.fields.filter((f) => Math.abs(f.offsetFromFirstLine ?? 0) > 4)
console.log("NOT ALIGNED TO FIRST LINE:", misaligned.length ? JSON.stringify(misaligned, null, 2) : "none")
console.log("errors:", errors.slice(0, 5))

await browser.close()
