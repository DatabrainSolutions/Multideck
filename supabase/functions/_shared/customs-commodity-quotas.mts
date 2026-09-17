export type CommodityQuota = {
  measureId: string
  orderNumber: string
  description: string
  area: string
  excludedAreas: string[]
  dutyRate: string
  validFrom: string
  validTo: string
  status: string
  balance: string
  initialVolume: string
  unit: string
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
const rows = (value: unknown) => Array.isArray(value) ? value.map(record) : []
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).replace(/<[^>]*>/g, "").trim().slice(0, 1000) : ""

/** Resolve only quota measures linked to this commodity and declaration direction. */
export function commodityQuotas(value: unknown, direction: "import" | "export"): CommodityQuota[] {
  const body = record(value)
  const included = rows(body.included)
  const lookup = new Map(included.map(row => [`${row.type}:${row.id}`, row]))
  const resolve = (relationship: unknown) => {
    const link = record(record(relationship).data)
    return lookup.get(`${link.type}:${link.id}`) ?? {}
  }
  const relationships = record(record(body.data).relationships)
  const measureIds = new Set(rows(record(relationships[`${direction}_measures`]).data).map(row => text(row.id)))
  return included.filter(row => row.type === "measure" && measureIds.has(text(row.id))).flatMap(measure => {
    const links = record(measure.relationships)
    const orderLink = record(record(links.order_number).data)
    const order = resolve(links.order_number)
    const number = text(record(order.attributes).number) || text(orderLink.id)
    if (!number) return []
    const definition = record(resolve(record(order.relationships).definition).attributes)
    const attributes = record(measure.attributes)
    const areaName = (row: Record<string, unknown>) => text(record(row.attributes).description) || text(row.id)
    return [{
      measureId: text(measure.id), orderNumber: number,
      description: text(record(resolve(links.measure_type).attributes).description) || "Tariff quota",
      area: areaName(resolve(links.geographical_area)),
      excludedAreas: rows(record(links.excluded_countries).data).map(link => areaName(lookup.get(`${link.type}:${link.id}`) ?? link)),
      dutyRate: text(record(resolve(links.duty_expression).attributes).base) || text(attributes.resolved_duty_expression),
      validFrom: text(definition.validity_start_date) || text(attributes.effective_start_date),
      validTo: text(definition.validity_end_date) || text(attributes.effective_end_date),
      status: text(definition.status), balance: text(definition.balance), initialVolume: text(definition.initial_volume),
      unit: text(definition.measurement_unit) || text(definition.monetary_unit),
    }]
  })
}
