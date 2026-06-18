import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react"
import L, { type LatLngExpression } from "leaflet"
import { ArrowRight, ChevronLeft, ChevronRight, Maximize2, Route, X } from "lucide-react"
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, ZoomControl } from "react-leaflet"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { liveBookings } from "@/data/multideck-data"
import { cn } from "@/lib/utils"
import { toneToVar } from "./status-pill"

type Booking = (typeof liveBookings)[number]
type Coordinate = readonly [number, number]

const mapCenter: LatLngExpression = [42, 36]
const mapBounds = L.latLngBounds(
  liveBookings.flatMap((booking) => [
    [booking.origin[0], booking.origin[1]] as [number, number],
    [booking.destination[0], booking.destination[1]] as [number, number],
  ]),
)

function curvedRoute(origin: Coordinate, destination: Coordinate) {
  const [startLat, startLng] = origin
  const [endLat, endLng] = destination
  const lngDistance = Math.abs(endLng - startLng)
  const controlLat = Math.max(startLat, endLat) + Math.min(Math.max(lngDistance * 0.1, 2), 18)
  const controlLng = (startLng + endLng) / 2

  return Array.from({ length: 42 }, (_, index) => {
    const t = index / 41
    const oneMinusT = 1 - t
    const lat = oneMinusT * oneMinusT * startLat + 2 * oneMinusT * t * controlLat + t * t * endLat
    const lng = oneMinusT * oneMinusT * startLng + 2 * oneMinusT * t * controlLng + t * t * endLng

    return [lat, lng] as [number, number]
  })
}

function routePoint(route: [number, number][], progress: number) {
  const index = Math.min(route.length - 1, Math.max(0, Math.round((progress / 100) * (route.length - 1))))

  return route[index]
}

function toLatLng(point: Coordinate): [number, number] {
  return [point[0], point[1]]
}

function markerIcon(color: string, variant: "terminal" | "current", selected = false) {
  const size = variant === "current" ? (selected ? 16 : 13) : 8

  return L.divIcon({
    className: "md-map-div-icon",
    html: `<span class="md-map-marker md-map-marker-${variant}" style="--marker-color:${color};--marker-size:${size}px"></span>`,
    iconAnchor: [size / 2, size / 2],
    iconSize: [size, size],
  })
}

function FitBookingBounds({
  selectedId,
  routeLookup,
  focusSelected = false,
}: {
  selectedId: string
  routeLookup: Map<string, [number, number][]>
  focusSelected?: boolean
}) {
  const map = useMap()

  useEffect(() => {
    const fitMap = () => {
      map.invalidateSize({ pan: false })

      if (focusSelected) {
        const selectedRoute = routeLookup.get(selectedId)

        if (selectedRoute?.length) {
          map.fitBounds(L.latLngBounds(selectedRoute), {
            animate: true,
            duration: 0.55,
            paddingTopLeft: [48, 72],
            paddingBottomRight: [420, 72],
            maxZoom: 5,
          })
          return
        }
      }

      map.fitBounds(mapBounds, { animate: false, padding: [28, 28] })
    }

    let frame = 0
    const scheduleFit = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(fitMap)
    }
    const earlyFit = window.setTimeout(scheduleFit, 80)
    const settledFit = window.setTimeout(scheduleFit, 260)
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleFit)

    scheduleFit()
    resizeObserver?.observe(map.getContainer())

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(earlyFit)
      window.clearTimeout(settledFit)
      resizeObserver?.disconnect()
    }
  }, [focusSelected, map, routeLookup, selectedId])

  return null
}

function MapStatusChip({ booking }: { booking: Booking }) {
  return (
    <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-[var(--md-radius-lg)] bg-white/80 px-3 py-2 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] backdrop-blur-md">
      <span className="text-[var(--md-ink)]">{booking.id}</span> · {booking.mode} · {booking.progress}% complete
    </div>
  )
}

function BookingRouteLayers({
  selectedId,
  routeLookup,
  onSelect,
}: {
  selectedId: string
  routeLookup: Map<string, [number, number][]>
  onSelect: (id: string) => void
}) {
  return (
    <>
      {liveBookings.map((booking) => {
        const selected = booking.id === selectedId
        const route = routeLookup.get(booking.id) ?? []
        const color = toneToVar(booking.tone)
        const currentPosition = routePoint(route, booking.progress)

        return (
          <Fragment key={booking.id}>
            <Polyline
              positions={route}
              pathOptions={{
                color,
                dashArray: selected ? undefined : "4 9",
                lineCap: "round",
                opacity: selected ? 0.94 : 0.54,
                weight: selected ? 4 : 3,
              }}
              eventHandlers={{ click: () => onSelect(booking.id) }}
            >
              <Tooltip sticky>
                {booking.id}: {booking.from} to {booking.to}
              </Tooltip>
            </Polyline>
            <Marker position={toLatLng(booking.origin)} icon={markerIcon(color, "terminal")}>
              <Tooltip>{booking.from}</Tooltip>
            </Marker>
            <Marker position={toLatLng(booking.destination)} icon={markerIcon(color, "terminal")}>
              <Tooltip>{booking.to}</Tooltip>
            </Marker>
            <Marker position={currentPosition} icon={markerIcon(color, "current", selected)} eventHandlers={{ click: () => onSelect(booking.id) }}>
              <Tooltip>
                {booking.id} · {booking.progress}% complete
              </Tooltip>
            </Marker>
          </Fragment>
        )
      })}
    </>
  )
}

