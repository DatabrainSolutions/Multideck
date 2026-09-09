import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ensureAccentApplied, ensureAccentPreferenceLoaded } from "./lib/accent-theme"
import { installDeploymentPreloadRecovery } from "./lib/deployment-recovery"
import "./styles.css"

// Before the first render, so the saved accent is already on the page rather than
// arriving a frame later as a flash of the default teal. Light/dark is handled a
// step earlier still, by the blocking script in index.html.
ensureAccentApplied()
void ensureAccentPreferenceLoaded()
installDeploymentPreloadRecovery()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
