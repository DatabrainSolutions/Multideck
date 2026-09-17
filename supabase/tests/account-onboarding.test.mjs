import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8")
  return import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`)
}
const { initialOnboardingState, readOnboardingState, advanceOnboarding, advanceOnboardingTutorial, finishOnboarding, onboardingSteps } = await importTypeScript("../functions/_shared/account-onboarding.ts")
const { createInvitationTicket, verifyInvitationTicket } = await importTypeScript("../functions/_shared/invitation-ticket.ts")

test("an invitation resumes step by step, survives serialisation and finishes only after all exercises", () => {
  let state = initialOnboardingState()
  for (const step of onboardingSteps) {
    assert.equal(state.step, step)
    if (step === "dexter") {
      assert.throws(() => advanceOnboarding(state, step), /three Dexter exercises/)
      for (const stage of [1, 2, 3]) state = advanceOnboardingTutorial(state, stage)
    }
    state = readOnboardingState(JSON.parse(JSON.stringify(advanceOnboarding(state, step))))
  }
  const completed = finishOnboarding(state, "2026-09-10T20:00:00.000Z")
  assert.equal(completed.completedAt, "2026-09-10T20:00:00.000Z")
  assert.deepEqual(finishOnboarding(completed), completed)
})

test("jumping ahead, inventing steps and marking a tutorial complete out of order are rejected", () => {
  const state = initialOnboardingState()
  assert.throws(() => advanceOnboarding(state, "appearance"), /current setup step/)
  assert.throws(() => advanceOnboarding(state, "permissions"), /valid setup step/)
  assert.throws(() => finishOnboarding(state), /Finish your account setup/)
  assert.throws(() => advanceOnboardingTutorial(state, 3), /in order/)
  const dexter = { ...state, step: "dexter" }
  for (const stage of [3, -1, 1.5, "1", null]) assert.throws(() => advanceOnboardingTutorial(dexter, stage), /in order/)
})

test("retrying a saved step does not duplicate progress or move it backwards", () => {
  const state = advanceOnboarding(initialOnboardingState(), "photo")
  assert.deepEqual(advanceOnboarding(state, "photo"), state)
  const dexter = { ...state, step: "dexter", tutorialStage: 2 }
  assert.equal(advanceOnboardingTutorial(dexter, 1).tutorialStage, 2)
})

test("existing accounts and malformed metadata are not enrolled automatically", () => {
  for (const value of [null, undefined, {}, { version: 0, step: "photo" }, { version: 1, step: "admin" }]) assert.equal(readOnboardingState(value), null)
  const state = readOnboardingState({ version: 1, step: "photo", completed: ["permissions", "photo", "photo"], tutorialStage: 8 })
  assert.deepEqual(state.completed, ["photo"])
  assert.equal(state.tutorialStage, 3)
})

test("an invitation ticket cannot cross project signing boundaries or survive expiry/tampering", async () => {
  const now = Date.parse("2026-09-10T20:00:00Z")
  const userId = "00000000-0000-4000-8000-000000000001"
  const ticket = await createInvitationTicket(userId, "test-project-a", "3d", now)
  assert.equal((await verifyInvitationTicket(ticket, "test-project-a", now)).userId, userId)
  await assert.rejects(verifyInvitationTicket(ticket, "test-project-b", now), /invalid/)
  await assert.rejects(verifyInvitationTicket(ticket, "test-project-a", now + 3 * 86400000), /expired/)
  await assert.rejects(verifyInvitationTicket(`x${ticket}`, "test-project-a", now), /invalid/)
})
