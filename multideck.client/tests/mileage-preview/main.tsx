import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider, useLanguage } from '../../src/i18n/language-provider'
import { MileagePage } from '../../src/pages/mileage-page'
import { Button } from '../../src/components/ui/button'
import { ThemeProvider } from '../../src/lib/theme-provider'
import { Toaster } from '../../src/components/ui/sonner'
import '../../src/styles.css'
function LanguageControl() {
 const { language, setLanguage } = useLanguage()
 return <label>Region <select aria-label="Region" value={language} onChange={e => setLanguage(e.target.value as 'en-GB' | 'en-US')}><option value="en-GB">English (UK)</option><option value="en-US">English (US)</option></select></label>
}
function QA() {
 const [route, setRoute] = useState(location.hash.slice(1) || '/crm/trips')
 const [user, setUser] = useState(sessionStorage.getItem('mileage-qa-user') || '1')
 const navigate = (path: string) => { location.hash = path; setRoute(path) }
 useEffect(() => { const fn = () => setRoute(location.hash.slice(1) || '/crm/trips'); window.addEventListener('hashchange', fn); return () => window.removeEventListener('hashchange', fn) }, [])
 return <ThemeProvider><LanguageProvider><div style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', background: 'var(--md-surface)', color: 'var(--md-ink)' }}><strong>Local QA · disposable database</strong><LanguageControl /><label>Test employee <select aria-label="Test employee" value={user} onChange={e => { sessionStorage.setItem('mileage-qa-user', e.target.value); setUser(e.target.value) }}><option value="1">Employee 1</option><option value="2">Approver 2</option><option value="3">Finance 3</option><option value="4">Administrator 4</option><option value="5">Foreign workspace</option></select></label><Button variant="outline" onClick={() => navigate('/crm/trips')}>Trips</Button><Button variant="outline" onClick={() => navigate('/finance/mileage')}>Finance</Button>{route === '/crm/trips' && <Button onClick={() => navigate('/crm/trips/new')}>New trip</Button>}</div><main className="p-4 sm:p-6"><MileagePage key={`${user}-${route}`} route={route} navigate={navigate}/></main><Toaster /></LanguageProvider></ThemeProvider>
}
createRoot(document.getElementById('root')!).render(<QA />)
