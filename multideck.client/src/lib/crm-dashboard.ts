import type { CrmDashboardData } from "@/lib/lead-api"

/* Plain helpers behind the CRM dashboard panels. Kept out of the component
   module so it stays hot-reloadable. */

export function crmInitials(source: string) {
  const words = source.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean)
  const letters = words.length > 1 ? `${words[0][0]}${words[1][0]}` : source.slice(0, 2)
  return letters.toLocaleUpperCase()
}

/** The first segment of a stored address label is the town; the rest is county,
 *  postcode and country, which is noise on a compact map label. */
export function areaTown(label: string) {
  return label.split(" · ")[0] || label
}

export type AreaCoordinate = readonly [number, number]

/**
 * Dashboard area records currently carry a human address label rather than a
 * geocode. Resolve the towns we support locally so the dashboard remains fast,
 * deterministic and does not send customer addresses to a third-party
 * geocoding service. Unknown places stay explicit in the footer.
 */
const areaCoordinates: Record<string, AreaCoordinate> = {
  aberdeen: [57.1497, -2.0943],
  belfast: [54.5973, -5.9301],
  birmingham: [52.4862, -1.8904],
  bradford: [53.795, -1.7594],
  brighton: [50.8225, -0.1372],
  bristol: [51.4545, -2.5879],
  cambridge: [52.2053, 0.1218],
  cardiff: [51.4816, -3.1791],
  coventry: [52.4068, -1.5197],
  derby: [52.9225, -1.4746],
  dundee: [56.462, -2.9707],
  edinburgh: [55.9533, -3.1883],
  exeter: [50.7184, -3.5339],
  glasgow: [55.8642, -4.2518],
  gloucester: [51.8642, -2.2382],
  hull: [53.7676, -0.3274],
  leeds: [53.8008, -1.5491],
  leicester: [52.6369, -1.1398],
  liverpool: [53.4084, -2.9916],
  london: [51.5072, -0.1276],
  manchester: [53.4808, -2.2426],
  middlesbrough: [54.5742, -1.235],
  newcastle: [54.9783, -1.6178],
  northampton: [52.2405, -0.9027],
  norwich: [52.6309, 1.2974],
  nottingham: [52.9548, -1.1581],
  oxford: [51.752, -1.2577],
  peterborough: [52.5695, -0.2405],
  plymouth: [50.3755, -4.1427],
  portsmouth: [50.8198, -1.088],
  preston: [53.7632, -2.7031],
  reading: [51.4543, -0.9781],
  sheffield: [53.3811, -1.4701],
  southampton: [50.9097, -1.4044],
  stoke: [53.0027, -2.1794],
  sunderland: [54.9069, -1.3838],
  swansea: [51.6214, -3.9436],
  york: [53.959, -1.0815],
}

/** Whether any area on file can be placed on the map. The dashboard leaves the
 *  map out entirely when none can, rather than giving a third of a row to an
 *  empty basemap. */
export function hasMappableCrmAreas(areas: CrmDashboardData["areas"]) {
  return areas.some((area) => coordinateForArea(area.label) !== null)
}

export function coordinateForArea(label: string): AreaCoordinate | null {
  const town = areaTown(label).trim().toLocaleLowerCase()
  const exact = areaCoordinates[town]
  if (exact) return exact

  const match = Object.entries(areaCoordinates).find(([name]) => town.includes(name) || name.includes(town))
  return match?.[1] ?? null
}
