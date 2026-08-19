/**
 * A dependency-free QR encoder, scoped to what a shareable card link needs:
 * byte mode, versions 1 to 10, at error correction levels M, Q and H. That tops
 * out around 200 characters, far more than a card URL will ever carry.
 *
 * Level H exists for one reason: a card can put a logo in the middle of its
 * code, and knocking a hole in the symbol only stays scannable when there is
 * enough redundancy to reconstruct what the logo covers.
 *
 * The output is a plain boolean matrix so callers can render it as inline SVG
 * for the screen and rasterise the same matrix for a print-ready download,
 * rather than shipping two different code images.
 */

/** Galois field GF(256) with the QR primitive polynomial, precomputed once. */
const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)

{
  let value = 1
  for (let index = 0; index < 255; index += 1) {
    GF_EXP[index] = value
    GF_LOG[value] = index
    value <<= 1
    if (value & 0x100) value ^= 0x11d
  }
  // Mirror the table so exponent addition never has to wrap by hand.
  for (let index = 255; index < 512; index += 1) GF_EXP[index] = GF_EXP[index - 255]
}

function multiply(a: number, b: number) {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

function generatorPolynomial(degree: number) {
  let polynomial = new Uint8Array([1])
  for (let step = 0; step < degree; step += 1) {
    const next = new Uint8Array(polynomial.length + 1)
    for (let index = 0; index < polynomial.length; index += 1) {
      next[index] ^= polynomial[index]
      next[index + 1] ^= multiply(polynomial[index], GF_EXP[step])
    }
    polynomial = next
  }
  return polynomial
}

function errorCorrectionBytes(data: Uint8Array, length: number) {
  const generator = generatorPolynomial(length)
  const buffer = new Uint8Array(data.length + length)
  buffer.set(data)

  for (let index = 0; index < data.length; index += 1) {
    const factor = buffer[index]
    if (factor === 0) continue
    for (let offset = 0; offset < generator.length; offset += 1) {
      buffer[index + offset] ^= multiply(generator[offset], factor)
    }
  }

  return buffer.slice(data.length)
}

export type EccLevel = "M" | "Q" | "H"

type VersionSpec = {
  /** Error correction codewords per block. */
  eccPerBlock: number
  group1Blocks: number
  group1Data: number
  group2Blocks: number
  group2Data: number
}

/** Row and column centres for the alignment patterns, by version. */
const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
}

