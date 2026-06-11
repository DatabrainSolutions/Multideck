import {
  ActivityPanel,
  CustomsQueuePanel,
  LiveShipmentsPanel,
  MetricsGrid,
  MorningDigestPanel,
  OverviewHero,
  WorldClockPanel,
} from "@/components/multideck/overview-panels"

export function OverviewPage() {
  return (
    <div>
      <OverviewHero />
      <MetricsGrid />
      <div className="mt-3">
        <WorldClockPanel />
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_396px]">
        <LiveShipmentsPanel />
        <MorningDigestPanel />
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ActivityPanel />
        <CustomsQueuePanel />
      </div>
    </div>
  )
}
