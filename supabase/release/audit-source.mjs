import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'

// Read a pinned Git snapshot, never working-tree environment files or secrets.
// This inventory is deliberately not an installable or approved master manifest.
const ref = process.argv[2]
if (!ref || ref.startsWith('-')) throw new Error('Supply an existing Git commit or ref.')
const git = (...args) => execFileSync('git', args, { maxBuffer: 64 * 1024 * 1024 })
const commitSha = git('rev-parse', '--verify', `${ref}^{commit}`).toString().trim()
if (!/^[a-f0-9]{40}$/.test(commitSha)) throw new Error('Expected an exact commit.')
const paths = git('ls-tree', '-r', '--name-only', commitSha).toString().trim().split('\n')
const included = paths.filter(p => /^(supabase\/(functions|migrations|baseline)\/|supabase\/config\.toml$)/.test(p)
  && !/(^|\/)\.env(?:\.|$)/.test(p))
const files = included.map(path => {
  const contents = git('show', `${commitSha}:${path}`)
  return { path, sha256: createHash('sha256').update(contents).digest('hex'), size: contents.length, contents: contents.toString() }
})
const config = files.find(f => f.path === 'supabase/config.toml')?.contents || ''
const secretNames = new Set()
const missingImports = []
const externalRelativeImports = []
const known = new Set(paths)
for (const file of files.filter(f => f.path.startsWith('supabase/functions/'))) {
  for (const match of file.contents.matchAll(/Deno\.env\.get\(["']([A-Z][A-Z0-9_]*)["']\)/g)) secretNames.add(match[1])
  for (const match of file.contents.matchAll(/(?:from\s*|import\s*\()["'](\.[^"']+)["']/g)) {
    const resolved = new URL(match[1], `https://source.invalid/${file.path}`).pathname.slice(1)
    if (!known.has(resolved)) missingImports.push({ source: file.path, import: match[1] })
    else if (!included.includes(resolved)) externalRelativeImports.push({ source: file.path, path: resolved,
      sha256: createHash('sha256').update(git('show', `${commitSha}:${resolved}`)).digest('hex') })
  }
}
const functions = files.filter(f => /^supabase\/functions\/[^/]+\/index\.ts$/.test(f.path)).map(f => {
  const slug = f.path.split('/')[2]
  const section = config.split(`[functions.${slug}]`)[1]?.split('\n[')[0]
  const match = section?.match(/^verify_jwt\s*=\s*(true|false)/m)
  return { slug, entrypoint: f.path, verifyJwt: match ? match[1] === 'true' : null }
})
const report = {
  kind: 'app-source-audit', commitSha, releaseReady: false,
  files: files.map(({ contents, ...metadata }) => metadata), functions,
  environmentVariableNames: [...secretNames].sort(), missingRelativeImports: missingImports, externalRelativeImports,
  functionAuthenticationUnspecified: functions.filter(f => f.verifyJwt === null).map(f => f.slug),
  purchasableFeatures: ['icustoms'], exclusiveCapabilities: { jenkar: ['phone_system'] },
  remainingEvidence: [
    'Authoritative complete infrastructure installation recipe and explicit baseline cut-off',
    'Clean fresh restore, required reference settings, private schemas, Storage and scheduled jobs',
    'Function dependency resolution including dynamic imports and deployment bundle validation',
    'Exact tested main promotion and complete Cloud integration contract verification',
    'Approved hosted template and isolated customer creation/update rehearsal',
  ],
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
