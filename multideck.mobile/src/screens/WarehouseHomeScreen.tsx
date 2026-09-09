import { ActionTile, WarehouseScreen } from "@/components/WarehouseUI"
import { wt } from "@/warehouse/i18n"

export type WarehouseRouteName = "Receive" | "Putaway" | "Pick" | "Ship" | "LocationCheck" | "StockEnquiry" | "StockItems" | "Pallets" | "PalletMove" | "Consolidation" | "Exceptions" | "HoldingFees"

export function WarehouseHomeScreen({ onOpen }: { onOpen: (route: WarehouseRouteName) => void }) {
  return (
    <WarehouseScreen>
      <ActionTile icon="↓" label={wt("receive")} detail={wt("receiveQueueDetail")} onPress={() => onOpen("Receive")} />
      <ActionTile icon="↳" label={wt("putAway")} detail={wt("putawayQueueDetail")} onPress={() => onOpen("Putaway")} />
      <ActionTile icon="✓" label={wt("pick")} detail={wt("pickQueueDetail")} onPress={() => onOpen("Pick")} />
      <ActionTile icon="↑" label={wt("ship")} detail={wt("shipQueueDetail")} onPress={() => onOpen("Ship")} />
      <ActionTile icon="⌖" label={wt("locationCheck")} onPress={() => onOpen("LocationCheck")} />
      <ActionTile icon="⌕" label={wt("stockEnquiry")} onPress={() => onOpen("StockEnquiry")} />
      <ActionTile icon="▦" label={wt("stockItems")} onPress={() => onOpen("StockItems")} />
      <ActionTile icon="□" label={wt("pallets")} onPress={() => onOpen("Pallets")} />
      <ActionTile icon="→" label={wt("moveOverride")} onPress={() => onOpen("PalletMove")} />
      <ActionTile icon="⊕" label={wt("consolidation")} onPress={() => onOpen("Consolidation")} />
      <ActionTile icon="!" label={wt("exceptions")} onPress={() => onOpen("Exceptions")} />
      <ActionTile icon="¤" label={wt("holdingFees")} onPress={() => onOpen("HoldingFees")} />

    </WarehouseScreen>
  )
}