function BookingMapCanvas({
  selectedId,
  routeLookup,
  onSelect,
  fullscreen = false,
}: {
  selectedId: string
  routeLookup: Map<string, [number, number][]>
  onSelect: (id: string) => void
  fullscreen?: boolean
}) {
  return (
    <MapContainer
      center={mapCenter}
      zoom={2}
      minZoom={2}
      maxZoom={7}
      zoomControl={false}
      className="md-booking-map absolute inset-0 h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ZoomControl position="bottomright" />
      <FitBookingBounds selectedId={selectedId} routeLookup={routeLookup} focusSelected={fullscreen} />
      <BookingRouteLayers selectedId={selectedId} routeLookup={routeLookup} onSelect={onSelect} />
    </MapContainer>
  )
}

function BookingMapCard({
  booking,
  selected,
  onSelect,
}: {
  booking: Booking
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "min-w-[170px] border-r border-[rgba(11,20,19,0.08)] bg-white px-4 py-3 text-left transition-[background,color,box-shadow,opacity,transform] duration-200 last:border-r-0 hover:bg-[var(--md-surface-soft)]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.12)]",
        selected && "bg-[var(--md-surface-soft)]",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: toneToVar(booking.tone), boxShadow: `0 0 0 4px color-mix(in srgb, ${toneToVar(booking.tone)} 12%, transparent)` }} />
        <p className="truncate text-[12px] font-medium text-[var(--md-text)]">{booking.id}</p>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2 text-[15px] font-medium text-[var(--md-ink)]">
        <span className="truncate">{booking.from}</span>
        <ArrowRight className="size-3 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.2} />
        <span className="truncate">{booking.to}</span>
      </div>
      <Progress
        value={booking.progress}
        className="mt-3 h-1.5 rounded-full bg-[rgba(90,103,100,0.16)] [&>div]:bg-[var(--progress-color)]"
        style={{ "--progress-color": toneToVar(booking.tone) } as CSSProperties}
      />
      <p className="mt-2 text-[12px] text-[var(--md-text)]">ETA {booking.eta} - {booking.time}</p>
    </button>
  )
}

