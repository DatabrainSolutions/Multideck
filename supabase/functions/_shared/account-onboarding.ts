// Account setup is personal, never an access grant or an operational Dexter action.
export const onboardingSteps = ["photo", "work", "availability", "connections", "dexter", "dictation", "appearance"] as const
export type OnboardingStep = typeof onboardingSteps[number]
export type OnboardingState = { version: 1; step: OnboardingStep; completed: OnboardingStep[]; tutorialStage: number; completedAt: string | null }

export function initialOnboardingState(): OnboardingState {
  return { version: 1, step: "photo", completed: [], tutorialStage: 0, completedAt: null }
}

export function readOnboardingState(value: unknown): OnboardingState | null {
  if (!value || typeof value !== "object") return null
  const state = value as OnboardingState
  if (state.version !== 1 || !onboardingSteps.includes(state.step)) return null
  return { version: 1, step: state.step, completed: Array.isArray(state.completed) ? onboardingSteps.filter((step) => state.completed.includes(step)) : [], tutorialStage: Math.max(0, Math.min(3, Number(state.tutorialStage) || 0)), completedAt: typeof state.completedAt === "string" ? state.completedAt : null }
}

export function advanceOnboarding(state: OnboardingState, step: unknown): OnboardingState {
  if (!onboardingSteps.includes(step as OnboardingStep)) throw new Error("Choose a valid setup step.")
  if (state.completedAt) return state
  if (state.completed.includes(step as OnboardingStep)) return state
  if (step !== state.step) throw new Error("Finish the current setup step first.")
  if (step === "dexter" && state.tutorialStage !== 3) throw new Error("Try the three Dexter exercises before continuing.")
  const completed = [...state.completed, step as OnboardingStep]
  return { ...state, completed, step: onboardingSteps[Math.min(onboardingSteps.indexOf(step as OnboardingStep) + 1, onboardingSteps.length - 1)] }
}

export function advanceOnboardingTutorial(state: OnboardingState, stage: unknown): OnboardingState {
  if (state.completedAt) return state
  if (state.step !== "dexter" || typeof stage !== "number" || !Number.isInteger(stage) || stage < 1 || stage > 3 || stage > state.tutorialStage + 1) throw new Error("Follow the Dexter exercises in order.")
  return { ...state, tutorialStage: Math.max(stage, state.tutorialStage) }
}

export function finishOnboarding(state: OnboardingState, now = new Date().toISOString()): OnboardingState {
  if (state.completedAt) return state
  if (state.tutorialStage !== 3 || onboardingSteps.some((step) => !state.completed.includes(step))) throw new Error("Finish your account setup before entering the workspace.")
  return { ...state, completedAt: now }
}