/** Block structure for versions 1 to 10 (ISO/IEC 18004 table 9). */
const VERSIONS: Record<EccLevel, Record<number, VersionSpec>> = {
  M: {
    1: { eccPerBlock: 10, group1Blocks: 1, group1Data: 16, group2Blocks: 0, group2Data: 0 },
    2: { eccPerBlock: 16, group1Blocks: 1, group1Data: 28, group2Blocks: 0, group2Data: 0 },
    3: { eccPerBlock: 26, group1Blocks: 1, group1Data: 44, group2Blocks: 0, group2Data: 0 },
    4: { eccPerBlock: 18, group1Blocks: 2, group1Data: 32, group2Blocks: 0, group2Data: 0 },
    5: { eccPerBlock: 24, group1Blocks: 2, group1Data: 43, group2Blocks: 0, group2Data: 0 },
    6: { eccPerBlock: 16, group1Blocks: 4, group1Data: 27, group2Blocks: 0, group2Data: 0 },
    7: { eccPerBlock: 18, group1Blocks: 4, group1Data: 31, group2Blocks: 0, group2Data: 0 },
    8: { eccPerBlock: 22, group1Blocks: 2, group1Data: 38, group2Blocks: 2, group2Data: 39 },
    9: { eccPerBlock: 22, group1Blocks: 3, group1Data: 36, group2Blocks: 2, group2Data: 37 },
    10: { eccPerBlock: 26, group1Blocks: 4, group1Data: 43, group2Blocks: 1, group2Data: 44 },
  },
  Q: {
    1: { eccPerBlock: 13, group1Blocks: 1, group1Data: 13, group2Blocks: 0, group2Data: 0 },
    2: { eccPerBlock: 22, group1Blocks: 1, group1Data: 22, group2Blocks: 0, group2Data: 0 },
    3: { eccPerBlock: 18, group1Blocks: 2, group1Data: 17, group2Blocks: 0, group2Data: 0 },
    4: { eccPerBlock: 26, group1Blocks: 2, group1Data: 24, group2Blocks: 0, group2Data: 0 },
    5: { eccPerBlock: 18, group1Blocks: 2, group1Data: 15, group2Blocks: 2, group2Data: 16 },
    6: { eccPerBlock: 24, group1Blocks: 4, group1Data: 19, group2Blocks: 0, group2Data: 0 },
    7: { eccPerBlock: 18, group1Blocks: 2, group1Data: 14, group2Blocks: 4, group2Data: 15 },
    8: { eccPerBlock: 22, group1Blocks: 4, group1Data: 18, group2Blocks: 2, group2Data: 19 },
    9: { eccPerBlock: 20, group1Blocks: 4, group1Data: 16, group2Blocks: 4, group2Data: 17 },
    10: { eccPerBlock: 24, group1Blocks: 6, group1Data: 19, group2Blocks: 2, group2Data: 20 },
  },
  H: {
    1: { eccPerBlock: 17, group1Blocks: 1, group1Data: 9, group2Blocks: 0, group2Data: 0 },
    2: { eccPerBlock: 28, group1Blocks: 1, group1Data: 16, group2Blocks: 0, group2Data: 0 },
    3: { eccPerBlock: 22, group1Blocks: 2, group1Data: 13, group2Blocks: 0, group2Data: 0 },
    4: { eccPerBlock: 16, group1Blocks: 4, group1Data: 9, group2Blocks: 0, group2Data: 0 },
    5: { eccPerBlock: 22, group1Blocks: 2, group1Data: 11, group2Blocks: 2, group2Data: 12 },
    6: { eccPerBlock: 28, group1Blocks: 4, group1Data: 15, group2Blocks: 0, group2Data: 0 },
    7: { eccPerBlock: 26, group1Blocks: 4, group1Data: 13, group2Blocks: 1, group2Data: 14 },
    8: { eccPerBlock: 26, group1Blocks: 4, group1Data: 14, group2Blocks: 2, group2Data: 15 },
    9: { eccPerBlock: 24, group1Blocks: 4, group1Data: 12, group2Blocks: 4, group2Data: 13 },
    10: { eccPerBlock: 28, group1Blocks: 6, group1Data: 15, group2Blocks: 2, group2Data: 16 },
  },
}

/** Format bits for each level, per the specification's own ordering. */
const ECC_FORMAT_BITS: Record<EccLevel, number> = { M: 0b00, Q: 0b11, H: 0b10 }

const MAX_VERSION = 10

function dataCapacity(spec: VersionSpec) {
  return spec.group1Blocks * spec.group1Data + spec.group2Blocks * spec.group2Data
}

/** Mask conditions in specification order; index doubles as the mask reference. */
const MASKS: ((row: number, column: number) => boolean)[] = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (_row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0,
]

function getBit(value: number, index: number) {
  return ((value >>> index) & 1) === 1
}

function selectVersion(byteLength: number, level: EccLevel) {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const spec = VERSIONS[level][version]
    const countBits = version < 10 ? 8 : 16
    const requiredBits = 4 + countBits + byteLength * 8
    if (requiredBits <= dataCapacity(spec) * 8) return version
  }
  return null
}

