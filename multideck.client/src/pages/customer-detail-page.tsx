import { useState } from "react"
import {
  AccountPanel,
  ActiveShipmentsPanel,
  ArtiePulsePanel,
  ContactProfileModule,
  CustomerActivityPanel,
  CustomerDetailHero,
  CustomerMetricsGrid,
  CustomerSimpleTabPanel,
  LaneMixPanel,
  PrimaryContactsPanel,
} from "@/components/multideck/customer-components"
import { TabsRail } from "@/components/multideck/workflow-components"
import { marlowContacts, marlowTabs } from "@/data/multideck-data"

export function CustomerDetailPage() {
  const [activeTab, setActiveTab] = useState("Overview")
  const [selectedContactEmail, setSelectedContactEmail] = useState<string | null>(null)
  const selectedContact = marlowContacts.find((contact) => contact.email === selectedContactEmail) ?? null

  return (
    <div className="md-page md-page-stack">
      <CustomerDetailHero />
      <CustomerMetricsGrid />

      <TabsRail tabs={marlowTabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "Overview" ? (
        <div className="md-panel-grid xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="md-panel-column">
            {selectedContact ? (
              <ContactProfileModule
                contact={selectedContact}
                onClose={() => setSelectedContactEmail(null)}
              />
            ) : null}
            <ActiveShipmentsPanel />
            <LaneMixPanel />
            <CustomerActivityPanel />
          </div>
          <div className="md-panel-column">
            <PrimaryContactsPanel
              selectedContact={selectedContact}
              onSelectContact={(contact) => setSelectedContactEmail(contact.email)}
            />
            <ArtiePulsePanel />
            <AccountPanel />
          </div>
        </div>
      ) : (
        <div>
          <CustomerSimpleTabPanel tab={activeTab} />
        </div>
      )}
    </div>
  )
}
