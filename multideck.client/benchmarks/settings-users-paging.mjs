import { performance } from "node:perf_hooks"
import { writeFileSync } from "node:fs"

const userCount = 100_000
const pageSize = 50
const warmups = 2
const runs = 9
const operationsPerSample = 3
const projectionPasses = 256
const variant = process.env.SETTINGS_USERS_BENCHMARK_VARIANT
const workload = process.env.SETTINGS_USERS_BENCHMARK_WORKLOAD ?? "default"

if (!new Set(["legacy", "bounded"]).has(variant)) throw new Error("Set SETTINGS_USERS_BENCHMARK_VARIANT to legacy or bounded.")
if (!new Set(["default", "office-search"]).has(workload)) throw new Error(`Unknown Settings Users workload '${workload}'.`)

const pad = (value, width = 6) => String(value).padStart(width, "0")
const roles = [
  { id: "role-administrator", name: "Administrator", description: "Workspace administrator", isSystem: true, isLegacyCustom: false, canEditPermissions: false, permissionValues: ["Users.Read", "Users.Manage"] },
  { id: "role-operator", name: "Operator", description: "Freight operator", isSystem: true, isLegacyCustom: false, canEditPermissions: false, permissionValues: ["Bookings.Read"] },
  { id: "role-viewer", name: "Viewer", description: "Read-only access", isSystem: true, isLegacyCustom: false, canEditPermissions: false, permissionValues: ["Bookings.Read"] },
]
const permissions = [
  { id: "permission-users-read", value: "Users.Read", group: "Users", name: "Read", description: "Read users", isDangerous: false },
  { id: "permission-users-manage", value: "Users.Manage", group: "Users", name: "Manage", description: "Manage users", isDangerous: true },
  { id: "permission-bookings-read", value: "Bookings.Read", group: "Bookings", name: "Read", description: "Read bookings", isDangerous: false },
]
const offices = Array.from({ length: 200 }, (_, index) => ({ id: `office-${pad(index, 3)}`, name: `Office ${pad(index, 3)}`, address: `${index + 1} Harbour Road` }))
const departments = Array.from({ length: 80 }, (_, index) => ({ id: `department-${pad(index, 3)}`, name: `Department ${pad(index, 3)}`, isActive: index % 11 !== 0 }))

function userFixture(index) {
  const office = offices[index % offices.length]
  const role = roles[index % roles.length]
  const department = departments[index % departments.length]
  const accessStatus = index % 37 === 0 ? "Deactivated" : index % 29 === 0 ? "Invited" : index % 41 === 0 ? "Profile only" : "Active"
  const hasAuthUser = accessStatus !== "Profile only" && accessStatus !== "Deactivated"
  const profilePhoto = index % 5 === 0 ? {
    bucket: "profile-photos",
    path: `auth-${pad(index, 12)}/avatar.webp`,
    mimeType: "image/webp",
    sizeBytes: 48_000 + index % 2_000,
    updatedAt: "2026-08-18T09:00:00.000Z",
  } : null
  return {
    id: `00000000-0000-4000-8000-${pad(index, 12)}`,
    authUserId: hasAuthUser ? `auth-${pad(index, 12)}` : null,
    displayName: `User ${pad(index)}`,
    firstName: "User",
    lastName: pad(index),
    email: `user.${pad(index)}@example.test`,
    company: { id: "company-1", name: "Fixture Freight" },
    offices: [office],
    roles: [{ id: role.id, name: role.name }],
    departments: [{ id: department.id, name: department.name, isActive: department.isActive }],
    status: accessStatus,
    invitationSentAt: accessStatus === "Invited" ? "2026-08-18T09:00:00.000Z" : null,
    deactivatedAt: accessStatus === "Deactivated" ? "2026-08-18T09:00:00.000Z" : null,
    jobTitle: index % 7 === 0 ? "Warehouse coordinator" : "Freight operator",
    profilePhoto,
    coverPhoto: null,
  }
}

const users = Array.from({ length: userCount }, (_, index) => userFixture(index))
const authorizationCatalogue = { permissions, roles, userRoles: [] }
const legacyAuthorization = {
  permissions,
  roles,
  userRoles: users.map((user) => ({ userId: user.id, roleIds: user.roles.map((role) => role.id) })),
}
const teamMetadata = { company: { id: "company-1", name: "Fixture Freight" }, offices, departments }
const legacyWire = JSON.stringify({ team: { ...teamMetadata, users }, authorization: legacyAuthorization })
const settings = workload === "default"
  ? { search: "", sort: "user", direction: "asc" }
  : { search: "office 042", sort: "office", direction: "desc" }

