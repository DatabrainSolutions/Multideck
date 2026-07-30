import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ensureAccentApplied } from "./lib/accent-theme"
import "./styles.css"

// Before the first render, so the saved accent is already on the page rather than
// arriving a frame later as a flash of the default teal.
ensureAccentApplied()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
