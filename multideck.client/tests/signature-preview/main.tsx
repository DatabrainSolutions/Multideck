import { createRoot } from 'react-dom/client'
import { LanguageProvider } from '../../src/i18n/language-provider'
import { ThemeProvider } from '../../src/lib/theme-provider'
import { TooltipProvider } from '../../src/components/ui/tooltip'
import { EmailSignaturesPage } from '../../src/pages/email-signatures-page'
import '../../src/styles.css'
const personal = location.pathname.includes('personal')
createRoot(document.getElementById('root')!).render(
  <ThemeProvider><LanguageProvider><TooltipProvider>
    <div style={{ height: '100dvh', overflow: 'auto', background: 'var(--md-bg)' }}>
      <EmailSignaturesPage personal={personal} navigate={(path) => console.info('navigate', path)} />
    </div>
  </TooltipProvider></LanguageProvider></ThemeProvider>,
)
