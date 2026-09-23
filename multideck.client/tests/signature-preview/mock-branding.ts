export type { TenantBranding } from '../../src/lib/tenant-branding-api'
const logo = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120" viewBox="0 0 360 120"><rect x="6" y="24" width="72" height="72" rx="18" fill="#0f5c8c"/><path d="M26 76 42 44l16 32" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><text x="96" y="74" font-family="Helvetica,Arial" font-size="34" font-weight="700" fill="#1b2a33">Northline</text></svg>')}`
export async function getTenantBranding() {
  if (new URLSearchParams(location.search).has('nobrand')) return { configured: false }
  return { configured: true, brandId: 'qa', displayName: 'Northline Freight', websiteUrl: 'https://northline.example', primaryColor: '#0F5C8C', secondaryColor: '#1B2A33', backgroundColor: '#F3F4F4', surfaceColor: '#FFFFFF', textColor: '#292929', appearanceMode: 'light', cornerStyle: 'rounded', emailSignOff: 'Kind regards,', logoUrl: logo, logoMimeType: 'image/svg+xml', updatedAt: null, importedFrom: null }
}
