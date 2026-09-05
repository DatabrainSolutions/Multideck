import assert from "node:assert/strict"
import test from "node:test"
import { freightBookingMode, freightFieldPolicy, freightModeKey, freightShipmentAllowed, freightTransportField, freightRouteOperationalFields } from "../src/lib/freight-field-policy.ts"

test("sea containers follow the service across all commercial directions", () => {
  for (const direction of ["Import", "Export", "Cross trade", "Domestic"]) {
    const policy = freightFieldPolicy({ mode: "OCEAN", shipmentType: "FCL - Full Container Load", direction, stage: "booking" })
    assert.equal(policy.containers, true)
    assert.equal(policy.chargeableWeight, false)
    assert.equal(policy.vin, false)
  }
  assert.equal(freightFieldPolicy({ mode: "Sea", shipmentType: "LCL" }).containerRequests, false)
  assert.equal(freightFieldPolicy({ mode: "Sea", shipmentType: "LCL", hasContainers: true }).containers, true)
})

test("operational references follow each actual leg mode without mixing sea, air, road and rail", () => {
  const labels = mode => freightRouteOperationalFields(mode).map(item => item.label).join(";")
  assert.match(labels("air"), /Master air waybill/)
  assert.doesNotMatch(labels("air"), /bill of lading|Voyage|Trailer|CIM/)
  assert.match(labels("OCEAN"), /Master bill of lading.*House bill of lading.*Voyage number/)
  assert.doesNotMatch(labels("OCEAN"), /air waybill|Trailer|CIM/)
  assert.match(labels("road"), /CMR.*Trailer/)
  assert.match(labels("rail"), /CIM \/ SMGS/)
  assert.doesNotMatch(labels("rail"), /air waybill|Voyage|Trailer/)
  for (const mode of ["Warehouse", "Customs only", "Docs only"]) assert.deepEqual(freightRouteOperationalFields(mode), [])
  assert.match(labels("future-mode"), /Master transport reference/)
  assert.equal(freightRouteOperationalFields("sea").find(item => item.field === "voyageNumber").maxLength, 50)
})

test("air and ordinary road goods do not expose sea or vehicle-cargo fields", () => {
  const air = freightFieldPolicy({ mode: "Air", shipmentType: "AIR", stage: "booking", hasContainers: true })
  assert.equal(air.containers, false)
  assert.equal(air.hblMode, false)
  assert.equal(air.chargeableWeight, true)
  assert.equal(air.uld, true)
  assert.equal(freightFieldPolicy({ mode: "Road", shipmentType: "FTL" }).vin, false)
  assert.equal(freightFieldPolicy({ mode: "Sea", shipmentType: "RO_RO" }).vin, true)
})

test("multimodal derives equipment from its actual legs", () => {
  const context = { mode: "Multimodal", shipmentType: "FCL", stage: "booking" }
  assert.equal(freightFieldPolicy({ ...context, legModes: ["Road", "Rail"] }).containers, true)
  assert.equal(freightFieldPolicy({ ...context, legModes: ["Road", "Air"] }).hblMode, false)
  assert.equal(freightFieldPolicy({ ...context, legModes: ["Road", "Air"] }).chargeableWeight, true)
})

test("service filtering preserves valid rail and ULD choices and rejects cross-mode choices", () => {
  assert.equal(freightShipmentAllowed("Air", "ULD - Unit Load Device"), true)
  assert.equal(freightShipmentAllowed("Rail", "FCL - Full Container Load"), true)
  assert.equal(freightShipmentAllowed("Sea", "AIR"), false)
  assert.equal(freightShipmentAllowed("Air", "FCL"), false)
  assert.equal(freightShipmentAllowed("Multimodal", "LTL"), true)
})

test("unknown and specialist modes are never silently changed to Road or Vessel", () => {
  for (const mode of ["Rail", "Courier", "Warehouse", "Postal", "Customs only"]) {
    assert.notEqual(freightBookingMode(mode), "ROAD")
  }
  assert.equal(freightBookingMode("Rail"), "RAIL")
  assert.equal(freightBookingMode("future-mode"), "OTHER")
  for (const mode of ["Courier", "Warehouse", "Postal", "Customs only"]) {
    assert.notEqual(freightModeKey(mode), "road")
    assert.equal(freightTransportField(mode).field, "transportMeansName")
  }
  assert.equal(freightTransportField("Rail").field, "railService")
  assert.equal(freightModeKey("FAS"), "air")
})
