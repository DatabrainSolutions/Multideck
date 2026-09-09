import { createInvitationTicket, verifyInvitationTicket, type InvitationExpiry } from "./invitation-ticket.ts"

const userId = "326efab3-2daf-4fcb-9aaa-34a85aa44b73"
const secret = "test-service-role-secret-that-is-long-enough"
const now = Date.UTC(2026, 7, 12, 12, 0, 0)

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function assertRejects(operation: () => Promise<unknown>, message: string) {
  try {
    await operation()
  } catch {
    return
  }
  throw new Error(message)
}

Deno.test("invitation tickets honour each selected expiry", async () => {
  const cases: Array<[InvitationExpiry, number | null]> = [
    ["3d", 3],
    ["7d", 7],
    ["30d", 30],
    ["never", null],
  ]

  for (const [expiry, days] of cases) {
    const ticket = await createInvitationTicket(userId, secret, expiry, now)
    const payload = await verifyInvitationTicket(ticket, secret, now + 60_000)
    assert(payload.userId === userId, `${expiry} ticket changed the user`)
    assert(payload.expiry === expiry, `${expiry} ticket changed the expiry`)
    assert(
      days === null ? payload.expiresAt === null : payload.expiresAt === Math.floor(now / 1000) + days * 24 * 60 * 60,
      `${expiry} ticket has the wrong expiry timestamp`,
    )
  }
})

Deno.test("mail-scanner opens do not consume an invitation ticket", async () => {
  const ticket = await createInvitationTicket(userId, secret, "7d", now)
  const firstOpen = await verifyInvitationTicket(ticket, secret, now + 1_000)
  const recipientOpen = await verifyInvitationTicket(ticket, secret, now + 60_000)
  assert(firstOpen.userId === recipientOpen.userId, "the second open should remain valid")
})

Deno.test("expired and tampered invitation tickets are rejected", async () => {
  const ticket = await createInvitationTicket(userId, secret, "3d", now)
  await assertRejects(
    () => verifyInvitationTicket(ticket, secret, now + 3 * 24 * 60 * 60 * 1_000),
    "the ticket should expire at the selected boundary",
  )
  await assertRejects(
    () => {
      const [payload, suppliedSignature] = ticket.split(".")
      const changedSignature = `${suppliedSignature[0] === "a" ? "b" : "a"}${suppliedSignature.slice(1)}`
      return verifyInvitationTicket(`${payload}.${changedSignature}`, secret, now + 1_000)
    },
    "a changed signature should be rejected",
  )
})

Deno.test("never-expiring invitations remain cryptographically valid until account completion", async () => {
  const ticket = await createInvitationTicket(userId, secret, "never", now)
  const payload = await verifyInvitationTicket(ticket, secret, now + 20 * 365 * 24 * 60 * 60 * 1_000)
  assert(payload.expiresAt === null, "never should not gain a time expiry")
})
