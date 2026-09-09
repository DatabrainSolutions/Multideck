import { Component, type ErrorInfo, type ReactNode } from "react"

/** Keeps decorative WebGL failures local so the permanent CSS paint remains visible. */
export class ShaderErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; name?: string; onError?: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error)
    if (import.meta.env.DEV) console.warn(`${this.props.name ?? "Shader"} switched to its painted fallback.`, error, info)
  }

  render() {
    return this.state.failed ? this.props.fallback ?? null : this.props.children
  }
}
