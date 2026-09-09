import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const out = new URL("./shots/", import.meta.url).pathname
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })

const errors = []
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text())
})
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`))

await page.goto("http://localhost:5173/crm", { waitUntil: "networkidle" })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${out}01-initial.png` })

const sidebar = page.locator("aside").first()
console.log("sidebar visible:", await sidebar.isVisible().catch(() => false))
console.log("nav buttons:", await sidebar.locator("button").count())
console.log("errors:", errors)

await browser.close()