function roleName(user) {
  const role = roles.find((candidate) => candidate.id === user.roles[0]?.id)
  return role?.isLegacyCustom ? "Custom" : role?.name ?? "No role assigned"
}

function matches(user) {
  const searchable = [
    user.displayName,
    user.email,
    user.offices.map((office) => office.name).join(" "),
    roleName(user),
  ].join(" ").toLowerCase()
  return searchable.includes(settings.search.toLowerCase())
}

function sortUsers(rows) {
  return rows.sort((left, right) => {
    const value = (user) => settings.sort === "office" ? user.offices[0]?.name ?? "" : user.displayName
    const compared = value(left).localeCompare(value(right))
    return (settings.direction === "asc" ? compared : -compared) || left.email.localeCompare(right.email) || left.id.localeCompare(right.id)
  })
}

function selectPage(source) {
  const filtered = sortUsers(source.filter(matches))
  return {
    ...teamMetadata,
    users: filtered.slice(0, pageSize),
    total: filtered.length,
    authorization: authorizationCatalogue,
  }
}

const oracle = selectPage(users)
const boundedWire = JSON.stringify(oracle)
const photoCount = oracle.users.filter((user) => user.profilePhoto).length

function project(result) {
  let checksum = 0
  for (let pass = 0; pass < projectionPasses; pass += 1) checksum += JSON.stringify(result).length
  return checksum
}

function consumeLegacy() {
  const payload = JSON.parse(legacyWire)
  const result = selectPage(payload.team.users)
  result.authorization = { ...payload.authorization, userRoles: [] }
  return {
    result,
    projection: project(result),
    payloadBytes: Buffer.byteLength(legacyWire),
    requestCount: 2 + payload.team.users.filter((user) => user.profilePhoto).length,
    profilePhotoSigningRequests: payload.team.users.filter((user) => user.profilePhoto).length,
    heap: process.memoryUsage().heapUsed,
  }
}

function consumeBounded() {
  const result = JSON.parse(boundedWire)
  return {
    result,
    projection: project(result),
    payloadBytes: Buffer.byteLength(boundedWire),
    requestCount: 2 + (photoCount ? 1 : 0),
    profilePhotoSigningRequests: photoCount ? 1 : 0,
    heap: process.memoryUsage().heapUsed,
  }
}

const oracleSignature = JSON.stringify(oracle)
function assertCorrect(result) {
  if (JSON.stringify(result.result) !== oracleSignature) throw new Error(`${workload}: metadata, authorization catalogue, filtered total or ordered first page changed.`)
}

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return {
    median_ms: sorted[Math.floor(sorted.length / 2)],
    p95_ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    mean_ms: mean,
    min_ms: sorted[0],
    max_ms: sorted.at(-1),
    cv: Math.sqrt(variance) / mean,
    samples_ms: values,
  }
}

const consume = variant === "legacy" ? consumeLegacy : consumeBounded
for (let index = 0; index < warmups; index += 1) assertCorrect(consume())
const samples = []
const memory = []
let representative
for (let run = 0; run < runs; run += 1) {
  global.gc?.()
  const heapBefore = process.memoryUsage().heapUsed
  const startedAt = performance.now()
  for (let operation = 0; operation < operationsPerSample; operation += 1) {
    representative = consume()
    assertCorrect(representative)
  }
  samples.push((performance.now() - startedAt) / operationsPerSample)
  memory.push(Math.max(representative.heap - heapBefore, 0))
}

const timing = stats(samples)
const memoryStats = stats(memory)
const output = JSON.stringify({
  benchmark: "Settings Users roster browser data pipeline",
  workload,
  variant,
  limitation: "Deterministic local in-memory fixture. It writes no records and does not measure live Edge Function, PostgreSQL, Auth, Storage, RLS, rendering or public-network latency.",
  user_count: userCount,
  page_size: pageSize,
  warmups,
  runs,
  operations_per_sample: operationsPerSample,
  common_projection_passes: projectionPasses,
  correctness: "PASS: exact workspace metadata, authorization catalogue, filtered total and ordered first page match the shared oracle.",
  supabase_writes: 0,
  payload_bytes: representative.payloadBytes,
  request_count: representative.requestCount,
  profile_photo_signing_requests: representative.profilePhotoSigningRequests,
  memory_delta_bytes: memoryStats.median_ms,
  ...timing,
}, null, 2) + "\n"

if (process.env.SETTINGS_USERS_BENCHMARK_OUTPUT) writeFileSync(process.env.SETTINGS_USERS_BENCHMARK_OUTPUT, output, "utf8")
console.log(output.trimEnd())
