import { gunzipSync, strFromU8 } from "fflate"

export type UnlocodeDirectoryRecord = readonly [
  countryCode: string,
  locationCode: string,
  name: string,
  nameWithoutDiacritics: string,
  functions: string,
]

export interface UnlocodeDirectoryMetadata {
  release: string
  recordCount: number
  source: string
  sourceOrganisation: string
  licence: string
  sha256: string
}

const RELEASE = "2025-1"
let directoryPromise: Promise<readonly UnlocodeDirectoryRecord[]> | null = null
let metadataPromise: Promise<UnlocodeDirectoryMetadata> | null = null

async function readResponse(response: Response) {
  if (!response.ok) throw new Error(`UN/LOCODE directory request failed with ${response.status}`)
  return response
}

export function loadUnlocodeDirectory() {
  directoryPromise ??= fetch(`/reference/unlocode-${RELEASE}.json.gz`)
    .then(readResponse)
    .then((response) => response.arrayBuffer())
    .then((payload) => {
      const bytes = new Uint8Array(payload)
      const json = bytes[0] === 0x1f && bytes[1] === 0x8b ? strFromU8(gunzipSync(bytes)) : strFromU8(bytes)
      return JSON.parse(json) as UnlocodeDirectoryRecord[]
    })
  return directoryPromise
}

export function loadUnlocodeDirectoryMetadata() {
  metadataPromise ??= fetch("/reference/unlocode-directory.meta.json")
    .then(readResponse)
    .then((response) => response.json() as Promise<UnlocodeDirectoryMetadata>)
  return metadataPromise
}

export function unlocodeKind(functions: string) {
  if (functions[0] === "1") return "port" as const
  if (functions[3] === "4") return "airport" as const
  if (functions[1] === "2") return "rail-terminal" as const
  if (functions[5] === "6") return "inland-terminal" as const
  return "city" as const
}
