// Local QA transport: the real portable contract validates every save, as the backend does.
export * from '../../../shared/email-signatures'
import { newSignatureDocument, validateSignatureDocument, type SignatureCompanyDetails, type SignatureTemplate } from '../../../shared/email-signatures'
import { signatureStarter } from '@/lib/signature-templates'
export type SignaturePerson = { id: string; name: string; email: string; jobTitle: string; company?: string; website?: string; address?: string; phone: string; mobile: string; departmentIds: string[]; allowCustomisation: boolean | null; photoUrl?: string; photoStatus?: 'ready' | 'missing' | 'too_large' }
export type SignatureWorkspace = { templates: SignatureTemplate[]; assetUrls: Record<string, string>; manager: boolean; allowCustomisation: boolean; userId: string; company: string; policy: { allow_customisation: boolean; website: string; revision: number; company_details?: SignatureCompanyDetails }; people: SignaturePerson[]; departments: { id: string; name: string }[] }
const key = 'md-signature-qa-store'
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
function store(): { templates: SignatureTemplate[]; assets: Record<string, string> } {
  const saved = sessionStorage.getItem(key)
  if (saved) return JSON.parse(saved)
  if (new URLSearchParams(location.search).has('empty')) return { templates: [], assets: {} }
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString()
  const make = (name: string, document: SignatureTemplate['document'], live: boolean, updatedAt: string, assignments: SignatureTemplate['assignments'] = []): SignatureTemplate => ({ id: crypto.randomUUID(), name, document, revision: 1, publishedRevision: live ? 1 : null, publishedDocument: live ? document : null, assignments, publishedAssignments: live ? assignments : [], ownerUserId: null, sourceTemplateId: null, archived: false, updatedAt })
  const seeded = { templates: [
    make('Operations team', signatureStarter('logo-beside')!.build('#0f5c8c'), true, hoursAgo(2), [{ kind: 'everyone', id: null }]),
    make('Sales outreach', signatureStarter('sales')!.build('#0f5c8c'), false, hoursAgo(26)),
    make('Legacy stacked', newSignatureDocument('stacked'), true, hoursAgo(24 * 40), [{ kind: 'department', id: 'ops' }]),
  ], assets: {} }
  sessionStorage.setItem(key, JSON.stringify(seeded))
  return seeded
}
const persist = (value: ReturnType<typeof store>) => sessionStorage.setItem(key, JSON.stringify(value))
export async function getSignatureWorkspace(): Promise<SignatureWorkspace> {
  await delay(300)
  const s = store()
  return { templates: s.templates, assetUrls: s.assets, manager: true, allowCustomisation: true, userId: 'u1', company: 'Northline Freight', policy: { allow_customisation: true, website: 'https://northline.example', revision: 1, company_details: { name: 'Northline Freight Ltd', address: 'Unit 4, Dock Road, Felixstowe IP11 3AB', phone: '+44 1394 000000' } }, people: [
    { id: 'u1', name: 'Jordan Reed', email: 'jordan.reed@northline.example', jobTitle: 'Head of operations', phone: '+44 1394 604 221', mobile: '', departmentIds: ['ops'], allowCustomisation: null, photoStatus: 'ready', photoUrl: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="260"><rect width="200" height="260" fill="#c9855b"/><circle cx="100" cy="100" r="46" fill="#f3d6bf"/><rect x="40" y="160" width="120" height="100" rx="50" fill="#2f4a5c"/></svg>')}` },
    { id: 'u2', name: 'Priya Shah', email: 'priya.shah@northline.example', jobTitle: 'Sales executive', phone: '+44 1394 604 230', mobile: '+44 7700 900 456', departmentIds: [], allowCustomisation: null, photoStatus: 'missing' },
  ], departments: [{ id: 'ops', name: 'Operations' }] }
}
export async function saveSignatureTemplate(template: Partial<SignatureTemplate> & { name: string; document: SignatureTemplate['document'] }, publish = false) {
  await delay(250)
  if (sessionStorage.getItem('md-signature-qa-fail')) throw new Error('The signature could not be saved. Check your connection and try again.')
  const s = store()
  const document = validateSignatureDocument(JSON.parse(JSON.stringify(template.document)))
  const previous = s.templates.find((t) => t.id === template.id)
  const saved: SignatureTemplate = { ...(previous ?? {}), ...(template as SignatureTemplate), document, revision: (previous?.revision ?? 0) + 1, updatedAt: new Date().toISOString(), ...(publish ? { publishedRevision: (previous?.publishedRevision ?? 0) + 1, publishedDocument: document, publishedAssignments: template.assignments ?? [] } : {}) }
  s.templates = [...s.templates.filter((t) => t.id !== saved.id), saved]
  persist(s)
  return saved
}
export async function uploadSignatureImage(file: File) {
  const url = await new Promise<string>((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsDataURL(file) })
  const id = crypto.randomUUID(); const s = store(); s.assets[id] = url; persist(s)
  return { id, url }
}
export async function signatureBrandImageFile(url: string): Promise<File> {
  const blob = await (await fetch(url)).blob()
  const image = new Image(); image.src = URL.createObjectURL(blob); await image.decode()
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth * 2; canvas.height = image.naturalHeight * 2
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
  const png = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
  return new File([png], 'company-logo.png', { type: 'image/png' })
}
export async function getSignatureVersions() { return [] }
