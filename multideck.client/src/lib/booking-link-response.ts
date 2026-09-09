import type { BookingLink, BookingLinkHost, BookingLinkKind } from "./calendar-api"

type BookingLinkResponse = Omit<BookingLink, "kind" | "hosts"> & {
  kind?: unknown
  hosts?: BookingLinkHost[] | null
}

/** Before shared booking links existed, responses omitted both kind and hosts. */
export function normaliseBookingLink(link: BookingLinkResponse): BookingLink {
  const kind = link.kind ?? "one_on_one"
  if (kind !== "one_on_one" && kind !== "round_robin" && kind !== "collective") {
    // Do not silently relabel an unsupported shared-host scheduling policy.
    throw new Error("This booking link uses an unsupported booking type. Refresh the page or ask your workspace administrator to update Calendar.")
  }
  return { ...link, kind: kind as BookingLinkKind, hosts: Array.isArray(link.hosts) ? link.hosts : [] }
}
