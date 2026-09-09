-- Cover every foreign-key path introduced or made operational by the company,
-- contact and address foundation. These indexes keep history transfers,
-- address archiving and related-party cleanup predictable as the registers grow.

begin;

create index if not exists "IX_CRM_AccountOfficeAssignments_office"
  on public."CRM_AccountOfficeAssignments" ("CRMAccountOffice_OrgOfficeID");
create index if not exists "IX_CRM_AccountOfficeAssignments_created_by"
  on public."CRM_AccountOfficeAssignments" ("CRMAccountOffice_CreatedBy")
  where "CRMAccountOffice_CreatedBy" is not null;

create index if not exists "IX_CRM_ContactOrganisationAssignments_contact"
  on public."CRM_ContactOrganisationAssignments" ("CRMContactOrg_ContactID");
create index if not exists "IX_CRM_ContactOrganisationAssignments_company"
  on public."CRM_ContactOrganisationAssignments" ("CRMContactOrg_CompanyID");
create index if not exists "IX_CRM_ContactOrganisationAssignments_created_by"
  on public."CRM_ContactOrganisationAssignments" ("CRMContactOrg_CreatedBy")
  where "CRMContactOrg_CreatedBy" is not null;

create index if not exists "IX_OrgContact_Emails_superseded_by"
  on public."OrgContact_Emails" ("OrgContactEmail_SupersededBy")
  where "OrgContactEmail_SupersededBy" is not null;

create index if not exists "IX_Org_Addresses_org"
  on public."Org_Addresses" ("Org_ID");
create index if not exists "IX_Org_AddressTypes_address_org"
  on public."Org_AddressTypes" ("OrgAdd_ID", "OrgAddType_OrgID");
create index if not exists "IX_Org_AddressTypes_type"
  on public."Org_AddressTypes" ("OrgAddType_Type");

create index if not exists "IX_Org_RelatedPartyDefaults_source_org"
  on public."Org_RelatedPartyDefaults" ("OrgRelatedDefault_SourceOrgID");
create index if not exists "IX_Org_RelatedPartyDefaults_target_org"
  on public."Org_RelatedPartyDefaults" ("OrgRelatedDefault_TargetOrgID");
create index if not exists "IX_Org_RelatedPartyDefaults_target_address"
  on public."Org_RelatedPartyDefaults" ("OrgRelatedDefault_TargetAddressID")
  where "OrgRelatedDefault_TargetAddressID" is not null;
create index if not exists "IX_Org_RelatedPartyDefaults_target_contact"
  on public."Org_RelatedPartyDefaults" ("OrgRelatedDefault_TargetContactID")
  where "OrgRelatedDefault_TargetContactID" is not null;
create index if not exists "IX_Org_RelatedPartyDefaults_created_by"
  on public."Org_RelatedPartyDefaults" ("OrgRelatedDefault_CreatedBy")
  where "OrgRelatedDefault_CreatedBy" is not null;
create index if not exists "IX_Org_RelatedPartyDefaults_updated_by"
  on public."Org_RelatedPartyDefaults" ("OrgRelatedDefault_UpdatedBy")
  where "OrgRelatedDefault_UpdatedBy" is not null;

commit;
