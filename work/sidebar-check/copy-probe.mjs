import { chromium } from "playwright"
import { mkdirSync } from "node:fs"

const out = new URL("./copy-shots/", import.meta.url).pathname
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
})
const page = await context.newPage()

const errors = []
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()) })
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`))

const FORCE_BUTTONS_VISIBLE = `[data-slot="copyable-field"] button { opacity: 1 !important; }`

async function load() {
  await page.goto("http://localhost:3000/copy-lab.html", { waitUntil: "networkidle" })
  await page.waitForTimeout(700)
  await page.addStyleTag({ content: FORCE_BUTTONS_VISIBLE })
}

// The lab entry has no HMR boundary, so an unrelated Vite update can full-reload the page
// mid-measurement. Measure one field per evaluate and reload+retry if that happens.
async function measure(index, attempt = 0) {
  try {
    return await page.evaluate(async (i) => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const field = document.querySelectorAll('[data-slot="copyable-field"]')[i]
      const root = field.querySelector('[data-slot="copy-feedback-transition"]')
      const copiedLayer = root.querySelector('[data-copy-layer="copied"]')
      const button = field.querySelector("button")

      const restWidth = Math.round(root.getBoundingClientRect().width)
      const copiedNatural = Math.ceil(copiedLayer.getBoundingClientRect().width)

      button.click()

      let narrowestWhileCopied = Infinity
      for (let tick = 0; tick < 32; tick += 1) {
        // Skip the first frames: that is the growth animation itself.
        if (tick > 8) narrowestWhileCopied = Math.min(narrowestWhileCopied, root.getBoundingClientRect().width)
        await wait(25)
      }
      const widthWhileCopied = Math.round(root.getBoundingClientRect().width)

      await wait(1700)
      const settledWidth = Math.round(root.getBoundingClientRect().width)

      return {
        label: button.getAttribute("aria-label"),
        effect: root.dataset.effect,
        restWidth,
        copiedNatural,
        grew: widthWhileCopied > restWidth + 1,
        needsToGrow: copiedNatural > restWidth,
        widthWhileCopied,
        clipped: copiedNatural > Math.ceil(narrowestWhileCopied) + 1,
        returnedToRest: Math.abs(settledWidth - restWidth) <= 2,
      }
    }, index)
  } catch (error) {
    if (attempt >= 3) throw error
    await load()
    return measure(index, attempt + 1)
  }
}

await load()

// Copy affordances belong on text, never on an avatar or other non-text content.
const nonTextFields = await page.evaluate(() =>
  [...document.querySelectorAll('[data-slot="copyable-field"]')]
    .filter((field) => field.querySelector('img, [data-slot="avatar"], [data-slot="avatar-fallback"]'))
    .map((field) => field.querySelector("button")?.getAttribute("aria-label")))
console.log("COPY ON NON-TEXT CONTENT:", nonTextFields.length ? nonTextFields : "none")

// The control should sit on the first line of its value, hugging the text.
const placement = await page.evaluate(() =>
  [...document.querySelectorAll('[data-slot="copyable-field"]')].map((field) => {
    const root = field.querySelector('[data-slot="copy-feedback-transition"]')
    const originalLayer = root.querySelector('[data-copy-layer="original"]')
    const button = field.querySelector("button")
    const textBox = originalLayer.getBoundingClientRect()
    const buttonBox = button.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(originalLayer)
    const lines = [...range.getClientRects()].filter((rect) => rect.height > 0)
    range.detach()
    const firstLine = lines[0]
    return {
      label: button.getAttribute("aria-label")?.replace(/^Copy /, ""),
      effect: root.dataset.effect,
      lineCount: firstLine ? Math.max(1, Math.round(textBox.height / firstLine.height)) : 1,
      offsetFromFirstLine: firstLine
        ? Math.round((buttonBox.top + buttonBox.height / 2) - (firstLine.top + firstLine.height / 2))
        : null,
    }
  }))
console.table(placement)
const misaligned = placement.filter((f) => Math.abs(f.offsetFromFirstLine ?? 0) > 4)
console.log("NOT ON FIRST LINE:", misaligned.length ? JSON.stringify(misaligned, null, 2) : "none")

// 1. Nothing may keep changing geometry at rest (that would be a measurement feedback loop).
const idleDrift = await page.evaluate(async () => {
  const fields = [...document.querySelectorAll('[data-slot="copyable-field"]')]
  const samples = fields.map(() => new Set())
  for (let tick = 0; tick < 40; tick += 1) {
    fields.forEach((field, i) => {
      const root = field.querySelector('[data-slot="copy-feedback-transition"]')
      samples[i].add(`${Math.round(root.getBoundingClientRect().width)}|${field.querySelector("button").style.marginBlockStart}`)
    })
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  return fields
    .map((field, i) => ({ label: field.querySelector("button")?.getAttribute("aria-label"), seen: [...samples[i]] }))
    .filter((entry) => entry.seen.length > 1)
})
console.log("UNSTABLE AT REST:", idleDrift.length ? JSON.stringify(idleDrift, null, 2) : "none")

await page.screenshot({ path: `${out}00-idle.png`, fullPage: true })

const count = await page.locator('[data-slot="copyable-field"]').count()
const report = []
for (let i = 0; i < count; i += 1) report.push(await measure(i))

console.table(report)
const broken = report.filter((r) => r.clipped || !r.returnedToRest || (r.needsToGrow && !r.grew))
console.log("FAILURES:", broken.length ? JSON.stringify(broken, null, 2) : "none")
console.log("errors:", errors)

await browser.close()
