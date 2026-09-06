import type { BookingWorkflowRoute } from "./booking-workflow-api"
import { freightModeKey } from "./freight-field-policy"

export const routeSharedReferenceFields = ["masterTransportReference", "houseTransportReference", "carrierBookingReference", "transportMeansName"] as const

export function routeSharedReferences(route: BookingWorkflowRoute) {
  return Object.fromEntries(routeSharedReferenceFields.map((field) => [field, route[field]?.trim() || null]))
}

/** Called only after the operator confirms the mode change. Quotes stay untouched. */
export function changeBookingRouteMode(route: BookingWorkflowRoute, mode: string, savedRoute?: BookingWorkflowRoute): BookingWorkflowRoute {
  if (freightModeKey(route.mode) === freightModeKey(mode)) return { ...route, mode }
  const cleared = Object.fromEntries(routeSharedReferenceFields.map((field) => [field, ""]))
  return {
    ...route,
    ...cleared,
    // Do not invent capability on an older backend or copy a deadline into a new mode.
    ...Object.fromEntries(["cargoCutoffAt", "documentationCutoffAt", "vgmCutoffAt"].filter((field) => field in route).map((field) => [field, ""])),
    mode,
    routeData: {
      ...route.routeData,
      ...cleared,
      mode,
      // Bind the review to persisted evidence, not another unsaved draft edit.
      ...(savedRoute?.id ? { modeChangeReview: {
        fromMode: freightModeKey(savedRoute.mode),
        toMode: freightModeKey(mode),
        beforeReferences: routeSharedReferences(savedRoute),
      } } : {}),
    },
  }
}
