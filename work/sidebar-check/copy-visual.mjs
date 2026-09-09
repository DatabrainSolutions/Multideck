import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const out = new URL("./copy-shots/", import.meta.url).pathname
mkdirSync(out, { recursive: true })

const rtl = process.argv.includes("--rtl")
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1600, height: 1200 },
  permissions: ["clipboard-read", "clipboard-write"],
})
const page = await context.newPage()

// The app reads its language (and therefore direction) from storage on first render.
await page.addInitScript((code) => {
  window.localStorage.setItem("multideck.language", code)
}, rtl ? "ar" : "en")

await page.goto("http://localhost:3000/copy-lab.html", { waitUntil: "networkidle" })
await page.waitForTimeout(1500)

await page.addStyleTag({ content: `[data-slot="copyable-field"] button { opacity: 1 !important; }` })
const prefix = rtl ? "rtl" : "ltr"
await page.screenshot({ path: `${out}${prefix}-10-idle.png`, fullPage: true })

// Fire every copy at once so one frame shows the whole system mid-transition.
await page.evaluate(() => {
  document.querySelectorAll('[data-slot="copyable-field"] button').forEach((button) => button.click())
})
await page.waitForTimeout(150)
await page.screenshot({ path: `${out}${prefix}-11-mid-swap.png`, fullPage: true })
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}${prefix}-12-copied.png`, fullPage: true })
await page.waitForTimeout(1800)
await page.screenshot({ path: `${out}${prefix}-13-reverted.png`, fullPage: true })

await browser.close()
