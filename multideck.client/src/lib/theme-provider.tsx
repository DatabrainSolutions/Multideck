import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

export type ThemeMode = "light" | "dark"

type ThemeSetter = ThemeMode | ((current: ThemeMode) => ThemeMode)

type ThemeContextValue = {
  theme: ThemeMode
  resolvedTheme: ThemeMode
  setTheme: (nextTheme: ThemeSetter) => void
  themes: ThemeMode[]
  systemTheme: undefined
}

type ThemeProviderProps = {
  children: ReactNode
  attribute?: "class"
  defaultTheme?: ThemeMode
  disableTransitionOnChange?: boolean
  enableSystem?: boolean
  /**
   * Pins the rendered document theme without replacing the signed-in user's
   * stored preference. Public links use light here, then apply a tenant brand
   * inside their bounded surface.
   */
  forcedTheme?: ThemeMode
  storageKey: string
}

const themes: ThemeMode[] = ["light", "dark"]
const ThemeContext = createContext<ThemeContextValue | null>(null)

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark"
}

function readStoredTheme(storageKey: string, fallback: ThemeMode) {
  if (typeof window === "undefined") return fallback

  try {
    const stored = window.localStorage.getItem(storageKey)
    return isThemeMode(stored) ? stored : fallback
  } catch {
    return fallback
  }
}

function createTransitionLock() {
  const style = document.createElement("style")
  style.dataset.mdThemeTransitionLock = "true"
  style.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.appendChild(style)
  return style
}

function documentHasTheme(mode: ThemeMode) {
  const root = document.documentElement
  const otherMode = mode === "dark" ? "light" : "dark"
  return root.classList.contains(mode)
    && !root.classList.contains(otherMode)
    && root.style.colorScheme === mode
}

/**
 * Multideck's theme boundary commits React consumers and the document class in
 * the same layout phase. A passive-effect provider can paint theme-aware canvas,
 * icon, and toast consumers against the previous CSS tokens for one frame.
 */
export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "light",
  disableTransitionOnChange = true,
  enableSystem = false,
  forcedTheme,
  storageKey,
}: ThemeProviderProps) {
  if (attribute !== "class" || enableSystem) {
    throw new Error("Multideck ThemeProvider supports class-based light and dark themes only.")
  }

  const [theme, setThemeState] = useState<ThemeMode>(() => readStoredTheme(storageKey, defaultTheme))
  const themeRef = useRef(theme)
  const releaseTransitionRef = useRef<(() => void) | null>(null)
  const renderedTheme = forcedTheme ?? theme

  const applyDocumentTheme = useCallback((mode: ThemeMode) => {
    if (documentHasTheme(mode)) return

    releaseTransitionRef.current?.()
    const root = document.documentElement
    const lock = disableTransitionOnChange ? createTransitionLock() : null

    root.classList.remove("light", "dark")
    root.classList.add(mode)
    root.style.colorScheme = mode

    // Resolve the new token set while the lock is present. The lock survives
    // the first painted frame, so hundreds of colour properties cannot animate
    // independently while React consumers adopt the same mode.
    window.getComputedStyle(root).color
    const releaseFrame = window.requestAnimationFrame(() => {
      lock?.remove()
      if (releaseTransitionRef.current === release) releaseTransitionRef.current = null
    })
    const release = () => {
      window.cancelAnimationFrame(releaseFrame)
      lock?.remove()
    }
    releaseTransitionRef.current = release
  }, [disableTransitionOnChange])

  const commitTheme = useCallback((mode: ThemeMode, { persist = true } = {}) => {
    // The ref is the synchronous authority for user intent. Update it before
    // touching the document so an older concurrent render can only reconcile
    // towards the newest deliberate choice.
    themeRef.current = mode

    // Apply the document synchronously. React state can temporarily survive HMR
    // while the root class does not; even a same-state request must repair that
    // divergence instead of returning early and leaving the page stuck.
    applyDocumentTheme(forcedTheme ?? mode)

    if (persist) {
      try {
        window.localStorage.setItem(storageKey, mode)
      } catch {
        // Storage can be unavailable in hardened/private browser contexts. The
        // current tab must still switch cleanly.
      }
    }

    // Publish from the current React value, not from the ref. A click can leave
    // the document and ref on the new mode while a stale render still holds the
    // previous one; skipping that publish is what freezes the switch.
    setThemeState((current) => (current === mode ? current : mode))
  }, [applyDocumentTheme, forcedTheme, storageKey])

  const setTheme = useCallback((nextTheme: ThemeSetter) => {
    const resolved = typeof nextTheme === "function" ? nextTheme(themeRef.current) : nextTheme
    if (!isThemeMode(resolved)) return

    commitTheme(resolved)
  }, [commitTheme])

  useLayoutEffect(() => {
    // A render that began before a click may still commit afterwards. Never let
    // that older render repaint over the synchronous choice held in the ref.
    commitTheme(themeRef.current, { persist: false })
  }, [commitTheme, theme])

  useEffect(() => {
    const adoptThemeFromAnotherTab = (event: StorageEvent) => {
      if (event.key !== storageKey || !isThemeMode(event.newValue)) return
      commitTheme(event.newValue, { persist: false })
    }

    window.addEventListener("storage", adoptThemeFromAnotherTab)
    return () => window.removeEventListener("storage", adoptThemeFromAnotherTab)
  }, [commitTheme, storageKey])

  useEffect(() => () => releaseTransitionRef.current?.(), [])

  const value = useMemo<ThemeContextValue>(() => ({
    theme: renderedTheme,
    resolvedTheme: renderedTheme,
    setTheme,
    themes,
    systemTheme: undefined,
  }), [renderedTheme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error("useTheme must be used inside Multideck ThemeProvider.")
  return context
}
