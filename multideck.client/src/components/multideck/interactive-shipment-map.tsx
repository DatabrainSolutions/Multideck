import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react"
import L, { type LatLngExpression } from "leaflet"
import { ArrowRight, ChevronLeft, ChevronRight, Maximize2, Route, X } from "lucide-react"
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, ZoomControl } from "react-leaflet"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { liveShipments } from "@/data/multideck-data"
import { cn } from "@/lib/utils"
import { toneToVar } from "./status-pill"

type Shipment = (typeof liveShipments)[number]
type Coordinate = readonly [number, number]

const mapCenter: LatLngExpression = [42, 36]
const mapBounds = L.latLngBounds(
  liveShipments.flatMap((shipment) => [
    [shipment.origin[0], shipment.origin[1]] as [number, number],
    [shipment.destination[0], shipment.destination[1]] as [number, number],
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

function FitShipmentBounds({
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
    window.setTimeout(() => {
      map.invalidateSize()

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
    }, 80)
  }, [focusSelected, map, routeLookup, selectedId])

  return null
}

function MapStatusChip({ shipment }: { shipment: Shipment }) {
  return (
    <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-[var(--md-radius-lg)] bg-white/80 px-3 py-2 text-[12px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] backdrop-blur-md">
      <span className="text-[var(--md-ink)]">{shipment.id}</span> · {shipment.mode} · {shipment.progress}% complete
    </div>
  )
}

function ShipmentRouteLayers({
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
      {liveShipments.map((shipment) => {
        const selected = shipment.id === selectedId
        const route = routeLookup.get(shipment.id) ?? []
        const color = toneToVar(shipment.tone)
        const currentPosition = routePoint(route, shipment.progress)

        return (
          <Fragment key={shipment.id}>
            <Polyline
              positions={route}
              pathOptions={{
                color,
                dashArray: selected ? undefined : "4 9",
                lineCap: "round",
                opacity: selected ? 0.94 : 0.54,
                weight: selected ? 4 : 3,
              }}
              eventHandlers={{ click: () => onSelect(shipment.id) }}
            >
              <Tooltip sticky>
                {shipment.id}: {shipment.from} to {shipment.to}
              </Tooltip>
            </Polyline>
            <Marker position={toLatLng(shipment.origin)} icon={markerIcon(color, "terminal")}>
              <Tooltip>{shipment.from}</Tooltip>
            </Marker>
            <Marker position={toLatLng(shipment.destination)} icon={markerIcon(color, "terminal")}>
              <Tooltip>{shipment.to}</Tooltip>
            </Marker>
            <Marker position={currentPosition} icon={markerIcon(color, "current", selected)} eventHandlers={{ click: () => onSelect(shipment.id) }}>
              <Tooltip>
                {shipment.id} · {shipment.progress}% complete
              </Tooltip>
            </Marker>
          </Fragment>
        )
      })}
    </>
  )
}

function ShipmentMapCanvas({
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
      className="md-shipment-map h-full w-full"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ZoomControl position="bottomright" />
      <FitShipmentBounds selectedId={selectedId} routeLookup={routeLookup} focusSelected={fullscreen} />
      <ShipmentRouteLayers selectedId={selectedId} routeLookup={routeLookup} onSelect={onSelect} />
    </MapContainer>
  )
}

function ShipmentMapCard({
  shipment,
  selected,
  onSelect,
}: {
  shipment: Shipment
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "min-w-[170px] border-r border-[rgba(11,20,19,0.08)] bg-white px-4 py-3 text-left transition-all duration-200 last:border-r-0 hover:bg-[var(--md-surface-soft)]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.12)]",
        selected && "bg-[var(--md-surface-soft)]",
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <span className="size-3 rounded-full" style={{ background: toneToVar(shipment.tone), boxShadow: `0 0 0 4px color-mix(in srgb, ${toneToVar(shipment.tone)} 12%, transparent)` }} />
        <p className="truncate text-[12px] font-medium text-[var(--md-text)]">{shipment.id}</p>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2 text-[15px] font-medium text-[var(--md-ink)]">
        <span className="truncate">{shipment.from}</span>
        <ArrowRight className="size-3 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.2} />
        <span className="truncate">{shipment.to}</span>
      </div>
      <Progress
        value={shipment.progress}
        className="mt-3 h-1.5 rounded-full bg-[rgba(90,103,100,0.16)] [&>div]:bg-[var(--progress-color)]"
        style={{ "--progress-color": toneToVar(shipment.tone) } as CSSProperties}
      />
      <p className="mt-2 text-[12px] text-[var(--md-text)]">ETA {shipment.eta} - {shipment.time}</p>
    </button>
  )
}

function FullscreenRouteSidebar({
  selectedShipment,
  selectedId,
  onSelect,
  onPrevious,
  onNext,
}: {
  selectedShipment: Shipment
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
          <h3 className="text-[18px] font-medium leading-6 text-[var(--md-ink)]">{selectedShipment.from} to {selectedShipment.to}</h3>
          <p className="mt-1 text-[13px] text-[var(--md-text)]">{selectedShipment.id} · {selectedShipment.mode} · ETA {selectedShipment.eta} {selectedShipment.time}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Previous route"
            className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-white/70 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-all hover:bg-white"
            onClick={onPrevious}
          >
            <ChevronLeft className="size-4" strokeWidth={1.3} />
          </button>
          <button
            type="button"
            aria-label="Next route"
            className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-white/70 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-all hover:bg-white"
            onClick={onNext}
          >
            <ChevronRight className="size-4" strokeWidth={1.3} />
          </button>
        </div>
      </div>

      <div className="px-5 pb-4">
        <Progress
          value={selectedShipment.progress}
          className="h-2 rounded-full bg-[rgba(90,103,100,0.14)] [&>div]:bg-[var(--progress-color)]"
          style={{ "--progress-color": toneToVar(selectedShipment.tone) } as CSSProperties}
        />
        <div className="mt-2 flex justify-between text-[12px] font-medium text-[var(--md-text)]">
          <span>{selectedShipment.progress}% complete</span>
          <span style={{ color: toneToVar(selectedShipment.tone) }}>{selectedShipment.mode}</span>
        </div>
      </div>

      <div className="md-scrollbar flex gap-2 overflow-x-auto px-5 pb-5 md:flex-1 md:flex-col md:overflow-y-auto">
        {liveShipments.map((shipment) => {
          const selected = shipment.id === selectedId

          return (
            <button
              key={shipment.id}
              type="button"
              aria-pressed={selected}
              className={cn(
                "min-w-[260px] rounded-[var(--md-radius-lg)] bg-white/64 p-3 text-left shadow-[var(--md-shadow-line)] transition-all hover:bg-white md:min-w-0",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.12)]",
                selected && "bg-[var(--md-surface-tint)] shadow-[inset_0_0_0_1px_rgba(14,125,116,0.18),0_0_0_1px_rgba(11,20,19,0.04)]",
              )}
              onClick={() => onSelect(shipment.id)}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--md-text)]">
                  <span className="size-2.5 rounded-full" style={{ background: toneToVar(shipment.tone), boxShadow: `0 0 0 4px color-mix(in srgb, ${toneToVar(shipment.tone)} 12%, transparent)` }} />
                  {shipment.id}
                </span>
                <span className="text-[12px] font-medium" style={{ color: toneToVar(shipment.tone) }}>{shipment.progress}%</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-[14px] font-medium text-[var(--md-ink)]">
                <span className="truncate">{shipment.from}</span>
                <ArrowRight className="size-3 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.2} />
                <span className="truncate">{shipment.to}</span>
              </div>
              <p className="mt-1 text-[12px] text-[var(--md-text)]">{shipment.mode} · ETA {shipment.eta} {shipment.time}</p>
            </button>
          )
        })}
      </div>
    </aside>
  )
}