function encodeCodewords(bytes: Uint8Array, version: number, level: EccLevel) {
  const spec = VERSIONS[level][version]
  const capacity = dataCapacity(spec)
  const bits: number[] = []

  const pushBits = (value: number, length: number) => {
    for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1)
  }

  pushBits(0b0100, 4)
  pushBits(bytes.length, version < 10 ? 8 : 16)
  bytes.forEach((byte) => pushBits(byte, 8))

  // Terminator, then pad to a whole codeword, then the alternating pad bytes.
  const capacityBits = capacity * 8
  for (let index = 0; index < 4 && bits.length < capacityBits; index += 1) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const codewords = new Uint8Array(capacity)
  for (let index = 0; index < bits.length / 8; index += 1) {
    let byte = 0
    for (let offset = 0; offset < 8; offset += 1) byte = (byte << 1) | bits[index * 8 + offset]
    codewords[index] = byte
  }

  const padBytes = [0xec, 0x11]
  for (let index = bits.length / 8, pad = 0; index < capacity; index += 1, pad += 1) {
    codewords[index] = padBytes[pad % 2]
  }

  // Split into blocks, compute error correction per block, then interleave both.
  const blocks: Uint8Array[] = []
  const eccBlocks: Uint8Array[] = []
  let cursor = 0

  const appendBlocks = (count: number, size: number) => {
    for (let index = 0; index < count; index += 1) {
      const block = codewords.slice(cursor, cursor + size)
      cursor += size
      blocks.push(block)
      eccBlocks.push(errorCorrectionBytes(block, spec.eccPerBlock))
    }
  }

  appendBlocks(spec.group1Blocks, spec.group1Data)
  appendBlocks(spec.group2Blocks, spec.group2Data)

  const interleaved: number[] = []
  const longestBlock = Math.max(spec.group1Data, spec.group2Data)
  for (let index = 0; index < longestBlock; index += 1) {
    for (const block of blocks) {
      if (index < block.length) interleaved.push(block[index])
    }
  }
  for (let index = 0; index < spec.eccPerBlock; index += 1) {
    for (const block of eccBlocks) interleaved.push(block[index])
  }

  const finalBits: number[] = []
  for (const byte of interleaved) {
    for (let index = 7; index >= 0; index -= 1) finalBits.push((byte >>> index) & 1)
  }
  return finalBits
}

type Grid = { modules: boolean[][]; reserved: boolean[][]; size: number }

function createGrid(version: number): Grid {
  const size = version * 4 + 17
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  return { modules, reserved, size }
}

function drawFinder(grid: Grid, row: number, column: number) {
  for (let deltaRow = -1; deltaRow <= 7; deltaRow += 1) {
    for (let deltaColumn = -1; deltaColumn <= 7; deltaColumn += 1) {
      const targetRow = row + deltaRow
      const targetColumn = column + deltaColumn
      if (targetRow < 0 || targetRow >= grid.size || targetColumn < 0 || targetColumn >= grid.size) continue

      const onRing =
        (deltaRow >= 0 && deltaRow <= 6 && (deltaColumn === 0 || deltaColumn === 6)) ||
        (deltaColumn >= 0 && deltaColumn <= 6 && (deltaRow === 0 || deltaRow === 6))
      const inCore = deltaRow >= 2 && deltaRow <= 4 && deltaColumn >= 2 && deltaColumn <= 4

      grid.reserved[targetRow][targetColumn] = true
      grid.modules[targetRow][targetColumn] = onRing || inCore
    }
  }
}

function drawFunctionPatterns(grid: Grid, version: number) {
  const { size } = grid

  drawFinder(grid, 0, 0)
  drawFinder(grid, 0, size - 7)
  drawFinder(grid, size - 7, 0)

  for (let index = 8; index < size - 8; index += 1) {
    const dark = index % 2 === 0
    grid.modules[6][index] = dark
    grid.reserved[6][index] = true
    grid.modules[index][6] = dark
    grid.reserved[index][6] = true
  }

  const centres = ALIGNMENT[version]
  const last = size - 7
  for (const row of centres) {
    for (const column of centres) {
      const skipsFinder = (row === 6 && column === 6) || (row === 6 && column === last) || (row === last && column === 6)
      if (skipsFinder) continue

      for (let deltaRow = -2; deltaRow <= 2; deltaRow += 1) {
        for (let deltaColumn = -2; deltaColumn <= 2; deltaColumn += 1) {
          grid.reserved[row + deltaRow][column + deltaColumn] = true
          grid.modules[row + deltaRow][column + deltaColumn] = Math.max(Math.abs(deltaRow), Math.abs(deltaColumn)) !== 1
        }
      }
    }
  }

  // Reserve the format areas so data placement skips them.
  for (let index = 0; index <= 8; index += 1) {
    grid.reserved[8][index] = true
    grid.reserved[index][8] = true
  }
  for (let index = 0; index < 8; index += 1) {
    grid.reserved[8][size - 1 - index] = true
    grid.reserved[size - 1 - index][8] = true
  }
  grid.modules[size - 8][8] = true
  grid.reserved[size - 8][8] = true

  if (version >= 7) {
    for (let index = 0; index < 18; index += 1) {
      const outer = size - 11 + (index % 3)
      const inner = Math.floor(index / 3)
      grid.reserved[inner][outer] = true
      grid.reserved[outer][inner] = true
    }
  }
}

