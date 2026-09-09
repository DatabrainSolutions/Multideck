import { assertEquals, assertThrows } from "jsr:@std/assert@1"
import { normaliseAudience, resolveAudience, type AudienceUser } from "./core.ts"

const users: AudienceUser[] = [
  { id: "active", email: "active@example.com", name: "Active User", authUserId: "auth-active", accessStatus: "active", departments: [{ id: "ops", name: "Operations", isActive: true }] },
  { id: "pending", email: "pending@example.com", name: "Pending User", authUserId: null, accessStatus: "active", departments: [{ id: "ops", name: "Operations", isActive: true }] },
  { id: "inactive", email: "inactive@example.com", name: "Inactive User", authUserId: "auth-inactive", accessStatus: "deactivated", departments: [] },
]

Deno.test("all audience includes every profile but excludes unsafe delivery targets", () => {
  assertEquals(resolveAudience(users, normaliseAudience({ mode: "all" })).map((user) => [user.id, user.status]), [["active", "ready"], ["inactive", "excluded"], ["pending", "excluded"]])
})

Deno.test("department audience uses canonical membership and removes duplicates", () => {
  assertEquals(resolveAudience(users, normaliseAudience({ mode: "departments", departmentIds: ["ops", "ops"] })).map((user) => user.id), ["active", "pending"])
})

Deno.test("empty scoped audiences are rejected before persistence", () => {
  assertThrows(() => normaliseAudience({ mode: "departments", departmentIds: [] }), Error, "Choose at least one department")
  assertThrows(() => normaliseAudience({ mode: "users", userIds: [] }), Error, "Choose at least one user")
})
