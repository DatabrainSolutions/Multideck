-- Replace the pre-existing Contact Card history indexes with the deterministic
-- tie-breaker shapes required by bounded paging. The original 157000 migration
-- used IF NOT EXISTS, which preserved older shorter indexes with the same names.

begin;

drop index if exists public."IX_CRM_ContactCards_Company_Updated";
drop index if exists public."IX_CRM_ContactCardExchanges_Card_At";
drop index if exists public."IX_CRM_ContactCardScans_Card_At";
drop index if exists public."IX_CRM_ContactCardAutomationRuns_Card_Started";

create index "IX_CRM_ContactCards_Company_Updated"
  on public."CRM_ContactCards" ("Company_ID", "ContactCard_UpdatedAt" desc, "ContactCard_ID" desc)
  where "ContactCard_DeletedAt" is null;

create index "IX_CRM_ContactCardExchanges_Card_At"
  on public."CRM_ContactCardExchanges" ("ContactCard_ID", "Exchange_At" desc, "Exchange_ID" desc);

create index "IX_CRM_ContactCardScans_Card_At"
  on public."CRM_ContactCardScans" ("ContactCard_ID", "Scan_At" desc, "Scan_ID" desc);

create index "IX_CRM_ContactCardAutomationRuns_Card_Started"
  on public."CRM_ContactCardAutomationRuns" ("ContactCard_ID", "AutomationRun_StartedAt" desc, "AutomationRun_ID" desc);

commit;
