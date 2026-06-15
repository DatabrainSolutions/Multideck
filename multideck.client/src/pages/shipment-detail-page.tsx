import { ShipmentDetailWorkspace } from "@/components/multideck/shipment-components"

export function ShipmentDetailPage({
  navigate,
  shipmentId,
}: {
  navigate: (path: string) => void
  shipmentId: string
}) {
  return <ShipmentDetailWorkspace navigate={navigate} shipmentId={shipmentId} />
}