export function InteractiveShipmentMap() {
  const [selectedId, setSelectedId] = useState(liveShipments[0].id)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const selectedShipment = liveShipments.find((shipment) => shipment.id === selectedId) ?? liveShipments[0]

  const routeLookup = useMemo(() => {
    return new Map(liveShipments.map((shipment) => [shipment.id, curvedRoute(shipment.origin, shipment.destination)]))
  }, [])

  const selectPreviousRoute = () => {
    const selectedIndex = liveShipments.findIndex((shipment) => shipment.id === selectedId)
    const nextIndex = selectedIndex <= 0 ? liveShipments.length - 1 : selectedIndex - 1

    setSelectedId(liveShipments[nextIndex].id)
  }

  const selectNextRoute = () => {
    const selectedIndex = liveShipments.findIndex((shipment) => shipment.id === selectedId)
    const nextIndex = selectedIndex >= liveShipments.length - 1 ? 0 : selectedIndex + 1

    setSelectedId(liveShipments[nextIndex].id)
  }

  return (
    <>
      <div className="relative h-[310px] overflow-hidden bg-[var(--md-bg-strong)]">
        <MapStatusChip shipment={selectedShipment} />
        <button
          type="button"
          aria-label="Open full-screen route map"
          className="absolute right-4 top-4 z-[500] grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-white/82 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] backdrop-blur-md transition-all hover:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.12)]"
          onClick={() => setFullscreenOpen(true)}
        >
          <Maximize2 className="size-4" strokeWidth={1.3} />
        </button>
        <ShipmentMapCanvas selectedId={selectedId} routeLookup={routeLookup} onSelect={setSelectedId} />
      </div>
      <div className="grid overflow-x-auto border-t border-[rgba(11,20,19,0.08)] md:grid-cols-5 md-scrollbar">
        {liveShipments.map((shipment) => (
          <ShipmentMapCard key={shipment.id} shipment={shipment} selected={shipment.id === selectedId} onSelect={() => setSelectedId(shipment.id)} />
        ))}
      </div>
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent
          showCloseButton={false}
          className="fixed inset-0 left-0 top-0 z-50 h-[100dvh] w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none bg-[var(--md-bg-strong)] p-0 ring-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">Live shipment route map</DialogTitle>
          <DialogDescription className="sr-only">Full-screen live shipment map with route navigation.</DialogDescription>
          <div className="relative h-full w-full">
            <MapStatusChip shipment={selectedShipment} />
            <button
              type="button"
              aria-label="Close full-screen route map"
              className="absolute left-4 top-[58px] z-[570] grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-white/82 text-[var(--md-ink)] shadow-[var(--md-shadow-line)] backdrop-blur-md transition-all hover:bg-white focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.12)] md:left-4 md:top-16"
              onClick={() => setFullscreenOpen(false)}
            >
              <X className="size-4" strokeWidth={1.3} />
            </button>
            <ShipmentMapCanvas selectedId={selectedId} routeLookup={routeLookup} onSelect={setSelectedId} fullscreen />
            <FullscreenRouteSidebar
              selectedShipment={selectedShipment}
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