function FullscreenRouteSidebar({
  selectedBooking,
  selectedId,
  onSelect,
  onPrevious,
  onNext,
}: {
  selectedBooking: Booking
  selectedId: string
  onSelect: (id: string) => void
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <aside className="absolute bottom-4 left-4 right-4 z-[560] max-h-[44vh] overflow-hidden rounded-[var(--md-radius-xl)] bg-white/84 shadow-[var(--md-shadow-lift)] backdrop-blur-xl md:bottom-auto md:left-auto md:right-5 md:top-5 md:flex md:h-[calc(100vh-40px)] md:w-[360px] md:max-h-none md:flex-col">
      <div className="flex items-start justify-between gap-4 px-5 py-5">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--md-surface-tint)] px-3 py-1 text-[12px] font-medium text-[var(--md-accent)]">
            <Route className="size-3.5" strokeWidth={1.3} />
            Route focus
          </div>
          <h3 className="text-[18px] font-medium leading-6 text-[var(--md-ink)]">{selectedBooking.from} to {selectedBooking.to}</h3>
          <p className="mt-1 text-[13px] text-[var(--md-text)]">{selectedBooking.id} · {selectedBooking.mode} · ETA {selectedBooking.eta} {selectedBooking.time}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous route"
            className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-white/70 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white"
            onClick={onPrevious}
          >
            <ChevronLeft className="size-4" strokeWidth={1.3} />
          </button>
          <button
            type="button"
            aria-label="Next route"
            className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-white/70 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white"
            onClick={onNext}
          >
            <ChevronRight className="size-4" strokeWidth={1.3} />
          </button>
        </div>
      </div>

      <div className="px-5 pb-4">
        <Progress
          value={selectedBooking.progress}
          className="h-2 rounded-full bg-[rgba(90,103,100,0.14)] [&>div]:bg-[var(--progress-color)]"
          style={{ "--progress-color": toneToVar(selectedBooking.tone) } as CSSProperties}
        />
        <div className="mt-2 flex justify-between text-[12px] font-medium text-[var(--md-text)]">
          <span>{selectedBooking.progress}% complete</span>
          <span style={{ color: toneToVar(selectedBooking.tone) }}>{selectedBooking.mode}</span>
        </div>
      </div>

      <div className="md-scrollbar flex gap-2 overflow-x-auto px-5 pb-5 md:flex-1 md:flex-col md:overflow-y-auto">
        {liveBookings.map((booking) => {
          const selected = booking.id === selectedId

          return (
            <button
              key={booking.id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "min-w-[260px] rounded-[var(--md-radius-lg)] bg-white/64 p-3 text-left shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] hover:bg-white md:min-w-0",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.12)]",
                selected && "bg-[var(--md-surface-tint)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.18),0_0_0_1px_rgba(11,20,19,0.04)]",
              )}
              onClick={() => onSelect(booking.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--md-text)]">
                  <span className="size-2.5 rounded-full" style={{ background: toneToVar(booking.tone), boxShadow: `0 0 0 4px color-mix(in srgb, ${toneToVar(booking.tone)} 12%, transparent)` }} />
                  {booking.id}
                </span>
                <span className="text-[12px] font-medium" style={{ color: toneToVar(booking.tone) }}>{booking.progress}%</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[14px] font-medium text-[var(--md-ink)]">
                <span className="truncate">{booking.from}</span>
                <ArrowRight className="size-3 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.2} />
                <span className="truncate">{booking.to}</span>
              </div>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">{booking.mode} · ETA {booking.eta} {booking.time}</p>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

export function InteractiveBookingMap({ className }: { className?: string }) {
  const [selectedId, setSelectedId] = useState(liveBookings[0].id)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const selectedBooking = liveBookings.find((booking) => booking.id === selectedId) ?? liveBookings[0]

  const routeLookup = useMemo(() => {
    return new Map(liveBookings.map((booking) => [booking.id, curvedRoute(booking.origin, booking.destination)]))
  }, [])

  const selectPreviousRoute = () => {
    const selectedIndex = liveBookings.findIndex((booking) => booking.id === selectedId)
    const nextIndex = selectedIndex <= 0 ? liveBookings.length - 1 : selectedIndex - 1

    setSelectedId(liveBookings[nextIndex].id)
  }

  const selectNextRoute = () => {
    const selectedIndex = liveBookings.findIndex((booking) => booking.id === selectedId)
    const nextIndex = selectedIndex >= liveBookings.length - 1 ? 0 : selectedIndex + 1

    setSelectedId(liveBookings[nextIndex].id)
  }

  return (
    <>
      <div className={cn("relative min-h-[310px] overflow-hidden bg-[var(--md-bg-strong)]", className)}>
        <MapStatusChip booking={selectedBooking} />
        <button
          type="button"
          aria-label="Open full-screen route map"
          className="absolute right-4 top-4 z-[500] grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-white/82 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] backdrop-blur-md transition-[background,color,box-shadow,opacity,transform] hover:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.12)]"
          onClick={() => setFullscreenOpen(true)}
        >
          <Maximize2 className="size-4" strokeWidth={1.3} />
        </button>
        <BookingMapCanvas selectedId={selectedId} routeLookup={routeLookup} onSelect={setSelectedId} />
      </div>
      <div className="grid overflow-x-auto border-t border-[rgba(11,20,19,0.08)] md:grid-cols-5 md-scrollbar">
        {liveBookings.map((booking) => (
          <BookingMapCard key={booking.id} booking={booking} selected={booking.id === selectedId} onSelect={() => setSelectedId(booking.id)} />
        ))}
      </div>
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent
          showCloseButton={false}
          className="fixed inset-0 left-0 top-0 z-50 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none bg-[var(--md-bg-strong)] p-0 ring-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">Live booking route map</DialogTitle>
          <DialogDescription className="sr-only">Full-screen live booking map with route navigation.</DialogDescription>
          <div className="relative h-full w-full">
            <MapStatusChip booking={selectedBooking} />
            <button
              type="button"
              aria-label="Close full-screen route map"
              className="absolute left-4 top-[58px] z-[570] grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-white/82 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] backdrop-blur-md transition-[background,color,box-shadow,opacity,transform] hover:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.12)] md:left-4 md:top-16"
              onClick={() => setFullscreenOpen(false)}
            >
              <X className="size-4" strokeWidth={1.3} />
            </button>
            <BookingMapCanvas selectedId={selectedId} routeLookup={routeLookup} onSelect={setSelectedId} fullscreen />
            <FullscreenRouteSidebar
              selectedBooking={selectedBooking}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPrevious={selectPreviousRoute}
              onNext={selectNextRoute}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
