-- Cover quote-workspace foreign keys used by lifecycle and lookup queries.

begin;

create index if not exists "IX_CusQuote_Header_SourceLead" on public."CusQuote_Header" ("CusQuoteHeader_SourceLeadID");
create index if not exists "IX_CusQuote_Header_Supplier" on public."CusQuote_Header" ("CusQuoteHeader_SupplierID");
create index if not exists "IX_CusQuote_Header_Carrier" on public."CusQuote_Header" ("CusQuoteHeader_CarrierID");
create index if not exists "IX_CusQuote_Header_Department" on public."CusQuote_Header" ("CusQuoteHeader_DepartmentID");
create index if not exists "IX_CusQuote_Header_SalesOwner" on public."CusQuote_Header" ("CusQuoteHeader_SalesOwnerID");
create index if not exists "IX_CusQuote_Header_AcceptedVersion" on public."CusQuote_Header" ("CusQuoteHeader_AcceptedVersionID");
create index if not exists "IX_CusQuote_Parties_Company" on public."CusQuote_Parties" ("Company_ID");
create index if not exists "IX_CusQuote_Parties_Organisation" on public."CusQuote_Parties" ("CusQuoteParty_OrgID");
create index if not exists "IX_CusQuote_Versions_Company" on public."CusQuote_Versions" ("Company_ID");
create index if not exists "IX_CusQuote_Versions_CreatedBy" on public."CusQuote_Versions" ("CusQuoteVersion_CreatedBy");
create index if not exists "IX_CusQuote_Events_Company" on public."CusQuote_Events" ("Company_ID");
create index if not exists "IX_CusQuote_Events_Version" on public."CusQuote_Events" ("CusQuoteVersion_ID");
create index if not exists "IX_CusQuote_Events_Actor" on public."CusQuote_Events" ("CusQuoteEvent_ActorUserID");

commit;

