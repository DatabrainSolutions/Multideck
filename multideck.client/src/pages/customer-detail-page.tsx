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
    <div className="pb-10">
      <CustomerDetailHero />
      <CustomerMetricsGrid />

      <TabsRail tabs={marlowTabs} activeTab={activeTab} onChange={setActiveTab} className="mt-8" />

      {activeTab === "Overview" ? (
        <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-5">
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
          <div className="flex min-w-0 flex-col gap-5">
            <PrimaryContactsPanel
              selectedContact={selectedContact}
              onSelectContact={(contact) => setSelectedContactEmail(contact.email)}
            />
            <ArtiePulsePanel />
            <AccountPanel />
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <CustomerSimpleTabPanel tab={activeTab} />
        </div>
      )}
    </div>
  )
}
