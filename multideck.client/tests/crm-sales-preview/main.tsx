import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { LanguageProvider, useLanguage } from '../../src/i18n/language-provider'
import { CrmDashboardInsights } from '../../src/pages/crm-dashboard-analysis'
import { CrmDealDetailPage } from '../../src/pages/crm-deal-detail-page'
import { Button } from '../../src/components/ui/button'
import { ThemeProvider } from '../../src/lib/theme-provider'
import { InlineNotice } from '../../src/components/multideck/inline-notice'
import { TooltipProvider } from '../../src/components/ui/tooltip'
import { AppSidebar } from '../../src/components/multideck/app-sidebar'
import { TopBar } from '../../src/components/multideck/top-bar'
import type { AuthUserSummary } from '../../src/lib/auth-user'
import { Toaster } from '../../src/components/ui/sonner'
import { setCrmReadCacheScope } from '../../src/lib/crm-read-cache'
import '../../src/styles.css'
import './preview.css'
function Region() {
 const { language, setLanguage } = useLanguage()
 return <label>Region <select aria-label="Region" value={language} onChange={event => setLanguage(event.target.value as 'en-GB' | 'en-US')}><option value="en-GB">English (UK)</option><option value="en-US">English (US)</option></select></label>
}
function QA() {
 const [route, setRoute] = useState(location.pathname === '/' ? '/crm' : location.pathname)
 const [themeMode, setThemeMode] = useState(sessionStorage.getItem('crm-sales-qa-themes') || 'native')
 const [user, setUser] = useState(sessionStorage.getItem('crm-sales-qa-user') || '1')
 const navigate = (path: string) => { history.pushState({}, '', path); setRoute(location.pathname); window.scrollTo(0, 0) }
 useEffect(() => { const fn = () => setRoute(location.pathname === '/' ? '/crm' : location.pathname); window.addEventListener('popstate', fn); return () => window.removeEventListener('popstate', fn) }, [])
 const [collapsed, setCollapsed] = useState(false)
 const currentUser: AuthUserSummary = { id: `10000000-0000-0000-0000-${user.padStart(12, "0")}`, internalUserId: `00000000-0000-0000-0000-${user.padStart(12, "0")}`, name: user === "1" ? "Alex Sales" : user === "2" ? "Sam Sales" : "QA colleague", email: `sales${user}@example.test`, initials: user === "1" ? "AS" : "SS", profilePhoto: null, coverPhoto: null, profilePhotoUrl: null, actorType: "internal", organisations: [], roles: [{id:"sales",name:"Sales"}], permissions: user === "3" ? ["CRM.Read"] : ["CRM.Read", "CRM.Write", "CRM.Deals.Win"], landingPath: "/crm" }
 const dealId = route.startsWith('/crm/deals/') ? route.split('/')[3] : null
 const controls = <><Region /><label>Themes <select aria-label="Theme illustration" value={themeMode} onChange={event => { sessionStorage.setItem('crm-sales-qa-themes', event.target.value); setThemeMode(event.target.value) }}><option value="native">Native saved result</option><option value="illustrative">Illustrative groups · no model</option></select></label><label>Operator <select aria-label="Test operator" value={user} onChange={event => { sessionStorage.setItem('crm-sales-qa-user', event.target.value); setCrmReadCacheScope('crm-sales-local', `10000000-0000-0000-0000-${event.target.value.padStart(12, '0')}`, true); setUser(event.target.value) }}><option value="1">Sales operator</option><option value="2">Colleague</option><option value="5">Other workspace</option><option value="3">Read only</option></select></label><Button size="sm" variant="outline" onClick={() => navigate('/crm')}>Dashboard</Button><Button size="sm" variant="outline" onClick={() => navigate('/crm/deals/60000000-0000-0000-0000-000000000001')}>Review a deal</Button></>
 return <ThemeProvider><LanguageProvider><TooltipProvider><div className="crm-qa-bar"><strong>{themeMode === "illustrative" ? "Local QA · illustrative themes (no model)" : "Local QA · disposable sales data"}</strong><div className="crm-qa-controls-desktop">{controls}</div><details className="crm-qa-options"><summary>Options</summary><div>{controls}</div></details></div><div style={{display:"flex", minWidth:0, height:"calc(100dvh - var(--crm-qa-bar-height))", overflow:"hidden"}}><AppSidebar currentUser={currentUser} route={route} navigate={navigate} collapsed={collapsed} onCollapsedChange={setCollapsed} className="hidden h-full shrink-0 lg:flex" /><div className="md-scrollbar px-[var(--md-page-pad)]" style={{flex:1,minWidth:0,overflowX:"hidden",overflowY:"auto"}}><TopBar currentUser={currentUser} route={route} navigate={navigate}/><main key={`${user}:${themeMode}`} className="pb-[var(--md-page-pad)]" style={{ minHeight: 'calc(100vh - 130px)', background: 'var(--md-bg)' }}>{dealId ? <CrmDealDetailPage key={`${user}:${dealId}`} dealId={dealId} navigate={navigate} /> : route === "/crm" ? <div className="md-page md-page-stack-compact md-dashboard md-crm-dashboard"><header><h1>CRM dashboard</h1></header><CrmDashboardInsights key={`${user}:${route}`} navigate={navigate} /></div> : <InlineNotice title="This surface is outside the local CRM preview" action={<Button size="sm" onClick={() => navigate("/crm")}>Back to dashboard</Button>}>The preview contains the production deal screen and dashboard sales analysis. Other workspace surfaces and integrations are unavailable here.</InlineNotice>}</main></div></div><Toaster /></TooltipProvider></LanguageProvider></ThemeProvider>
}
setCrmReadCacheScope('crm-sales-local', `10000000-0000-0000-0000-${(sessionStorage.getItem('crm-sales-qa-user') || '1').padStart(12, '0')}`)
createRoot(document.getElementById('root')!).render(<QA />)
