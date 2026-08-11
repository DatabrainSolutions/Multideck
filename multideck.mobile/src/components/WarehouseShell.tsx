import { createContext, type PropsWithChildren, useContext } from "react"
import type { WarehouseFacility } from "@/warehouse/api"

type WarehouseShellValue = {
  email: string
  facility: WarehouseFacility | null
  workspaceName: string
  onChangeWarehouse: () => void
  onChangeWorkspace: () => Promise<void>
  onSignOut: () => Promise<void>
}

const WarehouseShellContext = createContext<WarehouseShellValue | null>(null)

export function WarehouseShellProvider({ children, ...value }: PropsWithChildren<WarehouseShellValue>) {
  return <WarehouseShellContext.Provider value={value}>{children}</WarehouseShellContext.Provider>
}

export function useWarehouseShell() {
  return useContext(WarehouseShellContext)
}
