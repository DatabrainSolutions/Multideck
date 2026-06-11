import { ShipmentDetailWorkspace } from "@/components/multideck/shipment-components"

export function ShipmentDetailPage({ navigate }: { navigate: (path: string) => void }) {
  return <ShipmentDetailWorkspace navigate={navigate} />
}
