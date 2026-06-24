CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;
ALTER TABLE public."tbl_Acc_APTrans_Header" RENAME TO "Acc_APTrans_Header";

ALTER TABLE public."tbl_Acc_APTrans_Lines" RENAME TO "Acc_APTrans_Lines";

ALTER TABLE public."tbl_Acc_ARTrans_Header" RENAME TO "Acc_ARTrans_Header";

ALTER TABLE public."tbl_Acc_ARTrans_Lines" RENAME TO "Acc_ARTrans_Lines";

ALTER TABLE public."tbl_Acc_Payments_Header" RENAME TO "Acc_Payments_Header";

ALTER TABLE public."tbl_Acc_Payments_Lines" RENAME TO "Acc_Payments_Lines";

ALTER TABLE public."tbl_Acc_Receipts_Header" RENAME TO "Acc_Receipts_Header";

ALTER TABLE public."tbl_Acc_Receipts_Lines" RENAME TO "Acc_Receipts_Lines";

ALTER TABLE public."tbl_cmp_Company" RENAME TO "cmp_Company";

ALTER TABLE public."tbl_cmp_Company_Offices" RENAME TO "cmp_Company_Offices";

ALTER TABLE public."tbl_cmp_Groups" RENAME TO "cmp_Groups";

ALTER TABLE public."tbl_cmp_Offices" RENAME TO "cmp_Offices";

ALTER TABLE public."tbl_cmp_Users" RENAME TO "cmp_Users";

ALTER TABLE public."tbl_cmp_Users_Groups" RENAME TO "cmp_Users_Groups";

ALTER TABLE public."tbl_cmp_Users_Offices" RENAME TO "cmp_Users_Offices";

ALTER TABLE public."tbl_CusQuote_AuditLog" RENAME TO "CusQuote_AuditLog";

ALTER TABLE public."tbl_CusQuote_ChargesIn" RENAME TO "CusQuote_ChargesIn";

ALTER TABLE public."tbl_CusQuote_ChargesOut" RENAME TO "CusQuote_ChargesOut";

ALTER TABLE public."tbl_CusQuote_CostOptions" RENAME TO "CusQuote_CostOptions";

ALTER TABLE public."tbl_CusQuote_Header" RENAME TO "CusQuote_Header";

ALTER TABLE public."tbl_CusQuote_RevenueOptions" RENAME TO "CusQuote_RevenueOptions";

ALTER TABLE public."tbl_CusQuote_Revision" RENAME TO "CusQuote_Revision";

ALTER TABLE public."tbl_CusQuote_Types" RENAME TO "CusQuote_Types";

ALTER TABLE public."tbl_Job_Cargo" RENAME TO "Job_Cargo";

ALTER TABLE public."tbl_Job_PackCargoContainer" RENAME TO "Job_PackCargoContainer";

ALTER TABLE public."tbl_Job_Containers" RENAME TO "Job_Containers";

ALTER TABLE public."tbl_Job_Costing_ChargesIn" RENAME TO "Job_Costing_ChargesIn";

ALTER TABLE public."tbl_Job_Costing_ChargesOut" RENAME TO "Job_Costing_ChargesOut";

ALTER TABLE public."tbl_Job_Header" RENAME TO "Job_Header";

ALTER TABLE public."tbl_Job_Routing" RENAME TO "Job_Routing";

ALTER TABLE public."tbl_Org_Addresses" RENAME TO "Org_Addresses";

ALTER TABLE public."tbl_Org_AddressTypes" RENAME TO "Org_AddressTypes";

ALTER TABLE public."tbl_Org_Contacts" RENAME TO "Org_Contacts";

ALTER TABLE public."tbl_OrgContact_Emails" RENAME TO "OrgContact_Emails";

ALTER TABLE public."tbl_Org_CurrencyAccounts" RENAME TO "Org_CurrencyAccounts";

ALTER TABLE public."tbl_Org_Master" RENAME TO "Org_Master";

ALTER TABLE public."tbl_Org_Types" RENAME TO "Org_Types";

ALTER TABLE public."tbl_Org_Master_Type" RENAME TO "Org_Master_Type";

ALTER TABLE public."tbl_sys_AddressTypes" RENAME TO "sys_AddressTypes";

ALTER TABLE public."tbl_sys_Airlines" RENAME TO "sys_Airlines";

ALTER TABLE public."tbl_sys_CarriersConsortiums" RENAME TO "sys_CarriersConsortiums";

ALTER TABLE public."tbl_sys_CityTown" RENAME TO "sys_CityTown";

ALTER TABLE public."tbl_sys_CommodityCode" RENAME TO "sys_CommodityCode";

ALTER TABLE public."tbl_sys_Containers" RENAME TO "sys_Containers";

ALTER TABLE public."tbl_sys_Currency" RENAME TO "sys_Currency";

ALTER TABLE public."tbl_sys_DocTypes" RENAME TO "sys_DocTypes";

ALTER TABLE public."tbl_sys_EmailType" RENAME TO "sys_EmailType";

ALTER TABLE public."tbl_sys_ListGrouping" RENAME TO "sys_ListGrouping";

ALTER TABLE public."tbl_sys_Modules" RENAME TO "sys_Modules";

ALTER TABLE public."tbl_sys_PhoneType" RENAME TO "sys_PhoneType";

ALTER TABLE public."tbl_sys_RefUNLOCO" RENAME TO "sys_RefUNLOCO";

ALTER TABLE public."tbl_sys_UserRoles" RENAME TO "sys_UserRoles";

ALTER TABLE public."tbl_cmp_Users_Roles" RENAME TO "cmp_Users_Roles";

ALTER TABLE public."tbl_Warehouse" RENAME TO "Warehouse";

ALTER TABLE public."tbl_Warehouse_Areas" RENAME TO "Warehouse_Areas";

ALTER TABLE public."tbl_Warehouse_Locations" RENAME TO "Warehouse_Locations";

ALTER TABLE public."tbl_Workflow_Items" RENAME TO "Workflow_Items";

ALTER TABLE public."tbl_Workflow_Templates_Header" RENAME TO "Workflow_Templates_Header";

ALTER TABLE public."tbl_Workflow_Templates_Lines" RENAME TO "Workflow_Templates_Lines";

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260624120123_RemoveTblTablePrefix', '10.0.9');

COMMIT;

