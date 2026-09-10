import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const encode = (source) => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
const stateSource = await readFile(new URL('../functions/_shared/account-onboarding.ts', import.meta.url), 'utf8')
const stateUrl = encode(stateSource)
let source = await readFile(new URL('../functions/account/onboarding.ts', import.meta.url), 'utf8')
source = source.replace(/^import .*\n/gm, '')
const { accountOnboarding } = await import(encode(`
import { advanceOnboarding, advanceOnboardingTutorial, finishOnboarding, readOnboardingState } from '${stateUrl}';
const body = request => request.json();
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const currentInternalUser = admin => Promise.resolve(admin.actor);
const singleTeamUserReadModel = admin => Promise.resolve(admin.profile);
const requireMainIdentityAdministration = () => Promise.resolve();
const json = (_request, value) => value;
${source}`))

function database({ profileMissing = false, authFailure = false, metadataMissing = false } = {}) {
  const user = { id: 'auth-a', app_metadata: { multideck_onboarding: { version: 1, step: 'work', completed: ['photo'], tutorialStage: 0, completedAt: null } }, user_metadata: {} }
  const db = {
    actor: { User_ID: 'user-a', Auth_User_ID: 'auth-a', Company_ID: 'company-a' },
    profile: { departments: [{ id: 'department-a', name: 'Operations' }] },
    row: { User_ID: 'user-a', User_JobTitle: null, User_ThemeMode: 'dark', User_AccentPreset: 'cobalt' },
    writes: [], user,
    from(table) {
      let update
      const filters = []
      const query = {
        select() { return query }, eq(key, value) { filters.push([key, value]); return query }, order() { return query },
        limit() { return Promise.resolve({ data: [{ Department_ID: 'department-a', Department_Name: 'Operations' }], error: null }) },
        update(value) { update = value; return query },
        insert() { db.writes.push('audit'); return Promise.resolve({ error: null }) },
        single() {
          assert.equal(table, 'cmp_Users')
          assert.deepEqual(filters, [['User_ID', 'user-a'], ['Auth_User_ID', 'auth-a'], ['Company_ID', 'company-a']])
          if (update) {
            db.writes.push('profile')
            if (profileMissing) return Promise.resolve({ data: null, error: null })
            Object.assign(db.row, update)
          }
          return Promise.resolve({ data: { ...db.row }, error: null })
        },
      }
      return query
    },
    auth: { admin: { async updateUserById(id, value) {
      assert.equal(id, 'auth-a'); db.writes.push('auth')
      if (authFailure) return { data: null, error: new Error('offline') }
      Object.assign(user, structuredClone(value))
      if (metadataMissing) user.user_metadata = {}
      return { data: { user }, error: null }
    } } },
  }
  return db
}
const profile = { action: 'profile', jobTitle: 'Operations manager', preferredName: 'Alex', phone: '+44 1234', departmentIds: [] }
const request = (payload) => new Request('https://example.invalid/onboarding', payload ? { method: 'PATCH', body: JSON.stringify(payload) } : {})

test('profile fields and deliberately empty departments survive a fresh read', async () => {
  const db = database()
  const result = await accountOnboarding(request(profile), db, db.user)
  assert.equal(result.state.step, 'availability')
  assert.equal(db.row.User_JobTitle, profile.jobTitle)
  const loaded = await accountOnboarding(request(), db, db.user)
  assert.equal(loaded.preferredName, profile.preferredName)
  assert.equal(loaded.phone, profile.phone)
  assert.equal(loaded.hasProfileDepartments, true)
  assert.deepEqual(loaded.profileDepartmentIds, [])
  assert.equal(loaded.themeMode, 'dark')
  assert.equal(loaded.accentPreset, 'cobalt')
})

test('a zero-row profile update cannot advance setup', async () => {
  const db = database({ profileMissing: true })
  await assert.rejects(accountOnboarding(request(profile), db, db.user), /profile could not be saved/)
  assert.deepEqual(db.writes, ['profile'])
  assert.equal(db.user.app_metadata.multideck_onboarding.step, 'work')
})

test('Auth failure leaves progress resumable and retry saves the same values', async () => {
  const failed = database({ authFailure: true })
  await assert.rejects(accountOnboarding(request(profile), failed, failed.user), /progress could not be saved/)
  assert.equal(failed.user.app_metadata.multideck_onboarding.step, 'work')
  const retry = database()
  await accountOnboarding(request(profile), retry, retry.user)
  assert.equal(retry.user.user_metadata.role_title, profile.jobTitle)
  assert.equal(retry.user.app_metadata.multideck_onboarding.step, 'availability')
})

test('missing returned profile metadata is not reported as success', async () => {
  const db = database({ metadataMissing: true })
  await assert.rejects(accountOnboarding(request(profile), db, db.user), /details could not be confirmed/)
})

test('department IDs outside the workspace are denied before any writes', async () => {
  const db = database()
  await assert.rejects(accountOnboarding(request({ ...profile, departmentIds: ['another-company-department'] }), db, db.user), /departments from this workspace/)
  assert.deepEqual(db.writes, [])
})
