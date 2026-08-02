create index if not exists "IX_CRM_ContactCards_OwnerUser"
  on public."CRM_ContactCards" ("Owner_User_ID");

create index if not exists "IX_CRM_ContactCardActions_OwnerUser"
  on public."CRM_ContactCardAutomationActions" ("Action_OwnerUserID");

create index if not exists "IX_CRM_ContactCardActions_PipelineStage"
  on public."CRM_ContactCardAutomationActions" ("Action_PipelineStageID");

create index if not exists "IX_CRM_ContactCardExchanges_Scan"
  on public."CRM_ContactCardExchanges" ("Scan_ID");

create index if not exists "IX_CRM_LeadPipelinePlacements_ContactCard"
  on public."CRM_LeadPipelinePlacements" ("ContactCard_ID");

create index if not exists "IX_CRM_LeadPipelinePlacements_PipelineStageOnly"
  on public."CRM_LeadPipelinePlacements" ("CRMPipelineStage_ID");
