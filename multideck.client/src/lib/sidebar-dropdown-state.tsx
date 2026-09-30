import { createContext, useCallback, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"

type OpenDropdown = { scope: string; id: string } | null

const SidebarDropdownContext = createContext<{
  open: OpenDropdown
  setOpen: Dispatch<SetStateAction<OpenDropdown>>
} | null>(null)

export function SidebarDropdownProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenDropdown>(null)
  return <SidebarDropdownContext.Provider value={{ open, setOpen }}>{children}</SidebarDropdownContext.Provider>
}

export function useSidebarDropdown(scope: string) {
  const context = useContext(SidebarDropdownContext)
  if (!context) throw new Error("Sidebar dropdowns must be inside SidebarDropdownProvider")

  const expandedId = context.open?.scope === scope ? context.open.id : null
  const setExpandedId = useCallback((value: SetStateAction<string | null>) => {
    context.setOpen((current) => {
      const currentId = current?.scope === scope ? current.id : null
      const nextId = typeof value === "function" ? value(currentId) : value
      return nextId ? { scope, id: nextId } : null
    })
  }, [context, scope])

  return [expandedId, setExpandedId] as const
}
