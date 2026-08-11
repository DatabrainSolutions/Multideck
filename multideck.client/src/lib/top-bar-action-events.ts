export const topBarActionEvents = {
  createWarehouseObject: "multideck:warehouse:create-object",
  reportWarehouseLocationEmpty: "multideck:warehouse:report-location-empty",
  createWarehouseOrder: "multideck:warehouse:create-order",
  createWarehouseFacility: "multideck:warehouse:create-facility",
  createWarehouseItem: "multideck:warehouse:create-item",
  createWarehouseLocation: "multideck:warehouse:create-location",
  createCrmAccount: "multideck:crm:create-account",
  createCrmContact: "multideck:crm:create-contact",
  createCrmLead: "multideck:crm:create-lead",
  createCrmContactCard: "multideck:crm:create-contact-card",
} as const

export type TopBarActionEvent = (typeof topBarActionEvents)[keyof typeof topBarActionEvents]

const topBarActionListeners = new Map<TopBarActionEvent, Set<() => void>>()
const pendingTopBarActions = new Set<TopBarActionEvent>()

function flushPendingTopBarAction(eventName: TopBarActionEvent) {
  if (!pendingTopBarActions.has(eventName)) return
  const listeners = topBarActionListeners.get(eventName)
  if (!listeners?.size) return
  pendingTopBarActions.delete(eventName)
  listeners.forEach((listener) => listener())
}

export function subscribeTopBarAction(eventName: TopBarActionEvent, listener: () => void) {
  const listeners = topBarActionListeners.get(eventName) ?? new Set<() => void>()
  listeners.add(listener)
  topBarActionListeners.set(eventName, listeners)
  // Route shells can become interactive before a lazy page has mounted. Keep
  // the operator's click and deliver it as soon as the page owns the action.
  if (pendingTopBarActions.has(eventName)) {
    window.setTimeout(() => flushPendingTopBarAction(eventName), 0)
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) topBarActionListeners.delete(eventName)
  }
}

export function dispatchTopBarAction(eventName: TopBarActionEvent) {
  // Let the current button or menu interaction finish before the owning page
  // opens its dialog. This keeps React and Radix focus/close handling from
  // competing with the page state update.
  window.setTimeout(() => {
    const listeners = topBarActionListeners.get(eventName)
    if (!listeners?.size) {
      pendingTopBarActions.add(eventName)
      return
    }
    listeners.forEach((listener) => listener())
  }, 0)
}
