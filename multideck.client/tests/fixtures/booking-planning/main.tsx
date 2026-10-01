import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { TooltipProvider } from '../../../src/components/ui/tooltip'
import { LanguageProvider, useLanguage } from '../../../src/i18n/language-provider'
import { BookingPlanningChargesWorkspace } from '../../../src/components/multideck/booking-planning-charges-workspace'
import { jobId, failNextSave, failNextRefresh, setReadOnly } from './api'
import '../../../src/styles.css'
function Fixture() {
  const [pending, setPending] = useState(false)
  const [revision, setRevision] = useState(0)
  const { setLanguage } = useLanguage()
  return <main className="min-h-screen bg-[var(--md-bg)] p-4 text-[var(--md-ink)]">
    <h1 className="text-[18px] font-medium">Isolated planning-charge UI test</h1>
    <p className="my-2">In-memory fixture only. No real Booking or database writes.</p>
    <div className="mb-4 flex flex-wrap gap-3 text-[13px]">
      <button onClick={failNextSave}>Fail next save</button><button onClick={failNextRefresh}>Fail next refresh</button>
      <button onClick={() => setReadOnly(true)}>Set read-only, then reload</button>
      <button onClick={() => setLanguage('en-US')}>US English</button><button onClick={() => setLanguage('en-GB')}>UK English</button>
    </div>
    <p className="mb-4" role="status">{pending ? 'Parent navigation blocked' : 'Parent navigation allowed'} · Saved revision {revision}</p>
    <BookingPlanningChargesWorkspace jobId={jobId} reference="FIXTURE" blocked={false} onPendingChange={setPending}
      onSaved={async workspace => { setRevision((workspace as unknown as { savedRevision: number }).savedRevision) }} />
  </main>
}
createRoot(document.getElementById('root')!).render(<LanguageProvider><TooltipProvider><Fixture /></TooltipProvider></LanguageProvider>)
