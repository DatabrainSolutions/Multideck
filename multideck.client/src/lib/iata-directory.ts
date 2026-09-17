import { gunzipSync, strFromU8 } from "fflate"
export type IataAirport = readonly [code: string, name: string, city: string, country: string]
let directoryPromise: Promise<IataAirport[]> | null = null
export function loadIataDirectory() {
  directoryPromise ??= fetch("/reference/iata-airports.json.gz").then(async response => {
    if (!response.ok) throw new Error("Airport list is unavailable")
    const bytes = new Uint8Array(await response.arrayBuffer())
    return JSON.parse(bytes[0] === 0x1f && bytes[1] === 0x8b ? strFromU8(gunzipSync(bytes)) : strFromU8(bytes)) as IataAirport[]
  }).catch(error => { directoryPromise = null; throw error })
  return directoryPromise
}