function drawFormatInformation(grid: Grid, mask: number, level: EccLevel) {
  const data = (ECC_FORMAT_BITS[level] << 3) | mask
  let remainder = data
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
  }
  const bits = ((data << 10) | (remainder & 0x3ff)) ^ 0x5412
  const { size } = grid

  for (let index = 0; index <= 5; index += 1) grid.modules[index][8] = getBit(bits, index)
  grid.modules[7][8] = getBit(bits, 6)
  grid.modules[8][8] = getBit(bits, 7)
  grid.modules[8][7] = getBit(bits, 8)
  for (let index = 9; index < 15; index += 1) grid.modules[8][14 - index] = getBit(bits, index)

  for (let index = 0; index < 8; index += 1) grid.modules[8][size - 1 - index] = getBit(bits, index)
  for (let index = 8; index < 15; index += 1) grid.modules[size - 15 + index][8] = getBit(bits, index)
  grid.modules[size - 8][8] = true
}

function drawVersionInformation(grid: Grid, version: number) {
  if (version < 7) return

  let remainder = version
  for (let index = 0; index < 12; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
  }
  const bits = (version << 12) | (remainder & 0xfff)

  for (let index = 0; index < 18; index += 1) {
    const bit = getBit(bits, index)
    const outer = grid.size - 11 + (index % 3)
    const inner = Math.floor(index / 3)
    grid.modules[inner][outer] = bit
    grid.modules[outer][inner] = bit
  }
}

function placeData(grid: Grid, bits: number[]) {
  let cursor = 0
  let upward = true

  for (let right = grid.size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern, so the pair shifts left past it.
    if (right === 6) right = 5

    for (let step = 0; step < grid.size; step += 1) {
      const row = upward ? grid.size - 1 - step : step
      for (let offset = 0; offset < 2; offset += 1) {
        const column = right - offset
        if (grid.reserved[row][column]) continue
        // Remainder bits past the end of the stream stay light, as specified.
        grid.modules[row][column] = cursor < bits.length ? bits[cursor] === 1 : false
        cursor += 1
      }
    }

    upward = !upward
  }
}

function penaltyScore(modules: boolean[][], size: number) {
  let score = 0

  const runPenalty = (run: number) => (run >= 5 ? 3 + (run - 5) : 0)

  // Rule 1: runs of five or more identical modules in a line.
  for (let index = 0; index < size; index += 1) {
    let rowRun = 1
    let columnRun = 1

    for (let offset = 1; offset < size; offset += 1) {
      if (modules[index][offset] === modules[index][offset - 1]) {
        rowRun += 1
      } else {
        score += runPenalty(rowRun)
        rowRun = 1
      }

      if (modules[offset][index] === modules[offset - 1][index]) {
        columnRun += 1
      } else {
        score += runPenalty(columnRun)
        columnRun = 1
      }
    }

    score += runPenalty(rowRun) + runPenalty(columnRun)
  }

  // Rule 2: any 2x2 block of one colour.
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const value = modules[row][column]
      if (value === modules[row][column + 1] && value === modules[row + 1][column] && value === modules[row + 1][column + 1]) {
        score += 3
      }
    }
  }

  // Rule 3: finder-like sequences that could confuse a decoder.
  const pattern = [true, false, true, true, true, false, true]
  const quiet = [false, false, false, false]
  const forward = [...pattern, ...quiet]
  const backward = [...quiet, ...pattern]

  const matchesAt = (read: (offset: number) => boolean, start: number, target: boolean[]) =>
    target.every((value, offset) => read(start + offset) === value)

  for (let index = 0; index < size; index += 1) {
    for (let start = 0; start + 11 <= size; start += 1) {
      const readRow = (offset: number) => modules[index][offset]
      const readColumn = (offset: number) => modules[offset][index]
      if (matchesAt(readRow, start, forward) || matchesAt(readRow, start, backward)) score += 40
      if (matchesAt(readColumn, start, forward) || matchesAt(readColumn, start, backward)) score += 40
    }
  }

  // Rule 4: drift away from an even balance of dark and light.
  let dark = 0
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (modules[row][column]) dark += 1
    }
  }
  const percent = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10

  return score
}

