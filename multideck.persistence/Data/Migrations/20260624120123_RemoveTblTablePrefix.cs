using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Multideck.Persistence.Data.Migrations
{
    /// <inheritdoc />
    public partial class RemoveTblTablePrefix : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameTable(
                name: "tbl_Acc_APTrans_Header",
                schema: "public",
                newName: "Acc_APTrans_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Acc_APTrans_Lines",
                schema: "public",
                newName: "Acc_APTrans_Lines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Acc_ARTrans_Header",
                schema: "public",
                newName: "Acc_ARTrans_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Acc_ARTrans_Lines",
                schema: "public",
                newName: "Acc_ARTrans_Lines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Acc_Payments_Header",
                schema: "public",
                newName: "Acc_Payments_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Acc_Payments_Lines",
                schema: "public",
                newName: "Acc_Payments_Lines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Acc_Receipts_Header",
                schema: "public",
                newName: "Acc_Receipts_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Acc_Receipts_Lines",
                schema: "public",
                newName: "Acc_Receipts_Lines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_cmp_Company",
                schema: "public",
                newName: "cmp_Company",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_cmp_Company_Offices",
                schema: "public",
                newName: "cmp_Company_Offices",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_cmp_Groups",
                schema: "public",
                newName: "cmp_Groups",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_cmp_Offices",
                schema: "public",
                newName: "cmp_Offices",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_cmp_Users",
                schema: "public",
                newName: "cmp_Users",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_cmp_Users_Groups",
                schema: "public",
                newName: "cmp_Users_Groups",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_cmp_Users_Offices",
                schema: "public",
                newName: "cmp_Users_Offices",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_CusQuote_AuditLog",
                schema: "public",
                newName: "CusQuote_AuditLog",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_CusQuote_ChargesIn",
                schema: "public",
                newName: "CusQuote_ChargesIn",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_CusQuote_ChargesOut",
                schema: "public",
                newName: "CusQuote_ChargesOut",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_CusQuote_CostOptions",
                schema: "public",
                newName: "CusQuote_CostOptions",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_CusQuote_Header",
                schema: "public",
                newName: "CusQuote_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_CusQuote_RevenueOptions",
                schema: "public",
                newName: "CusQuote_RevenueOptions",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_CusQuote_Revision",
                schema: "public",
                newName: "CusQuote_Revision",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_CusQuote_Types",
                schema: "public",
                newName: "CusQuote_Types",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Job_Cargo",
                schema: "public",
                newName: "Job_Cargo",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Job_PackCargoContainer",
                schema: "public",
                newName: "Job_PackCargoContainer",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Job_Containers",
                schema: "public",
                newName: "Job_Containers",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Job_Costing_ChargesIn",
                schema: "public",
                newName: "Job_Costing_ChargesIn",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Job_Costing_ChargesOut",
                schema: "public",
                newName: "Job_Costing_ChargesOut",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Job_Header",
                schema: "public",
                newName: "Job_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Job_Routing",
                schema: "public",
                newName: "Job_Routing",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Org_Addresses",
                schema: "public",
                newName: "Org_Addresses",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Org_AddressTypes",
                schema: "public",
                newName: "Org_AddressTypes",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Org_Contacts",
                schema: "public",
                newName: "Org_Contacts",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_OrgContact_Emails",
                schema: "public",
                newName: "OrgContact_Emails",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Org_CurrencyAccounts",
                schema: "public",
                newName: "Org_CurrencyAccounts",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Org_Master",
                schema: "public",
                newName: "Org_Master",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Org_Types",
                schema: "public",
                newName: "Org_Types",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Org_Master_Type",
                schema: "public",
                newName: "Org_Master_Type",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_AddressTypes",
                schema: "public",
                newName: "sys_AddressTypes",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_Airlines",
                schema: "public",
                newName: "sys_Airlines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_CarriersConsortiums",
                schema: "public",
                newName: "sys_CarriersConsortiums",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_CityTown",
                schema: "public",
                newName: "sys_CityTown",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_CommodityCode",
                schema: "public",
                newName: "sys_CommodityCode",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_Containers",
                schema: "public",
                newName: "sys_Containers",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_Currency",
                schema: "public",
                newName: "sys_Currency",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_DocTypes",
                schema: "public",
                newName: "sys_DocTypes",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_EmailType",
                schema: "public",
                newName: "sys_EmailType",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_ListGrouping",
                schema: "public",
                newName: "sys_ListGrouping",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_Modules",
                schema: "public",
                newName: "sys_Modules",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_PhoneType",
                schema: "public",
                newName: "sys_PhoneType",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_RefUNLOCO",
                schema: "public",
                newName: "sys_RefUNLOCO",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_sys_UserRoles",
                schema: "public",
                newName: "sys_UserRoles",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_cmp_Users_Roles",
                schema: "public",
                newName: "cmp_Users_Roles",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Warehouse",
                schema: "public",
                newName: "Warehouse",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Warehouse_Areas",
                schema: "public",
                newName: "Warehouse_Areas",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Warehouse_Locations",
                schema: "public",
                newName: "Warehouse_Locations",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Workflow_Items",
                schema: "public",
                newName: "Workflow_Items",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Workflow_Templates_Header",
                schema: "public",
                newName: "Workflow_Templates_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "tbl_Workflow_Templates_Lines",
                schema: "public",
                newName: "Workflow_Templates_Lines",
                newSchema: "public");

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameTable(
                name: "Workflow_Templates_Lines",
                schema: "public",
                newName: "tbl_Workflow_Templates_Lines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Workflow_Templates_Header",
                schema: "public",
                newName: "tbl_Workflow_Templates_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Workflow_Items",
                schema: "public",
                newName: "tbl_Workflow_Items",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Warehouse_Locations",
                schema: "public",
                newName: "tbl_Warehouse_Locations",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Warehouse_Areas",
                schema: "public",
                newName: "tbl_Warehouse_Areas",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Warehouse",
                schema: "public",
                newName: "tbl_Warehouse",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "cmp_Users_Roles",
                schema: "public",
                newName: "tbl_cmp_Users_Roles",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_UserRoles",
                schema: "public",
                newName: "tbl_sys_UserRoles",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_RefUNLOCO",
                schema: "public",
                newName: "tbl_sys_RefUNLOCO",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_PhoneType",
                schema: "public",
                newName: "tbl_sys_PhoneType",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_Modules",
                schema: "public",
                newName: "tbl_sys_Modules",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_ListGrouping",
                schema: "public",
                newName: "tbl_sys_ListGrouping",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_EmailType",
                schema: "public",
                newName: "tbl_sys_EmailType",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_DocTypes",
                schema: "public",
                newName: "tbl_sys_DocTypes",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_Currency",
                schema: "public",
                newName: "tbl_sys_Currency",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_Containers",
                schema: "public",
                newName: "tbl_sys_Containers",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_CommodityCode",
                schema: "public",
                newName: "tbl_sys_CommodityCode",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_CityTown",
                schema: "public",
                newName: "tbl_sys_CityTown",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_CarriersConsortiums",
                schema: "public",
                newName: "tbl_sys_CarriersConsortiums",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_Airlines",
                schema: "public",
                newName: "tbl_sys_Airlines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "sys_AddressTypes",
                schema: "public",
                newName: "tbl_sys_AddressTypes",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Org_Master_Type",
                schema: "public",
                newName: "tbl_Org_Master_Type",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Org_Types",
                schema: "public",
                newName: "tbl_Org_Types",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Org_Master",
                schema: "public",
                newName: "tbl_Org_Master",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Org_CurrencyAccounts",
                schema: "public",
                newName: "tbl_Org_CurrencyAccounts",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "OrgContact_Emails",
                schema: "public",
                newName: "tbl_OrgContact_Emails",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Org_Contacts",
                schema: "public",
                newName: "tbl_Org_Contacts",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Org_AddressTypes",
                schema: "public",
                newName: "tbl_Org_AddressTypes",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Org_Addresses",
                schema: "public",
                newName: "tbl_Org_Addresses",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Job_Routing",
                schema: "public",
                newName: "tbl_Job_Routing",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Job_Header",
                schema: "public",
                newName: "tbl_Job_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Job_Costing_ChargesOut",
                schema: "public",
                newName: "tbl_Job_Costing_ChargesOut",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Job_Costing_ChargesIn",
                schema: "public",
                newName: "tbl_Job_Costing_ChargesIn",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Job_Containers",
                schema: "public",
                newName: "tbl_Job_Containers",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Job_PackCargoContainer",
                schema: "public",
                newName: "tbl_Job_PackCargoContainer",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Job_Cargo",
                schema: "public",
                newName: "tbl_Job_Cargo",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "CusQuote_Types",
                schema: "public",
                newName: "tbl_CusQuote_Types",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "CusQuote_Revision",
                schema: "public",
                newName: "tbl_CusQuote_Revision",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "CusQuote_RevenueOptions",
                schema: "public",
                newName: "tbl_CusQuote_RevenueOptions",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "CusQuote_Header",
                schema: "public",
                newName: "tbl_CusQuote_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "CusQuote_CostOptions",
                schema: "public",
                newName: "tbl_CusQuote_CostOptions",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "CusQuote_ChargesOut",
                schema: "public",
                newName: "tbl_CusQuote_ChargesOut",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "CusQuote_ChargesIn",
                schema: "public",
                newName: "tbl_CusQuote_ChargesIn",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "CusQuote_AuditLog",
                schema: "public",
                newName: "tbl_CusQuote_AuditLog",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "cmp_Users_Offices",
                schema: "public",
                newName: "tbl_cmp_Users_Offices",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "cmp_Users_Groups",
                schema: "public",
                newName: "tbl_cmp_Users_Groups",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "cmp_Users",
                schema: "public",
                newName: "tbl_cmp_Users",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "cmp_Offices",
                schema: "public",
                newName: "tbl_cmp_Offices",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "cmp_Groups",
                schema: "public",
                newName: "tbl_cmp_Groups",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "cmp_Company_Offices",
                schema: "public",
                newName: "tbl_cmp_Company_Offices",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "cmp_Company",
                schema: "public",
                newName: "tbl_cmp_Company",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Acc_Receipts_Lines",
                schema: "public",
                newName: "tbl_Acc_Receipts_Lines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Acc_Receipts_Header",
                schema: "public",
                newName: "tbl_Acc_Receipts_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Acc_Payments_Lines",
                schema: "public",
                newName: "tbl_Acc_Payments_Lines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Acc_Payments_Header",
                schema: "public",
                newName: "tbl_Acc_Payments_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Acc_ARTrans_Lines",
                schema: "public",
                newName: "tbl_Acc_ARTrans_Lines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Acc_ARTrans_Header",
                schema: "public",
                newName: "tbl_Acc_ARTrans_Header",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Acc_APTrans_Lines",
                schema: "public",
                newName: "tbl_Acc_APTrans_Lines",
                newSchema: "public");

            migrationBuilder.RenameTable(
                name: "Acc_APTrans_Header",
                schema: "public",
                newName: "tbl_Acc_APTrans_Header",
                newSchema: "public");

        }
    }
}
