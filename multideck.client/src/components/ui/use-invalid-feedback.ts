"use client"

import * as React from "react"

type InvalidState = React.AriaAttributes["aria-invalid"]

function isInvalidState(value: InvalidState) {
  return value === true || value === "true"
}

/**
 * Adds a short, one-shot invalid cue when a control enters an error state.
 * The alternating value lets a later validation attempt replay the cue after
 * the field has been corrected and becomes invalid again.
 */
function useInvalidFeedback(
  ariaInvalid: InvalidState,
  motionEnabled = true,
) {
  const invalid = isInvalidState(ariaInvalid)
  const wasInvalid = React.useRef(invalid)
  const [feedback, setFeedback] = React.useState<"a" | "b">()

  React.useEffect(() => {
    if (motionEnabled && invalid && !wasInvalid.current) {
      setFeedback((current) => (current === "a" ? "b" : "a"))
    }

    wasInvalid.current = invalid
  }, [invalid, motionEnabled])

  return motionEnabled ? feedback : undefined
}

export { useInvalidFeedback }
