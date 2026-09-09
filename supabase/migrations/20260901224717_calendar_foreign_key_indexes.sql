-- Keep Calendar relationship checks and cascades efficient as meeting volume grows.
-- These cover the foreign keys identified by the Supabase database advisor after
-- the initial Calendar deployment.

create index if not exists "IX_CAL_BookingHolds_company"
  on public."CAL_BookingHolds" ("CALBookingHold_CompanyID");

create index if not exists "IX_CAL_ChangeRequests_company"
  on public."CAL_ChangeRequests" ("CALChangeRequest_CompanyID");

create index if not exists "IX_CAL_ChangeRequests_decided_by"
  on public."CAL_ChangeRequests" ("CALChangeRequest_DecidedBy");

create index if not exists "IX_CAL_EmailTemplates_updated_by"
  on public."CAL_EmailTemplates" ("CALEmailTemplate_UpdatedBy");

create index if not exists "IX_CAL_Meetings_created_by"
  on public."CAL_Meetings" ("CALMeeting_CreatedBy");

create index if not exists "IX_CAL_Meetings_updated_by"
  on public."CAL_Meetings" ("CALMeeting_UpdatedBy");

create index if not exists "IX_CAL_OAuthStates_user"
  on public."CAL_OAuthStates" ("CALOAuthState_UserID");

create index if not exists "IX_CAL_ProviderEvents_company"
  on public."CAL_ProviderEvents" ("CALProviderEvent_CompanyID");