export type QrMatrix = {
  size: number
  modules: boolean[][]
  version: number
  level: EccLevel
}

/**
 * Encode text as a QR matrix. Returns null when the text is longer than a
 * version 10 symbol can hold at the requested level, so callers can show a real
 * message rather than a broken image.
 */
export function encodeQr(text: string, level: EccLevel = "M"): QrMatrix | null {
  const bytes = new TextEncoder().encode(text)
  const version = selectVersion(bytes.length, level)
  if (version === null) return null

  const bits = encodeCodewords(bytes, version, level)

  let best: { modules: boolean[][]; score: number } | null = null

  for (let mask = 0; mask < MASKS.length; mask += 1) {
    const grid = createGrid(version)
    drawFunctionPatterns(grid, version)
    drawVersionInformation(grid, version)
    placeData(grid, bits)

    const condition = MASKS[mask]
    for (let row = 0; row < grid.size; row += 1) {
      for (let column = 0; column < grid.size; column += 1) {
        if (grid.reserved[row][column]) continue
        if (condition(row, column)) grid.modules[row][column] = !grid.modules[row][column]
      }
    }

    drawFormatInformation(grid, mask, level)

    const score = penaltyScore(grid.modules, grid.size)
    if (!best || score < best.score) best = { modules: grid.modules, score }
  }

  if (!best) return null
  return { size: version * 4 + 17, modules: best.modules, version, level }
}

/**
 * Build a single SVG path covering every dark module. One path keeps the DOM
 * small enough to render inline without a measurable cost, even at card size.
 */
export function qrPath(matrix: QrMatrix) {
  const segments: string[] = []
  for (let row = 0; row < matrix.size; row += 1) {
    for (let column = 0; column < matrix.size; column += 1) {
      if (matrix.modules[row][column]) segments.push(`M${column} ${row}h1v1h-1z`)
    }
  }
  return segments.join("")
}

export const QR_QUIET_ZONE = 4

/* -------------------------------------------------------------------------- */
/* Styled rendering                                                            */
/* -------------------------------------------------------------------------- */

export type QrModuleStyle = "square" | "rounded" | "dots"
export type QrEyeStyle = "square" | "rounded" | "circle"

export type QrStyle = {
  moduleStyle: QrModuleStyle
  eyeStyle: QrEyeStyle
  dark: string
  light: string
  /** Quiet zone in modules. Values below the ISO minimum are clamped at render time. */
  quietZone: number
  /**
   * Fraction of the symbol's width cleared in the centre for a logo. Zero
   * disables the knockout. Only meaningful alongside error correction level H.
   */
  logoArea: number
}

export const DEFAULT_QR_STYLE: QrStyle = {
  moduleStyle: "rounded",
  eyeStyle: "rounded",
  dark: "#0b1413",
  light: "#ffffff",
  quietZone: QR_QUIET_ZONE,
  logoArea: 0,
}

/** The three 7x7 finder patterns are drawn separately so they can be styled. */
function isEyeModule(row: number, column: number, size: number) {
  const inTopLeft = row < 7 && column < 7
  const inTopRight = row < 7 && column >= size - 7
  const inBottomLeft = row >= size - 7 && column < 7
  return inTopLeft || inTopRight || inBottomLeft
}

/**
 * The square cleared for a logo, rounded outward to whole modules so the
 * knockout lands on the grid rather than slicing modules in half.
 */
export function qrLogoBounds(matrix: QrMatrix, logoArea: number) {
  if (logoArea <= 0) return null

  const span = Math.max(1, Math.round(matrix.size * logoArea))
  // An odd span centres exactly, which reads better against the symmetric grid.
  const oddSpan = span % 2 === 0 ? span + 1 : span
  const start = Math.floor((matrix.size - oddSpan) / 2)
  return { start, end: start + oddSpan, span: oddSpan }
}

