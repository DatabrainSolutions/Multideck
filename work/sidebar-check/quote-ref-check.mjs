import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const out = new URL("./copy-shots/", import.meta.url).pathname
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 300 }, deviceScaleFactor: 3 })
await page.goto("http://localhost:3000/copy-lab.html", { waitUntil: "networkidle" })
await page.waitForTimeout(900)

const pill = page.locator('[data-lab="quote-reference"]')
const strip = pill.locator("xpath=..")

const before = await pill.evaluate((node) => {
  const root = node.querySelector('[data-slot="copy-feedback-transition"]')
  return { effect: root.dataset.effect, width: Math.round(root.getBoundingClientRect().width) }
})
console.log("quote reference at rest:", before)

await strip.screenshot({ path: `${out}quote-0-idle.png` })
await pill.click()
await page.waitForTimeout(140)
await strip.screenshot({ path: `${out}quote-1-mid.png` })
await page.waitForTimeout(500)
await strip.screenshot({ path: `${out}quote-2-copied.png` })

const during = await pill.evaluate((node) => {
  const root = node.querySelector('[data-slot="copy-feedback-transition"]')
  const copied = root.querySelector('[data-copy-layer="copied"]')
  return {
    effect: root.dataset.effect,
    rootWidth: Math.round(root.getBoundingClientRect().width),
    copiedNatural: Math.ceil(copied.getBoundingClientRect().width),
    // In slot mode every character must be individually animated.
    animatedCharacters: root.querySelectorAll('[data-copy-layer="original"] .inline-block .inline-block').length,
  }
})
console.log("quote reference while copied:", during)

await page.waitForTimeout(1600)
await strip.screenshot({ path: `${out}quote-3-rest.png` })
await browser.close()
