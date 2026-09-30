import { useCallback, useEffect, useState } from "react"
import { ActionTile, EmptyState, ErrorState, LoadingState, WarehouseScreen } from "@/components/WarehouseUI"
import type { WarehouseFacility, WarehouseMobileApi } from "@/warehouse/api"
import { wt } from "@/warehouse/i18n"

export function WarehouseSelectScreen({ api, rememberedFacilityId, onSelect }: { api: WarehouseMobileApi; rememberedFacilityId?: string | null; onSelect: (facility: WarehouseFacility) => void }) {
  const [facilities, setFacilities] = useState<WarehouseFacility[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const active = (await api.listFacilities()).filter((facility) => facility.isActive)
      const remembered = active.find((facility) => facility.id === rememberedFacilityId) ?? (active.length === 1 ? active[0] : undefined)
      if (remembered) return onSelect(remembered)
      setFacilities(active)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : wt("serviceError"))
    } finally {
      setLoading(false)
    }
  }, [api, onSelect, rememberedFacilityId])

  useEffect(() => { void load() }, [load])

  return (
    <WarehouseScreen title={wt("selectWarehouse")} subtitle={wt("selectWarehouseDetail")}>
      {loading ? <LoadingState /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : facilities.length ? facilities.map((facility) => (
        <ActionTile key={facility.id} icon="⌂" label={facility.name} detail={facility.code} onPress={() => onSelect(facility)} />
      )) : <EmptyState message={wt("noWarehouses")} />}
    </WarehouseScreen>
  )
}