function isLogoModule(row: number, column: number, bounds: { start: number; end: number } | null) {
  if (!bounds) return false
  return row >= bounds.start && row < bounds.end && column >= bounds.start && column < bounds.end
}

/** A rounded rectangle with independent corner radii, in module units. */
function roundedCell(x: number, y: number, tl: number, tr: number, br: number, bl: number) {
  const round = (value: number) => Number(value.toFixed(3))

  return [
    `M${round(x + tl)} ${round(y)}`,
    `H${round(x + 1 - tr)}`,
    tr > 0 ? `A${round(tr)} ${round(tr)} 0 0 1 ${round(x + 1)} ${round(y + tr)}` : "",
    `V${round(y + 1 - br)}`,
    br > 0 ? `A${round(br)} ${round(br)} 0 0 1 ${round(x + 1 - br)} ${round(y + 1)}` : "",
    `H${round(x + bl)}`,
    bl > 0 ? `A${round(bl)} ${round(bl)} 0 0 1 ${round(x)} ${round(y + 1 - bl)}` : "",
    `V${round(y + tl)}`,
    tl > 0 ? `A${round(tl)} ${round(tl)} 0 0 1 ${round(x + tl)} ${round(y)}` : "",
    "Z",
  ]
    .filter(Boolean)
    .join("")
}

/**
 * Build the drawable geometry for a styled code.
 *
 * Rounded modules only round a corner where both of its neighbours are light,
 * so runs of adjacent modules stay visually joined instead of degrading into a
 * field of disconnected lozenges.
 */
