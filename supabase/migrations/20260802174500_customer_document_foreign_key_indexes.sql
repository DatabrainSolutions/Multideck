-- Cover every CRM_CustomerDocuments foreign key used by lifecycle cleanup and
-- source-level audit lookups. Customer/date and customer/source dedupe indexes
-- are created by the feature migration; these cover the inverse relationships.
create index if not exists "IX_CRM_CustomerDocuments_source_attachment"
  on public."CRM_CustomerDocuments" ("CRMCustomerDocument_SourceAttachmentID");

create index if not exists "IX_CRM_CustomerDocuments_source_message"
  on public."CRM_CustomerDocuments" ("CRMCustomerDocument_SourceMessageID");

create index if not exists "IX_CRM_CustomerDocuments_stored_object"
  on public."CRM_CustomerDocuments" ("CRMCustomerDocument_StoredObjectID");
