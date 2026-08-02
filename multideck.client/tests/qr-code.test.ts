import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_QR_STYLE, encodeQr, qrGeometry, qrLogoBounds, qrPath, qrSvgDocument, QR_QUIET_ZONE } from "../src/lib/qr-code.ts"

const CARD_URL = "https://app.multideck.solutions/card/laura-jenka"

test("selects the smallest version that fits the payload", () => {
  // Byte mode at level M: v1 holds 16 data codewords, v2 holds 28, v3 holds 44,
  // v4 holds 64. A payload costs 4 mode bits, 8 length bits and 8 bits per byte.
  assert.equal(encodeQr("hi")?.version, 1)
  assert.equal(encodeQr("x".repeat(20))?.version, 2)
  assert.equal(encodeQr("x".repeat(40))?.version, 3)
  assert.equal(CARD_URL.length, 48)
  assert.equal(encodeQr(CARD_URL)?.version, 4)
})

test("symbol size follows the version", () => {
  const matrix = encodeQr(CARD_URL)
  assert.ok(matrix)
  assert.equal(matrix.size, matrix.version * 4 + 17)
  assert.equal(matrix.size, 33)
  assert.equal(matrix.modules.length, 33)
  assert.equal(matrix.modules[0].length, 33)
})

test("places the three finder patterns and their separators", () => {
  const matrix = encodeQr(CARD_URL)
  assert.ok(matrix)
  const { modules, size } = matrix

  for (const [row, column] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    // Outer ring dark, inner ring light, 3x3 core dark.
    for (let offset = 0; offset < 7; offset += 1) {
      assert.equal(modules[row][column + offset], true, `top edge at ${row},${column}`)
      assert.equal(modules[row + 6][column + offset], true, `bottom edge at ${row},${column}`)
      assert.equal(modules[row + offset][column], true, `left edge at ${row},${column}`)
      assert.equal(modules[row + offset][column + 6], true, `right edge at ${row},${column}`)
    }
    assert.equal(modules[row + 1][column + 1], false)
    assert.equal(modules[row + 3][column + 3], true)
  }

  // Separator strip below the top-left finder must be entirely light.
  for (let column = 0; column <= 7; column += 1) assert.equal(modules[7][column], false)
})

test("draws the timing patterns and the dark module", () => {
  const matrix = encodeQr(CARD_URL)
  assert.ok(matrix)
  const { modules, size } = matrix

  for (let index = 8; index < size - 8; index += 1) {
    assert.equal(modules[6][index], index % 2 === 0, `horizontal timing at ${index}`)
    assert.equal(modules[index][6], index % 2 === 0, `vertical timing at ${index}`)
  }

  assert.equal(modules[size - 8][8], true, "the dark module is always set")
})

test("encoding is deterministic", () => {
  const first = encodeQr(CARD_URL)
  const second = encodeQr(CARD_URL)
  assert.deepEqual(first, second)
})

test("distinct payloads produce distinct symbols", () => {
  const first = encodeQr("https://app.multideck.solutions/card/laura-jenka")
  const second = encodeQr("https://app.multideck.solutions/card/priya-raman")
  assert.notDeepEqual(first?.modules, second?.modules)
})

test("returns null rather than a broken symbol past version 10", () => {
  // Version 10 at level M holds 216 data codewords, minus 4 mode bits and a
  // 16-bit length, which leaves room for 213 bytes.
  assert.ok(encodeQr("x".repeat(213)))
  assert.equal(encodeQr("x".repeat(214)), null)
})

test("renders an SVG that keeps the quiet zone", () => {
  const matrix = encodeQr(CARD_URL)
  assert.ok(matrix)

  const extent = matrix.size + QR_QUIET_ZONE * 2
  const svg = qrSvgDocument(matrix)

  assert.match(svg, new RegExp(`viewBox="0 0 ${extent} ${extent}"`))
  assert.match(svg, new RegExp(`translate\\(${QR_QUIET_ZONE} ${QR_QUIET_ZONE}\\)`))
  // Modules, eye rings and eye cores are three separate fills.
  assert.equal(svg.match(/<path /g)?.length, 3)
  assert.match(svg, /fill-rule="evenodd"/)
})

test("square module style reproduces the plain geometry", () => {
  const matrix = encodeQr(CARD_URL)
  assert.ok(matrix)

  const square = qrGeometry(matrix, { ...DEFAULT_QR_STYLE, moduleStyle: "square" })
  // Every dark module outside the three finder patterns, as plain 1x1 cells.
  const eyeModules = 3 * 7 * 7
  const darkOutsideEyes = matrix.modules
    .flatMap((row, rowIndex) => row.map((dark, column) => ({ dark, rowIndex, column })))
    .filter(({ dark, rowIndex, column }) => {
      if (!dark) return false
      const inTopLeft = rowIndex < 7 && column < 7
      const inTopRight = rowIndex < 7 && column >= matrix.size - 7
      const inBottomLeft = rowIndex >= matrix.size - 7 && column < 7
      return !(inTopLeft || inTopRight || inBottomLeft)
    }).length

  assert.equal(square.modulesPath.match(/M/g)?.length, darkOutsideEyes)
  assert.ok(darkOutsideEyes > 0 && darkOutsideEyes < matrix.size * matrix.size - eyeModules + 1)
})

test("higher error correction levels cost capacity", () => {
  // The same payload needs a larger symbol as redundancy goes up.
  const m = encodeQr(CARD_URL, "M")
  const q = encodeQr(CARD_URL, "Q")
  const h = encodeQr(CARD_URL, "H")

  assert.ok(m && q && h)
  assert.equal(m.level, "M")
  assert.ok(q.version >= m.version)
  assert.ok(h.version >= q.version)
})

test("a logo knockout clears an odd, centred square", () => {
  const matrix = encodeQr(CARD_URL, "H")
  assert.ok(matrix)

  assert.equal(qrLogoBounds(matrix, 0), null)

  const bounds = qrLogoBounds(matrix, 0.24)
  assert.ok(bounds)
  assert.equal(bounds.span % 2, 1, "an odd span centres exactly on the grid")
  assert.equal(bounds.end - bounds.start, bounds.span)
  // Centred: equal margin either side.
  assert.equal(bounds.start, matrix.size - bounds.end)

  // Nothing inside the cleared square is drawn.
  const geometry = qrGeometry(matrix, { ...DEFAULT_QR_STYLE, moduleStyle: "square", logoArea: 0.24 })
  for (let row = bounds.start; row < bounds.end; row += 1) {
    for (let column = bounds.start; column < bounds.end; column += 1) {
      assert.ok(!geometry.modulesPath.includes(`M${column} ${row}h1v1h-1z`), `module ${row},${column} should be cleared`)
    }
  }
})

test("the path covers exactly the dark modules", () => {
  const matrix = encodeQr("hi")
  assert.ok(matrix)

  const dark = matrix.modules.flat().filter(Boolean).length
  const segments = qrPath(matrix).match(/M/g)?.length ?? 0
  assert.equal(segments, dark)
})