export function qrGeometry(matrix: QrMatrix, style: QrStyle = DEFAULT_QR_STYLE) {
  const { size, modules } = matrix
  const bounds = qrLogoBounds(matrix, style.logoArea)
  const segments: string[] = []

  const dark = (row: number, column: number) =>
    row >= 0 && row < size && column >= 0 && column < size && modules[row][column] && !isEyeModule(row, column, size) && !isLogoModule(row, column, bounds)

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (!dark(row, column)) continue

      if (style.moduleStyle === "square") {
        segments.push(`M${column} ${row}h1v1h-1z`)
        continue
      }

      if (style.moduleStyle === "dots") {
        // Two arcs are cheaper than a <circle> per module and keep it one path.
        const cx = column + 0.5
        const cy = row + 0.5
        const r = 0.42
        segments.push(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`)
        continue
      }

      const radius = 0.36
      const up = dark(row - 1, column)
      const down = dark(row + 1, column)
      const left = dark(row, column - 1)
      const right = dark(row, column + 1)

      segments.push(
        roundedCell(
          column,
          row,
          up || left ? 0 : radius,
          up || right ? 0 : radius,
          down || right ? 0 : radius,
          down || left ? 0 : radius,
        ),
      )
    }
  }

  return { modulesPath: segments.join(""), logoBounds: bounds }
}

/**
 * Eye geometry. `roundedCell` works in single-module units, but an eye is seven
 * modules across, so its ring and core are emitted as their own scaled frames.
 */
function eyePaths(matrix: QrMatrix, style: QrStyle) {
  const { size } = matrix
  const outer: string[] = []
  const inner: string[] = []

  const outerRadius = style.eyeStyle === "square" ? 0 : style.eyeStyle === "circle" ? 3.5 : 1.9
  const coreRadius = style.eyeStyle === "square" ? 0 : style.eyeStyle === "circle" ? 1.5 : 0.85

  const frame = (x: number, y: number, span: number, radius: number) => {
    const r = Math.min(radius, span / 2)
    const round = (value: number) => Number(value.toFixed(3))
    return [
      `M${round(x + r)} ${round(y)}`,
      `H${round(x + span - r)}`,
      r > 0 ? `A${round(r)} ${round(r)} 0 0 1 ${round(x + span)} ${round(y + r)}` : "",
      `V${round(y + span - r)}`,
      r > 0 ? `A${round(r)} ${round(r)} 0 0 1 ${round(x + span - r)} ${round(y + span)}` : "",
      `H${round(x + r)}`,
      r > 0 ? `A${round(r)} ${round(r)} 0 0 1 ${round(x)} ${round(y + span - r)}` : "",
      `V${round(y + r)}`,
      r > 0 ? `A${round(r)} ${round(r)} 0 0 1 ${round(x + r)} ${round(y)}` : "",
      "Z",
    ]
      .filter(Boolean)
      .join("")
  }

  for (const [row, column] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    // Ring drawn as an outer frame plus a reversed inner frame (even-odd fill).
    outer.push(frame(column, row, 7, outerRadius))
    outer.push(frame(column + 1, row + 1, 5, Math.max(outerRadius - 1, 0)))
    inner.push(frame(column + 2, row + 2, 3, coreRadius))
  }

  return { ring: outer.join(""), core: inner.join("") }
}

export type QrRender = {
  extent: number
  quietZone: number
  modulesPath: string
  eyeRing: string
  eyeCore: string
  logoBounds: { start: number; end: number; span: number } | null
}

export function qrRender(matrix: QrMatrix, style: QrStyle = DEFAULT_QR_STYLE): QrRender {
  const { modulesPath, logoBounds } = qrGeometry(matrix, style)
  const { ring, core } = eyePaths(matrix, style)
  const quietZone = Math.max(QR_QUIET_ZONE, Math.round(style.quietZone))

  return {
    extent: matrix.size + quietZone * 2,
    quietZone,
    modulesPath,
    eyeRing: ring,
    eyeCore: core,
    logoBounds,
  }
}

/** A standalone SVG document, used for the vector download. */
export function qrSvgDocument(
  matrix: QrMatrix,
  style: QrStyle = DEFAULT_QR_STYLE,
  logoDataUrl?: string | null,
) {
  const render = qrRender(matrix, style)
  const { extent } = render
  const bounds = render.logoBounds

  const logo =
    bounds && logoDataUrl
      ? `<image href="${logoDataUrl}" x="${render.quietZone + bounds.start + 0.5}" y="${render.quietZone + bounds.start + 0.5}" width="${bounds.span - 1}" height="${bounds.span - 1}" preserveAspectRatio="xMidYMid meet"/>`
      : ""

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" width="${extent * 8}" height="${extent * 8}">`,
    `<rect width="${extent}" height="${extent}" fill="${style.light}"/>`,
    `<g transform="translate(${render.quietZone} ${render.quietZone})">`,
    `<path d="${render.modulesPath}" fill="${style.dark}"/>`,
    `<path d="${render.eyeRing}" fill="${style.dark}" fill-rule="evenodd"/>`,
    `<path d="${render.eyeCore}" fill="${style.dark}"/>`,
    `</g>`,
    logo,
    `</svg>`,
  ].join("")
}

/** Rasterise the styled symbol for a print-ready PNG download. */
export function qrPngDataUrl(
  matrix: QrMatrix,
  pixelSize = 1024,
  style: QrStyle = DEFAULT_QR_STYLE,
  logo?: HTMLImageElement | null,
) {
  const render = qrRender(matrix, style)
  const scale = Math.max(1, pixelSize / render.extent)

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(render.extent * scale)
  canvas.height = canvas.width

  const context = canvas.getContext("2d")
  if (!context) return null

  context.fillStyle = style.light
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.save()
  context.translate(render.quietZone * scale, render.quietZone * scale)
  context.scale(scale, scale)
  context.fillStyle = style.dark

  context.fill(new Path2D(render.modulesPath))
  context.fill(new Path2D(render.eyeRing), "evenodd")
  context.fill(new Path2D(render.eyeCore))
  context.restore()

  if (render.logoBounds && logo) {
    const bounds = render.logoBounds
    const inset = 0.5
    const size = (bounds.span - inset * 2) * scale
    const offset = (render.quietZone + bounds.start + inset) * scale
    // Preserve the logo's aspect ratio inside the cleared square.
    const ratio = logo.naturalWidth / Math.max(logo.naturalHeight, 1)
    const width = ratio >= 1 ? size : size * ratio
    const height = ratio >= 1 ? size / ratio : size
    context.drawImage(logo, offset + (size - width) / 2, offset + (size - height) / 2, width, height)
  }

  return canvas.toDataURL("image/png")
}
