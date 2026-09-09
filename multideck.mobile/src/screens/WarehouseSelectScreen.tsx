import { useCallback, useEffect, useState } from "react"
import { ActionTile, EmptyState, ErrorState, LoadingState, WarehouseScreen } from "@/components/WarehouseUI"
import type { WarehouseFacility, WarehouseMobileApi } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"

export function WarehouseSelectScreen({ api, onSelect }: { api: WarehouseMobileApi; onSelect: (facility: WarehouseFacility) => void }) {
  const [facilities, setFacilities] = useState<WarehouseFacility[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setFacilities((await api.listFacilities()).filter((facility) => facility.isActive))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : wt("serviceError"))
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => { void load() }, [load])

  return (
    <WarehouseScreen title={wt("selectWarehouse")} subtitle={wt("selectWarehouseDetail")}>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : facilities.length ? facilities.map((facility) => (
        <ActionTile key={facility.id} icon="⌂" label={facility.name} detail={facility.code} onPress={() => onSelect(facility)} />
      )) : <EmptyState message={wt("noWarehouses")} />}
    </WarehouseScreen>
  )
}
