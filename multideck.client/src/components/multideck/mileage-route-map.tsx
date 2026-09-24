import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './mileage-route-map.css'
import type { MileageRouteData } from '@/lib/mileage-api'

function FitRoute({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => { map.invalidateSize(); map.fitBounds(points, { padding: [30, 30], maxZoom: 15, animate: false }) }, [map, points])
  return null
}
/** Draws provider road geometry, never a guessed line between addresses. */
export function MileageRouteMap({ route }: { route: MileageRouteData | null }) {
  if (!route?.points || route.points.length < 2) return <div className="mileage-map-unavailable"><p>The route map will appear after the locations are checked.</p></div>
  return <div className="relative isolate overflow-hidden rounded-lg" role="region" aria-label="Journey route map">
    <MapContainer className="mileage-route-map" style={{ height: 'var(--mileage-route-map-height, 300px)', width: '100%' }} center={route.points[0]} zoom={10} scrollWheelZoom={false}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      <FitRoute points={route.points} />
      <Polyline positions={route.points} interactive={false} pathOptions={{ color: 'var(--md-surface)', weight: 9, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
      <Polyline positions={route.points} pathOptions={{ color: 'var(--md-accent)', weight: 5, opacity: 1, lineCap: 'round', lineJoin: 'round' }} />
      {(route.stops ?? []).map((point,index) => <CircleMarker key={index} center={point} radius={7} pathOptions={{ color: 'var(--md-accent)', fillColor: 'var(--md-surface)', fillOpacity: 1, weight: 3 }}><Tooltip><span data-i18n-skip>{index+1}. {route.locationLabels?.[index] ?? 'Journey stop'}</span></Tooltip></CircleMarker>)}
    </MapContainer>
    <p className="mileage-hint mt-2">Route: {route.provider}. <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer" className="underline">Report a map issue</a></p>
  </div>
}
