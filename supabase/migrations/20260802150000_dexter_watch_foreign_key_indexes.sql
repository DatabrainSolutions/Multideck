-- Support foreign-key checks without scanning the watch tables.

create index if not exists "IX_AI_DexterWatches_capability"
  on public."AI_DexterWatches" ("AIDexterWatch_CapabilityCode");

create index if not exists "IX_AI_DexterWatchSignals_capability"
  on public."AI_DexterWatchSignals" ("AIDexterWatchSignal_CapabilityCode");

create index if not exists "IX_AI_DexterWatchEvents_signal"
  on public."AI_DexterWatchEvents" ("AIDexterWatchEvent_SignalID");
