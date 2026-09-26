/** Shared external snapshot: visibility changes render before passive startup timers. */
export function createPageVisibility(page: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">) {
  return {
    getSnapshot: () => page.visibilityState === "visible",
    subscribe(listener: () => void) {
      page.addEventListener("visibilitychange", listener)
      return () => page.removeEventListener("visibilitychange", listener)
    },
  }
}
export const pageVisibility = createPageVisibility(typeof document === "undefined"
  ? { visibilityState: "visible", addEventListener() {}, removeEventListener() {} }
  : document)
