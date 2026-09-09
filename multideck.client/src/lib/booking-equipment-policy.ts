import { freightFieldPolicy, type FreightContext } from "./freight-field-policy"

// Equipment is not cargo packaging. In particular, an aircraft pallet/net is
// a ULD; a carton or ordinary cargo pallet is not transport equipment.
export const bookingEquipmentKinds = {
  container: { label: "Container", numberLabel: "Container number", types: ["20GP", "40GP", "40HC", "45HC", "Reefer", "Open top", "Flat rack", "Other"] },
  uld: { label: "ULD", numberLabel: "ULD number", types: ["Aircraft container", "Aircraft pallet and net", "Other"] },
  vehicle: { label: "Vehicle", numberLabel: "Vehicle registration", types: ["Rigid truck", "Tractor unit", "Van", "Other"] },
  trailer: { label: "Trailer", numberLabel: "Trailer number", types: ["Curtainsider", "Box trailer", "Refrigerated trailer", "Flatbed", "Other"] },
  wagon: { label: "Wagon", numberLabel: "Wagon number", types: ["Covered wagon", "Open wagon", "Flat wagon", "Tank wagon", "Other"] },
} as const
export type BookingEquipmentKind = keyof typeof bookingEquipmentKinds

export function bookingEquipmentKindChoices(context: FreightContext): BookingEquipmentKind[] {
  const policy = freightFieldPolicy(context)
  return [
    ...(policy.containers ? ["container" as const] : []),
    ...(policy.uld ? ["uld" as const] : []),
    ...(policy.vehicle ? ["vehicle" as const, "trailer" as const] : []),
    ...(policy.wagon ? ["wagon" as const] : []),
  ]
}

export function bookingEquipmentPresentation(kind?: string | null) {
  // Missing kinds were stored as container by the original save boundary.
  // Never infer kind from a type string or the current Booking mode.
  const key = kind?.trim() || "container"
  if (Object.hasOwn(bookingEquipmentKinds, key)) return { key, ...bookingEquipmentKinds[key as BookingEquipmentKind] }
  return { key, label: `Equipment (${key})`, numberLabel: "Equipment number", types: [] as readonly string[] }
}

export function newBookingEquipment(kind: BookingEquipmentKind) {
  if (!Object.hasOwn(bookingEquipmentKinds, kind)) throw new Error("Choose an available equipment kind.")
  return { number: "", type: "", equipmentKind: kind, status: "planned", grossWeightKg: null, data: {} }
}
