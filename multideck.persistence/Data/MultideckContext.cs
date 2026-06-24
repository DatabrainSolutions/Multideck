using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence.Entities;

namespace Multideck.Persistence;

public partial class MultideckContext : DbContext
{
    public MultideckContext(DbContextOptions<MultideckContext> options)
        : base(options)
    {
    }

    public virtual DbSet<RefCountry> RefCountries { get; set; }

    public virtual DbSet<RefCountryState> RefCountryStates { get; set; }

    public virtual DbSet<Sysdiagram> Sysdiagrams { get; set; }

    public virtual DbSet<AccAptransHeader> AccAptransHeaders { get; set; }

    public virtual DbSet<AccAptransLine> AccAptransLines { get; set; }

    public virtual DbSet<AccArtransHeader> AccArtransHeaders { get; set; }

    public virtual DbSet<AccArtransLine> AccArtransLines { get; set; }

    public virtual DbSet<AccPaymentsHeader> AccPaymentsHeaders { get; set; }

    public virtual DbSet<AccPaymentsLine> AccPaymentsLines { get; set; }

    public virtual DbSet<AccReceiptsHeader> AccReceiptsHeaders { get; set; }

    public virtual DbSet<AccReceiptsLine> AccReceiptsLines { get; set; }

    public virtual DbSet<CmpCompany> CmpCompanies { get; set; }

    public virtual DbSet<CmpGroup> CmpGroups { get; set; }

    public virtual DbSet<CmpOffice> CmpOffices { get; set; }

    public virtual DbSet<CmpUser> CmpUsers { get; set; }

    public virtual DbSet<CusQuoteAuditLog> CusQuoteAuditLogs { get; set; }

    public virtual DbSet<CusQuoteChargesIn> CusQuoteChargesIns { get; set; }

    public virtual DbSet<CusQuoteChargesOut> CusQuoteChargesOuts { get; set; }

    public virtual DbSet<CusQuoteCostOption> CusQuoteCostOptions { get; set; }

    public virtual DbSet<CusQuoteHeader> CusQuoteHeaders { get; set; }

    public virtual DbSet<CusQuoteRevenueOption> CusQuoteRevenueOptions { get; set; }

    public virtual DbSet<CusQuoteRevision> CusQuoteRevisions { get; set; }

    public virtual DbSet<CusQuoteType> CusQuoteTypes { get; set; }

    public virtual DbSet<JobCargo> JobCargos { get; set; }

    public virtual DbSet<JobContainer> JobContainers { get; set; }

    public virtual DbSet<JobCostingChargesIn> JobCostingChargesIns { get; set; }

    public virtual DbSet<JobCostingChargesOut> JobCostingChargesOuts { get; set; }

    public virtual DbSet<JobHeader> JobHeaders { get; set; }

    public virtual DbSet<JobRouting> JobRoutings { get; set; }

    public virtual DbSet<OrgAddress> OrgAddresses { get; set; }

    public virtual DbSet<OrgAddressType> OrgAddressTypes { get; set; }

    public virtual DbSet<OrgContact> OrgContacts { get; set; }

    public virtual DbSet<OrgContactEmail> OrgContactEmails { get; set; }

    public virtual DbSet<OrgCurrencyAccount> OrgCurrencyAccounts { get; set; }

    public virtual DbSet<OrgMaster> OrgMasters { get; set; }

    public virtual DbSet<OrgType> OrgTypes { get; set; }

    public virtual DbSet<SysAddressType> SysAddressTypes { get; set; }

    public virtual DbSet<SysAirline> SysAirlines { get; set; }

    public virtual DbSet<SysCarriersConsortium> SysCarriersConsortiums { get; set; }

    public virtual DbSet<SysCityTown> SysCityTowns { get; set; }

    public virtual DbSet<SysCommodityCode> SysCommodityCodes { get; set; }

    public virtual DbSet<SysContainer> SysContainers { get; set; }

    public virtual DbSet<SysCurrency> SysCurrencies { get; set; }

    public virtual DbSet<SysDocType> SysDocTypes { get; set; }

    public virtual DbSet<SysEmailType> SysEmailTypes { get; set; }

    public virtual DbSet<SysListGrouping> SysListGroupings { get; set; }

    public virtual DbSet<SysModule> SysModules { get; set; }

    public virtual DbSet<SysPhoneType> SysPhoneTypes { get; set; }

    public virtual DbSet<SysRefUnloco> SysRefUnlocos { get; set; }

    public virtual DbSet<SysUserRole> SysUserRoles { get; set; }

    public virtual DbSet<Warehouse> Warehouses { get; set; }

    public virtual DbSet<WarehouseArea> WarehouseAreas { get; set; }

    public virtual DbSet<WarehouseLocation> WarehouseLocations { get; set; }

    public virtual DbSet<WorkflowItem> WorkflowItems { get; set; }

    public virtual DbSet<WorkflowTemplatesHeader> WorkflowTemplatesHeaders { get; set; }

    public virtual DbSet<WorkflowTemplatesLine> WorkflowTemplatesLines { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder
            .HasPostgresEnum("auth", "aal_level", new[] { "aal1", "aal2", "aal3" })
            .HasPostgresEnum("auth", "code_challenge_method", new[] { "s256", "plain" })
            .HasPostgresEnum("auth", "factor_status", new[] { "unverified", "verified" })
            .HasPostgresEnum("auth", "factor_type", new[] { "totp", "webauthn", "phone" })
            .HasPostgresEnum("auth", "oauth_authorization_status", new[] { "pending", "approved", "denied", "expired" })
            .HasPostgresEnum("auth", "oauth_client_type", new[] { "public", "confidential" })
            .HasPostgresEnum("auth", "oauth_registration_type", new[] { "dynamic", "manual" })
            .HasPostgresEnum("auth", "oauth_response_type", new[] { "code" })
            .HasPostgresEnum("auth", "one_time_token_type", new[] { "confirmation_token", "reauthentication_token", "recovery_token", "email_change_token_new", "email_change_token_current", "phone_change_token" })
            .HasPostgresEnum("net", "request_status", new[] { "PENDING", "SUCCESS", "ERROR" })
            .HasPostgresEnum("realtime", "action", new[] { "INSERT", "UPDATE", "DELETE", "TRUNCATE", "ERROR" })
            .HasPostgresEnum("realtime", "equality_op", new[] { "eq", "neq", "lt", "lte", "gt", "gte", "in" })
            .HasPostgresEnum("storage", "buckettype", new[] { "STANDARD", "ANALYTICS", "VECTOR" })
            .HasPostgresExtension("extensions", "pg_net")
            .HasPostgresExtension("extensions", "pg_stat_statements")
            .HasPostgresExtension("extensions", "pgcrypto")
            .HasPostgresExtension("extensions", "uuid-ossp")
            .HasPostgresExtension("vault", "supabase_vault");

        modelBuilder.Entity<RefCountry>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("RefCountry");

            entity.Property(e => e.RnAddressFormattingRule)
                .HasMaxLength(3)
                .HasColumnName("RN_AddressFormattingRule");
            entity.Property(e => e.RnAutoVersion).HasColumnName("RN_AutoVersion");
            entity.Property(e => e.RnCode)
                .HasMaxLength(2)
                .HasColumnName("RN_Code");
            entity.Property(e => e.RnCountryDialingCode)
                .HasMaxLength(3)
                .HasColumnName("RN_CountryDialingCode");
            entity.Property(e => e.RnDesc)
                .HasMaxLength(35)
                .HasColumnName("RN_Desc");
            entity.Property(e => e.RnEconomicGrouping)
                .HasMaxLength(3)
                .HasColumnName("RN_EconomicGrouping");
            entity.Property(e => e.RnIsActive).HasColumnName("RN_IsActive");
            entity.Property(e => e.RnIsSanctioned).HasColumnName("RN_IsSanctioned");
            entity.Property(e => e.RnIsSystem).HasColumnName("RN_IsSystem");
            entity.Property(e => e.RnIsoAlpha3Code)
                .HasMaxLength(3)
                .HasColumnName("RN_IsoAlpha3Code");
            entity.Property(e => e.RnIsoNumericUnm49code)
                .HasMaxLength(3)
                .HasColumnName("RN_IsoNumericUNM49Code");
            entity.Property(e => e.RnPk).HasColumnName("RN_PK");
            entity.Property(e => e.RnPostcodeValidationRule)
                .HasMaxLength(3)
                .HasColumnName("RN_PostcodeValidationRule");
            entity.Property(e => e.RnRxNkairWaybillCurrency)
                .HasMaxLength(3)
                .HasColumnName("RN_RX_NKAirWaybillCurrency");
            entity.Property(e => e.RnRxNklocalCurrency)
                .HasMaxLength(3)
                .HasColumnName("RN_RX_NKLocalCurrency");
            entity.Property(e => e.RnStateProvinceValidationRule)
                .HasMaxLength(3)
                .HasColumnName("RN_StateProvinceValidationRule");
            entity.Property(e => e.RnSystemCreateTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RN_SystemCreateTimeUtc");
            entity.Property(e => e.RnSystemCreateUser)
                .HasMaxLength(3)
                .HasColumnName("RN_SystemCreateUser");
            entity.Property(e => e.RnSystemLastEditTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RN_SystemLastEditTimeUtc");
            entity.Property(e => e.RnSystemLastEditUser)
                .HasMaxLength(3)
                .HasColumnName("RN_SystemLastEditUser");
            entity.Property(e => e.RnValidationStatus)
                .HasMaxLength(3)
                .HasColumnName("RN_ValidationStatus");
        });

        modelBuilder.Entity<RefCountryState>(entity =>
        {
            entity.HasNoKey();

            entity.Property(e => e.RwAutoVersion).HasColumnName("RW_AutoVersion");
            entity.Property(e => e.RwCode)
                .HasMaxLength(3)
                .HasColumnName("RW_Code");
            entity.Property(e => e.RwDescription)
                .HasMaxLength(35)
                .HasColumnName("RW_Description");
            entity.Property(e => e.RwIsActive).HasColumnName("RW_IsActive");
            entity.Property(e => e.RwIsSystem).HasColumnName("RW_IsSystem");
            entity.Property(e => e.RwPk).HasColumnName("RW_PK");
            entity.Property(e => e.RwRegionName)
                .HasMaxLength(35)
                .HasColumnName("RW_RegionName");
            entity.Property(e => e.RwRnNkcountryCode)
                .HasMaxLength(2)
                .HasColumnName("RW_RN_NKCountryCode");
            entity.Property(e => e.RwSystemCreateTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RW_SystemCreateTimeUtc");
            entity.Property(e => e.RwSystemCreateUser)
                .HasMaxLength(3)
                .HasColumnName("RW_SystemCreateUser");
            entity.Property(e => e.RwSystemLastEditTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RW_SystemLastEditTimeUtc");
            entity.Property(e => e.RwSystemLastEditUser)
                .HasMaxLength(3)
                .HasColumnName("RW_SystemLastEditUser");
        });

        modelBuilder.Entity<Sysdiagram>(entity =>
        {
            entity.HasKey(e => e.DiagramId).HasName("PK__sysdiagr__C2B05B61EB349378");

            entity.ToTable("sysdiagrams");

            entity.Property(e => e.DiagramId).HasColumnName("diagram_id");
            entity.Property(e => e.Definition).HasColumnName("definition");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.PrincipalId).HasColumnName("principal_id");
            entity.Property(e => e.Version).HasColumnName("version");
        });

        modelBuilder.Entity<AccAptransHeader>(entity =>
        {
            entity.HasKey(e => e.AccApId);

            entity.ToTable("Acc_APTrans_Header");

            entity.Property(e => e.AccApId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Acc_AP_ID");
            entity.Property(e => e.AccApAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_AP_Amount");
            entity.Property(e => e.AccApCreatedBy).HasColumnName("Acc_AP_CreatedBy");
            entity.Property(e => e.AccApCreatedDate)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("Acc_AP_CreatedDate");
            entity.Property(e => e.AccApCurrency).HasColumnName("Acc_AP_Currency");
            entity.Property(e => e.AccApDate).HasColumnName("Acc_AP_Date");
            entity.Property(e => e.AccApDueDate).HasColumnName("Acc_AP_DueDate");
            entity.Property(e => e.AccApLocalAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_AP_LocalAmount");
            entity.Property(e => e.AccApLocalTaxAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_AP_LocalTaxAmount");
            entity.Property(e => e.AccApModule)
                .HasMaxLength(5)
                .HasColumnName("Acc_AP_Module");
            entity.Property(e => e.AccApNotes).HasColumnName("Acc_AP_Notes");
            entity.Property(e => e.AccApOffice).HasColumnName("Acc_AP_Office");
            entity.Property(e => e.AccApStatus).HasColumnName("Acc_AP_Status");
            entity.Property(e => e.AccApSupplierId).HasColumnName("Acc_AP_SupplierID");
            entity.Property(e => e.AccApSupplierRef)
                .HasMaxLength(50)
                .HasColumnName("Acc_AP_SupplierRef");
            entity.Property(e => e.AccApTaxAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_AP_TaxAmount");
            entity.Property(e => e.AccApTaxCode)
                .HasMaxLength(10)
                .HasColumnName("Acc_AP_TaxCode");
            entity.Property(e => e.AccApTs).HasColumnName("Acc_AP_TS");

            entity.HasOne(d => d.AccApModuleNavigation).WithMany(p => p.AccAptransHeaders)
                .HasForeignKey(d => d.AccApModule)
                .HasConstraintName("FK_tbl_Acc_APTrans_Header_tbl_sys_Modules");

            entity.HasOne(d => d.AccApSupplier).WithMany(p => p.AccAptransHeaders)
                .HasForeignKey(d => d.AccApSupplierId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_Acc_APTrans_Header_tbl_Org_Master");
        });

        modelBuilder.Entity<AccAptransLine>(entity =>
        {
            entity.HasKey(e => e.AccAplineId).HasName("PK_tbl_Acc_APTRans_Lines");

            entity.ToTable("Acc_APTrans_Lines");

            entity.Property(e => e.AccAplineId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Acc_APLine_ID");
            entity.Property(e => e.AccAplineAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_APLine_Amount");
            entity.Property(e => e.AccAplineChargeId).HasColumnName("Acc_APLine_ChargeID");
            entity.Property(e => e.AccAplineCurrency).HasColumnName("Acc_APLine_Currency");
            entity.Property(e => e.AccAplineDescription)
                .HasMaxLength(50)
                .HasColumnName("Acc_APLine_Description");
            entity.Property(e => e.AccAplineHeaderId).HasColumnName("Acc_APLine_HeaderID");
            entity.Property(e => e.AccAplineJobId).HasColumnName("Acc_APLine_JobID");
            entity.Property(e => e.AccAplineLocalAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_APLine_LocalAmount");
            entity.Property(e => e.AccAplineLocalTaxAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_APLine_LocalTaxAmount");
            entity.Property(e => e.AccAplineNotes)
                .HasMaxLength(100)
                .HasColumnName("Acc_APLine_Notes");
            entity.Property(e => e.AccAplineRoe)
                .HasPrecision(18, 5)
                .HasColumnName("Acc_APLine_ROE");
            entity.Property(e => e.AccAplineTaxAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_APLine_TaxAmount");
            entity.Property(e => e.AccAplineTaxCode).HasColumnName("Acc_APLine_TaxCode");

            entity.HasOne(d => d.AccAplineHeader).WithMany(p => p.AccAptransLines)
                .HasForeignKey(d => d.AccAplineHeaderId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_Acc_APTRans_Lines_tbl_Acc_APTrans_Header");

            entity.HasOne(d => d.AccAplineJob).WithMany(p => p.AccAptransLines)
                .HasForeignKey(d => d.AccAplineJobId)
                .HasConstraintName("FK_tbl_Acc_APTRans_Lines_tbl_Job_Header");
        });

        modelBuilder.Entity<AccArtransHeader>(entity =>
        {
            entity.HasKey(e => e.AccArId);

            entity.ToTable("Acc_ARTrans_Header");

            entity.Property(e => e.AccArId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Acc_AR_ID");
            entity.Property(e => e.AccArCreatedBy).HasColumnName("Acc_AR_CreatedBy");
            entity.Property(e => e.AccArCreatedDate)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("Acc_AR_CreatedDate");
            entity.Property(e => e.AccArCurrAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_AR_CurrAmount");
            entity.Property(e => e.AccArCurrGrossAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_AR_CurrGrossAmount");
            entity.Property(e => e.AccArCurrTaxAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_AR_CurrTaxAmount");
            entity.Property(e => e.AccArCurrency).HasColumnName("Acc_AR_Currency");
            entity.Property(e => e.AccArCustomerAddress).HasColumnName("Acc_AR_CustomerAddress");
            entity.Property(e => e.AccArCustomerId).HasColumnName("Acc_AR_CustomerID");
            entity.Property(e => e.AccArDate)
                .HasDefaultValueSql("now()")
                .HasColumnName("Acc_AR_Date");
            entity.Property(e => e.AccArDocStyle).HasColumnName("Acc_AR_DocStyle");
            entity.Property(e => e.AccArDueDate).HasColumnName("Acc_AR_DueDate");
            entity.Property(e => e.AccArFullyPaid).HasColumnName("Acc_AR_FullyPaid");
            entity.Property(e => e.AccArJobId).HasColumnName("Acc_AR_JobID");
            entity.Property(e => e.AccArLocalAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_AR_LocalAmount");
            entity.Property(e => e.AccArLocalGrossAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_AR_LocalGrossAmount");
            entity.Property(e => e.AccArLocalTaxAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_AR_LocalTaxAmount");
            entity.Property(e => e.AccArModule)
                .HasMaxLength(5)
                .HasColumnName("Acc_AR_Module");
            entity.Property(e => e.AccArNotes).HasColumnName("Acc_AR_Notes");
            entity.Property(e => e.AccArNumber)
                .ValueGeneratedOnAdd()
                .HasColumnName("Acc_AR_Number");
            entity.Property(e => e.AccArPaidDate).HasColumnName("Acc_AR_PaidDate");
            entity.Property(e => e.AccArPrinted).HasColumnName("Acc_AR_Printed");
            entity.Property(e => e.AccArPrintedBy).HasColumnName("Acc_AR_PrintedBy");
            entity.Property(e => e.AccArPrintedDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("Acc_AR_PrintedDate");
            entity.Property(e => e.AccArReverseId).HasColumnName("Acc_AR_ReverseID");
            entity.Property(e => e.AccArReversed).HasColumnName("Acc_AR_Reversed");
            entity.Property(e => e.AccArReversedReason)
                .HasMaxLength(50)
                .HasColumnName("Acc_AR_ReversedReason");
            entity.Property(e => e.AccArRoe)
                .HasPrecision(18, 5)
                .HasColumnName("Acc_AR_ROE");
            entity.Property(e => e.AccArStatus).HasColumnName("Acc_AR_Status");
            entity.Property(e => e.AccArTaxCode)
                .HasMaxLength(50)
                .HasColumnName("Acc_AR_TaxCode");
            entity.Property(e => e.AccArTransactionType).HasColumnName("Acc_AR_TransactionType");
            entity.Property(e => e.AccArTs).HasColumnName("Acc_AR_TS");

            entity.HasOne(d => d.AccArJob).WithMany(p => p.AccArtransHeaders)
                .HasForeignKey(d => d.AccArJobId)
                .HasConstraintName("FK_tbl_Acc_ARTrans_Header_tbl_Job_Header");
        });

        modelBuilder.Entity<AccArtransLine>(entity =>
        {
            entity.HasKey(e => e.AccArlineId);

            entity.ToTable("Acc_ARTrans_Lines");

            entity.Property(e => e.AccArlineId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Acc_ARLine_ID");
            entity.Property(e => e.AccArlineAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_ARLine_Amount");
            entity.Property(e => e.AccArlineChargeId).HasColumnName("Acc_ARLine_ChargeID");
            entity.Property(e => e.AccArlineCurrency).HasColumnName("Acc_ARLine_Currency");
            entity.Property(e => e.AccArlineDescription)
                .HasMaxLength(50)
                .HasColumnName("Acc_ARLine_Description");
            entity.Property(e => e.AccArlineHeaderId).HasColumnName("Acc_ARLine_HeaderID");
            entity.Property(e => e.AccArlineLocalAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_ARLine_LocalAmount");
            entity.Property(e => e.AccArlineLocalTaxAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_ARLine_LocalTaxAmount");
            entity.Property(e => e.AccArlineNotes)
                .HasMaxLength(100)
                .HasColumnName("Acc_ARLine_Notes");
            entity.Property(e => e.AccArlineRoe)
                .HasPrecision(18, 5)
                .HasColumnName("Acc_ARLine_ROE");
            entity.Property(e => e.AccArlineShowCurr)
                .HasDefaultValue(false)
                .HasColumnName("Acc_ARLine_ShowCurr");
            entity.Property(e => e.AccArlineTaxAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_ARLine_TaxAmount");
            entity.Property(e => e.AccArlineTaxCode).HasColumnName("Acc_ARLine_TaxCode");

            entity.HasOne(d => d.AccArlineHeader).WithMany(p => p.AccArtransLines)
                .HasForeignKey(d => d.AccArlineHeaderId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_Acc_ARTrans_Lines_tbl_Acc_ARTrans_Header");
        });

        modelBuilder.Entity<AccPaymentsHeader>(entity =>
        {
            entity.HasKey(e => e.AccPaymentsId).HasName("PK_tbl_Acc_Payments");

            entity.ToTable("Acc_Payments_Header");

            entity.Property(e => e.AccPaymentsId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Acc_Payments_ID");
            entity.Property(e => e.AccPaymentsAccountsTrxNo)
                .HasMaxLength(50)
                .HasColumnName("Acc_Payments_AccountsTrxNo");
            entity.Property(e => e.AccPaymentsActualPaymentDate).HasColumnName("Acc_Payments_ActualPaymentDate");
            entity.Property(e => e.AccPaymentsAmount).HasColumnName("Acc_Payments_Amount");
            entity.Property(e => e.AccPaymentsCreatedDate)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("Acc_Payments_CreatedDate");
            entity.Property(e => e.AccPaymentsCreatedby).HasColumnName("Acc_Payments_Createdby");
            entity.Property(e => e.AccPaymentsCurrency).HasColumnName("Acc_Payments_Currency");
            entity.Property(e => e.AccPaymentsEstPaymentDate).HasColumnName("Acc_Payments_EstPaymentDate");
            entity.Property(e => e.AccPaymentsOfficeId).HasColumnName("Acc_Payments_OfficeID");
            entity.Property(e => e.AccPaymentsPostedToAccounts)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("Acc_Payments_PostedToAccounts");
            entity.Property(e => e.AccPaymentsRemittanceDate).HasColumnName("Acc_Payments_RemittanceDate");
            entity.Property(e => e.AccPaymentsRemittanceSent).HasColumnName("Acc_Payments_RemittanceSent");
            entity.Property(e => e.AccPaymentsRoe)
                .HasPrecision(18, 5)
                .HasColumnName("Acc_Payments_ROE");
            entity.Property(e => e.AccPaymentsSupplierId).HasColumnName("Acc_Payments_SupplierID");
            entity.Property(e => e.AccPaymentsTs).HasColumnName("Acc_Payments_TS");
            entity.Property(e => e.AccPaymentsVisibleId)
                .ValueGeneratedOnAdd()
                .HasColumnName("Acc_Payments_VisibleID");
        });

        modelBuilder.Entity<AccPaymentsLine>(entity =>
        {
            entity.HasKey(e => e.AccPayLineId);

            entity.ToTable("Acc_Payments_Lines");

            entity.Property(e => e.AccPayLineId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Acc_PayLine_ID");
            entity.Property(e => e.AccPayLineAmount)
                .HasPrecision(18, 2)
                .HasColumnName("Acc_PayLine_Amount");
            entity.Property(e => e.AccPayLineChargeId).HasColumnName("Acc_PayLine_ChargeID");
            entity.Property(e => e.AccPayLineCurrency).HasColumnName("Acc_PayLine_Currency");
            entity.Property(e => e.AccPayLineHeaderId).HasColumnName("Acc_PayLine_HeaderID");
            entity.Property(e => e.AccPayLineRoe)
                .HasPrecision(18, 5)
                .HasColumnName("Acc_PayLine_ROE");
            entity.Property(e => e.AccPayLineSupplierInvoiceId).HasColumnName("Acc_PayLine_SupplierInvoiceID");

            entity.HasOne(d => d.AccPayLineCharge).WithMany(p => p.AccPaymentsLines)
                .HasForeignKey(d => d.AccPayLineChargeId)
                .HasConstraintName("FK_tbl_Acc_Payments_Lines_tbl_Job_Costing_ChargesIn");

            entity.HasOne(d => d.AccPayLineHeader).WithMany(p => p.AccPaymentsLines)
                .HasForeignKey(d => d.AccPayLineHeaderId)
                .HasConstraintName("FK_tbl_Acc_Payments_Lines_tbl_Acc_Payments_Header");
        });

        modelBuilder.Entity<AccReceiptsHeader>(entity =>
        {
            entity.HasKey(e => e.AccReceiptId);

            entity.ToTable("Acc_Receipts_Header");

            entity.Property(e => e.AccReceiptId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("AccReceipt_ID");
            entity.Property(e => e.AccReceiptAccountsTrxNo)
                .HasMaxLength(50)
                .HasColumnName("AccReceipt_AccountsTrxNo");
            entity.Property(e => e.AccReceiptAllocatedAmount)
                .HasPrecision(18, 2)
                .HasColumnName("AccReceipt_AllocatedAmount");
            entity.Property(e => e.AccReceiptAllocatedonAccount)
                .HasPrecision(18, 2)
                .HasColumnName("AccReceipt_AllocatedonAccount");
            entity.Property(e => e.AccReceiptAmount)
                .HasPrecision(18, 2)
                .HasColumnName("AccReceipt_Amount");
            entity.Property(e => e.AccReceiptCreatedBy).HasColumnName("AccReceipt_CreatedBy");
            entity.Property(e => e.AccReceiptCreatedDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("AccReceipt_CreatedDate");
            entity.Property(e => e.AccReceiptCurrency).HasColumnName("AccReceipt_Currency");
            entity.Property(e => e.AccReceiptCustomerId).HasColumnName("AccReceipt_CustomerID");
            entity.Property(e => e.AccReceiptCustomerRef)
                .HasMaxLength(50)
                .HasColumnName("AccReceipt_CustomerRef");
            entity.Property(e => e.AccReceiptNotes)
                .HasMaxLength(500)
                .HasColumnName("AccReceipt_Notes");
            entity.Property(e => e.AccReceiptOfficeId).HasColumnName("AccReceipt_OfficeID");
            entity.Property(e => e.AccReceiptPostedToAccounts)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("AccReceipt_PostedToAccounts");
            entity.Property(e => e.AccReceiptReceivedDate).HasColumnName("AccReceipt_ReceivedDate");
            entity.Property(e => e.AccReceiptRemittanceDate).HasColumnName("AccReceipt_RemittanceDate");
            entity.Property(e => e.AccReceiptRoe)
                .HasPrecision(18, 5)
                .HasColumnName("AccReceipt_ROE");
            entity.Property(e => e.AccReceiptTs).HasColumnName("AccReceipt_TS");
        });

        modelBuilder.Entity<AccReceiptsLine>(entity =>
        {
            entity.HasKey(e => e.AccReceiptLineId);

            entity.ToTable("Acc_Receipts_Lines");

            entity.Property(e => e.AccReceiptLineId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("AccReceipt_Line_ID");
            entity.Property(e => e.AccReceiptLineAmount)
                .HasPrecision(18, 2)
                .HasColumnName("AccReceipt_Line_Amount");
            entity.Property(e => e.AccReceiptLineChargeId).HasColumnName("AccReceipt_Line_ChargeID");
            entity.Property(e => e.AccReceiptLineFullInvoice).HasColumnName("AccReceipt_Line_FullInvoice");
            entity.Property(e => e.AccReceiptLineHeaderId).HasColumnName("AccReceipt_Line_HeaderID");
            entity.Property(e => e.AccReceiptLineInvoice).HasColumnName("AccReceipt_Line_Invoice");
            entity.Property(e => e.AccReceiptLineNotes)
                .HasMaxLength(200)
                .HasColumnName("AccReceipt_Line_Notes");

            entity.HasOne(d => d.AccReceiptLineCharge).WithMany(p => p.AccReceiptsLines)
                .HasForeignKey(d => d.AccReceiptLineChargeId)
                .HasConstraintName("FK_tbl_Acc_Receipts_Lines_tbl_Job_Costing_ChargesOut");

            entity.HasOne(d => d.AccReceiptLineHeader).WithMany(p => p.AccReceiptsLines)
                .HasForeignKey(d => d.AccReceiptLineHeaderId)
                .HasConstraintName("FK_tbl_Acc_Receipts_Lines_tbl_Acc_Receipts_Header");

            entity.HasOne(d => d.AccReceiptLineInvoiceNavigation).WithMany(p => p.AccReceiptsLines)
                .HasForeignKey(d => d.AccReceiptLineInvoice)
                .HasConstraintName("FK_tbl_Acc_Receipts_Lines_tbl_Acc_ARTrans_Header");
        });

        modelBuilder.Entity<CmpCompany>(entity =>
        {
            entity.HasKey(e => e.CompanyId).HasName("PK_tbl_Company");

            entity.ToTable("cmp_Company");

            entity.Property(e => e.CompanyId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Company_ID");
            entity.Property(e => e.CompanyName)
                .HasMaxLength(100)
                .HasColumnName("Company_Name");
        });

        modelBuilder.Entity<CmpGroup>(entity =>
        {
            entity.HasKey(e => e.GroupId);

            entity.ToTable("cmp_Groups");

            entity.Property(e => e.GroupId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Group_ID");
            entity.Property(e => e.GroupCreatedBy).HasColumnName("Group_CreatedBy");
            entity.Property(e => e.GroupCreatedDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("Group_CreatedDate");
            entity.Property(e => e.GroupName)
                .HasMaxLength(25)
                .HasColumnName("Group_Name");
            entity.Property(e => e.GroupNotes)
                .HasMaxLength(200)
                .HasColumnName("Group_Notes");
        });

        modelBuilder.Entity<CmpOffice>(entity =>
        {
            entity.HasKey(e => e.OfficeId).HasName("PK_tbl_Offices");

            entity.ToTable("cmp_Offices");

            entity.HasIndex(e => e.CompanyId).HasDatabaseName("IX_cmp_Offices_Company_ID");

            entity.Property(e => e.OfficeId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Office_ID");
            entity.Property(e => e.CompanyId).HasColumnName("Company_ID");
            entity.Property(e => e.OfficeAddress)
                .HasMaxLength(200)
                .HasColumnName("Office_Address");
            entity.Property(e => e.OfficeName)
                .HasMaxLength(50)
                .HasColumnName("Office_Name");

            entity.HasOne(d => d.Company).WithMany(p => p.Offices)
                .HasForeignKey(d => d.CompanyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_cmp_Offices_cmp_Company");
        });

        modelBuilder.Entity<CmpUser>(entity =>
        {
            entity.HasKey(e => e.UserId);

            entity.ToTable("cmp_Users");

            entity.HasIndex(e => e.AuthUserId)
                .IsUnique()
                .HasDatabaseName("UX_cmp_Users_Auth_User_ID");
            entity.HasIndex(e => e.CompanyId).HasDatabaseName("IX_cmp_Users_Company_ID");

            entity.Property(e => e.UserId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("User_ID");
            entity.Property(e => e.AuthUserId).HasColumnName("Auth_User_ID");
            entity.Property(e => e.CompanyId).HasColumnName("Company_ID");
            entity.Property(e => e.UserEmail)
                .HasMaxLength(320)
                .HasColumnName("User_Email");
            entity.Property(e => e.UserFirstname)
                .HasMaxLength(50)
                .HasColumnName("User_Firstname");
            entity.Property(e => e.UserLastname)
                .HasMaxLength(50)
                .HasColumnName("User_Lastname");

            entity.HasOne(d => d.Company).WithMany(p => p.Users)
                .HasForeignKey(d => d.CompanyId)
                .HasConstraintName("FK_cmp_Users_cmp_Company");

            entity.HasMany(d => d.Groups).WithMany(p => p.Users)
                .UsingEntity<Dictionary<string, object>>(
                    "CmpUsersGroup",
                    r => r.HasOne<CmpGroup>().WithMany()
                        .HasForeignKey("GroupId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_tbl_cmp_Users_Groups_tbl_cmp_Groups"),
                    l => l.HasOne<CmpUser>().WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_tbl_cmp_Users_Groups_tbl_cmp_Users"),
                    j =>
                    {
                        j.HasKey("UserId", "GroupId");
                        j.ToTable("cmp_Users_Groups");
                        j.IndexerProperty<Guid>("UserId").HasColumnName("User_ID");
                        j.IndexerProperty<Guid>("GroupId").HasColumnName("Group_ID");
                    });

            entity.HasMany(d => d.Offices).WithMany(p => p.Users)
                .UsingEntity<Dictionary<string, object>>(
                    "CmpUsersOffice",
                    r => r.HasOne<CmpOffice>().WithMany()
                        .HasForeignKey("OfficeId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_tbl_cmp_Users_Offices_tbl_cmp_Offices"),
                    l => l.HasOne<CmpUser>().WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_tbl_cmp_Users_Offices_tbl_cmp_Users"),
                    j =>
                    {
                        j.HasKey("UserId", "OfficeId").HasName("PK_tbl_cmp_User_Offices");
                        j.ToTable("cmp_Users_Offices");
                        j.IndexerProperty<Guid>("UserId").HasColumnName("User_ID");
                        j.IndexerProperty<Guid>("OfficeId").HasColumnName("Office_ID");
                    });
        });

        modelBuilder.Entity<CusQuoteAuditLog>(entity =>
        {
            entity.HasKey(e => e.CusQuoteLogId);

            entity.ToTable("CusQuote_AuditLog");

            entity.Property(e => e.CusQuoteLogId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("CusQuoteLog_ID");
            entity.Property(e => e.CusQuoteLogCostLineId).HasColumnName("CusQuoteLog_CostLineID");
            entity.Property(e => e.CusQuoteLogCostOptId).HasColumnName("CusQuoteLog_CostOptID");
            entity.Property(e => e.CusQuoteLogDateTimeLocal)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("CusQuoteLog_DateTime_Local");
            entity.Property(e => e.CusQuoteLogDateTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("CusQuoteLog_DateTime_UTC");
            entity.Property(e => e.CusQuoteLogEventType).HasColumnName("CusQuoteLog_EventType");
            entity.Property(e => e.CusQuoteLogNotes).HasColumnName("CusQuoteLog_Notes");
            entity.Property(e => e.CusQuoteLogQuoteId).HasColumnName("CusQuoteLog_QuoteID");
            entity.Property(e => e.CusQuoteLogRevId).HasColumnName("CusQuoteLog_RevID");
            entity.Property(e => e.CusQuoteLogRevenueLineId).HasColumnName("CusQuoteLog_RevenueLineID");
            entity.Property(e => e.CusQuoteLogRevenueOptId).HasColumnName("CusQuoteLog_RevenueOptID");
            entity.Property(e => e.CusQuoteLogTs).HasColumnName("CusQuoteLog_TS");
            entity.Property(e => e.CusQuoteLogUserId).HasColumnName("CusQuoteLog_UserID");
        });

        modelBuilder.Entity<CusQuoteChargesIn>(entity =>
        {
            entity.HasKey(e => e.CusQuoteChargesInId);

            entity.ToTable("CusQuote_ChargesIn");

            entity.Property(e => e.CusQuoteChargesInId)
                .ValueGeneratedNever()
                .HasColumnName("CusQuoteChargesIn_ID");
            entity.Property(e => e.CusQuoteChargesInChargeCode).HasColumnName("CusQuoteChargesIn_ChargeCode");
            entity.Property(e => e.CusQuoteChargesInCostId).HasColumnName("CusQuoteChargesIn_CostID");
            entity.Property(e => e.CusQuoteChargesInDescription)
                .HasMaxLength(100)
                .HasColumnName("CusQuoteChargesIn_Description");
            entity.Property(e => e.CusQuoteChargesInExpectedCostCurr)
                .HasPrecision(18, 2)
                .HasColumnName("CusQuoteChargesIn_ExpectedCost_Curr");
            entity.Property(e => e.CusQuoteChargesInExpectedCostLocal)
                .HasPrecision(18, 2)
                .HasColumnName("CusQuoteChargesIn_ExpectedCost_Local");
            entity.Property(e => e.CusQuoteChargesInFrom).HasColumnName("CusQuoteChargesIn_From");
            entity.Property(e => e.CusQuoteChargesInFromCurr).HasColumnName("CusQuoteChargesIn_FromCurr");
            entity.Property(e => e.CusQuoteChargesInIntNotes)
                .HasMaxLength(100)
                .HasColumnName("CusQuoteChargesIn_IntNotes");
            entity.Property(e => e.CusQuoteChargesInsFromRoe)
                .HasPrecision(18, 5)
                .HasColumnName("CusQuoteChargesIns_FromROE");
            entity.Property(e => e.CusQuoteCostOptId).HasColumnName("CusQuoteCostOpt_ID");

            entity.HasOne(d => d.CusQuoteCostOpt).WithMany(p => p.CusQuoteChargesIns)
                .HasForeignKey(d => d.CusQuoteCostOptId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_CusQuote_ChargesIn_tbl_CusQuote_CostOptions");
        });

        modelBuilder.Entity<CusQuoteChargesOut>(entity =>
        {
            entity.HasKey(e => e.CusQuoteChargesOutId).HasName("PK_tbl_CusQuote_Charges");

            entity.ToTable("CusQuote_ChargesOut");

            entity.Property(e => e.CusQuoteChargesOutId)
                .ValueGeneratedNever()
                .HasColumnName("CusQuoteChargesOut_ID");
            entity.Property(e => e.CusQuoteChargesOutChargeCode).HasColumnName("CusQuoteChargesOut_ChargeCode");
            entity.Property(e => e.CusQuoteChargesOutCostId).HasColumnName("CusQuoteChargesOut_CostID");
            entity.Property(e => e.CusQuoteChargesOutDescription)
                .HasMaxLength(100)
                .HasColumnName("CusQuoteChargesOut_Description");
            entity.Property(e => e.CusQuoteChargesOutIntNotes)
                .HasMaxLength(100)
                .HasColumnName("CusQuoteChargesOut_IntNotes");
            entity.Property(e => e.CusQuoteChargesOutRevenueCurr)
                .HasPrecision(18, 2)
                .HasColumnName("CusQuoteChargesOut_Revenue_Curr");
            entity.Property(e => e.CusQuoteChargesOutRevenueLocal)
                .HasPrecision(18, 2)
                .HasColumnName("CusQuoteChargesOut_Revenue_Local");
            entity.Property(e => e.CusQuoteChargesOutTo).HasColumnName("CusQuoteChargesOut_To");
            entity.Property(e => e.CusQuoteChargesOutToCurr).HasColumnName("CusQuoteChargesOut_ToCurr");
            entity.Property(e => e.CusQuoteChargesOutToRoe)
                .HasPrecision(18, 5)
                .HasColumnName("CusQuoteChargesOut_ToROE");
            entity.Property(e => e.CusQuoteRevenueOptId).HasColumnName("CusQuoteRevenueOpt_ID");

            entity.HasOne(d => d.CusQuoteRevenueOpt).WithMany(p => p.CusQuoteChargesOuts)
                .HasForeignKey(d => d.CusQuoteRevenueOptId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_CusQuote_ChargesOut_tbl_CusQuote_RevenueOptions");
        });

        modelBuilder.Entity<CusQuoteCostOption>(entity =>
        {
            entity.HasKey(e => e.CusQuoteCostOptId);

            entity.ToTable("CusQuote_CostOptions");

            entity.Property(e => e.CusQuoteCostOptId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("CusQuoteCostOpt_ID");
            entity.Property(e => e.CusQuoteCostOptArrivalDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("CusQuoteCostOpt_ArrivalDate");
            entity.Property(e => e.CusQuoteCostOptCarrierId).HasColumnName("CusQuoteCostOpt_CarrierID");
            entity.Property(e => e.CusQuoteCostOptDepartureDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("CusQuoteCostOpt_DepartureDate");
            entity.Property(e => e.CusQuoteCostOptDescription)
                .HasMaxLength(150)
                .HasColumnName("CusQuoteCostOpt_Description");
            entity.Property(e => e.CusQuoteCostOptDirect)
                .HasDefaultValue(true)
                .HasColumnName("CusQuoteCostOpt_Direct");
            entity.Property(e => e.CusQuoteCostOptRevId).HasColumnName("CusQuoteCostOpt_RevID");
            entity.Property(e => e.CusQuoteCostOptSubId).HasColumnName("CusQuoteCostOpt_SubID");
            entity.Property(e => e.CusQuoteCostOptTransitDays).HasColumnName("CusQuoteCostOpt_TransitDays");
            entity.Property(e => e.CusQuoteCostOptVia)
                .HasMaxLength(5)
                .HasColumnName("CusQuoteCostOpt_Via");

            entity.HasOne(d => d.CusQuoteCostOptRev).WithMany(p => p.CusQuoteCostOptions)
                .HasForeignKey(d => d.CusQuoteCostOptRevId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_CusQuote_CostOptions_tbl_CusQuote_Revision");
        });

        modelBuilder.Entity<CusQuoteHeader>(entity =>
        {
            entity.HasKey(e => e.CusQuoteHeaderId);

            entity.ToTable("CusQuote_Header");

            entity.Property(e => e.CusQuoteHeaderId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("CusQuoteHeader_ID");
            entity.Property(e => e.CusQuoteHeaderCreatedBy).HasColumnName("CusQuoteHeader_CreatedBy");
            entity.Property(e => e.CusQuoteHeaderCreatedDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("CusQuoteHeader_CreatedDate");
            entity.Property(e => e.CusQuoteHeaderCustomerContact).HasColumnName("CusQuoteHeader_CustomerContact");
            entity.Property(e => e.CusQuoteHeaderCustomerId).HasColumnName("CusQuoteHeader_CustomerID");
            entity.Property(e => e.CusQuoteHeaderDeadline)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("CusQuoteHeader_Deadline");
            entity.Property(e => e.CusQuoteHeaderLastEditedBy).HasColumnName("CusQuoteHeader_LastEditedBy");
            entity.Property(e => e.CusQuoteHeaderLastEditedDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("CusQuoteHeader_LastEditedDate");
            entity.Property(e => e.CusQuoteHeaderNextRev)
                .HasDefaultValue(1)
                .HasColumnName("CusQuoteHeader_NextRev");
            entity.Property(e => e.CusQuoteHeaderNumber)
                .ValueGeneratedOnAdd()
                .HasColumnName("CusQuoteHeader_Number");
            entity.Property(e => e.CusQuoteHeaderStatus).HasColumnName("CusQuoteHeader_Status");
            entity.Property(e => e.CusQuoteHeaderType).HasColumnName("CusQuoteHeader_Type");
            entity.Property(e => e.OrgId).HasColumnName("Org_ID");
            entity.Property(e => e.OrgOfficeId).HasColumnName("OrgOffice_ID");
        });

        modelBuilder.Entity<CusQuoteRevenueOption>(entity =>
        {
            entity.HasKey(e => e.CusQuoteRevenueOptId);

            entity.ToTable("CusQuote_RevenueOptions");

            entity.Property(e => e.CusQuoteRevenueOptId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("CusQuoteRevenueOpt_ID");
            entity.Property(e => e.CusQuoteRevId).HasColumnName("CusQuoteRev_ID");
            entity.Property(e => e.CusQuoteRevenueOptDescription)
                .HasMaxLength(100)
                .HasColumnName("CusQuoteRevenueOpt_Description");
            entity.Property(e => e.CusQuoteRevenueOptNotesforCustomer).HasColumnName("CusQuoteRevenueOpt_NotesforCustomer");
            entity.Property(e => e.CusQuoteRevenueOptSubId).HasColumnName("CusQuoteRevenueOpt_SubID");

            entity.HasOne(d => d.CusQuoteRev).WithMany(p => p.CusQuoteRevenueOptions)
                .HasForeignKey(d => d.CusQuoteRevId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_CusQuote_RevenueOptions_tbl_CusQuote_Revision");
        });

        modelBuilder.Entity<CusQuoteRevision>(entity =>
        {
            entity.HasKey(e => e.CusQuoteRevId);

            entity.ToTable("CusQuote_Revision");

            entity.Property(e => e.CusQuoteRevId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("CusQuoteRev_ID");
            entity.Property(e => e.CusQuoteHeaderId).HasColumnName("CusQuoteHeader_ID");
            entity.Property(e => e.CusQuoteRevCostCount).HasColumnName("CusQuoteRev_CostCount");
            entity.Property(e => e.CusQuoteRevCubeM3)
                .HasPrecision(18, 2)
                .HasColumnName("CusQuoteRev_CubeM3");
            entity.Property(e => e.CusQuoteRevDestination).HasColumnName("CusQuoteRev_Destination");
            entity.Property(e => e.CusQuoteRevDestinationCtry).HasColumnName("CusQuoteRev_DestinationCtry");
            entity.Property(e => e.CusQuoteRevDestinationXtra)
                .HasMaxLength(50)
                .HasColumnName("CusQuoteRev_DestinationXtra");
            entity.Property(e => e.CusQuoteRevGrossKilos)
                .HasPrecision(18, 2)
                .HasColumnName("CusQuoteRev_GrossKilos");
            entity.Property(e => e.CusQuoteRevInnerPack)
                .HasMaxLength(10)
                .HasColumnName("CusQuoteRev_InnerPack");
            entity.Property(e => e.CusQuoteRevInnerQty)
                .HasPrecision(18, 2)
                .HasColumnName("CusQuoteRev_InnerQty");
            entity.Property(e => e.CusQuoteRevMode).HasColumnName("CusQuoteRev_Mode");
            entity.Property(e => e.CusQuoteRevNotes)
                .HasMaxLength(500)
                .HasColumnName("CusQuoteRev_Notes");
            entity.Property(e => e.CusQuoteRevNumber).HasColumnName("CusQuoteRev_Number");
            entity.Property(e => e.CusQuoteRevOrigin).HasColumnName("CusQuoteRev_Origin");
            entity.Property(e => e.CusQuoteRevOriginCtry).HasColumnName("CusQuoteRev_OriginCtry");
            entity.Property(e => e.CusQuoteRevOriginXtra)
                .HasMaxLength(50)
                .HasColumnName("CusQuoteRev_OriginXtra");
            entity.Property(e => e.CusQuoteRevOuterPack).HasColumnName("CusQuoteRev_OuterPack");
            entity.Property(e => e.CusQuoteRevOuterQty)
                .HasPrecision(18, 2)
                .HasColumnName("CusQuoteRev_Outer_Qty");
            entity.Property(e => e.CusQuoteRevPreferredCost).HasColumnName("CusQuoteRev_PreferredCost");
            entity.Property(e => e.CusQuoteRevPreferredRev).HasColumnName("CusQuoteRev_PreferredRev");
            entity.Property(e => e.CusQuoteRevReason).HasColumnName("CusQuoteRev_Reason");
            entity.Property(e => e.CusQuoteRevRevenueCount).HasColumnName("CusQuoteRev_RevenueCount");
            entity.Property(e => e.CusQuoteRevStatus)
                .HasDefaultValue(1)
                .HasColumnName("CusQuoteRev_Status");
            entity.Property(e => e.CusQuoteRevType).HasColumnName("CusQuoteRev_Type");

            entity.HasOne(d => d.CusQuoteHeader).WithMany(p => p.CusQuoteRevisions)
                .HasForeignKey(d => d.CusQuoteHeaderId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_CusQuote_Revision_tbl_CusQuote_Header");
        });

        modelBuilder.Entity<CusQuoteType>(entity =>
        {
            entity.HasKey(e => e.SysCusQuoteTypeId).HasName("PK_tbl_sys_CusQuote_Types");

            entity.ToTable("CusQuote_Types");

            entity.Property(e => e.SysCusQuoteTypeId).HasColumnName("sys_CusQuoteType_ID");
            entity.Property(e => e.SysCusQuoteTypeName)
                .HasMaxLength(50)
                .HasColumnName("sys_CusQuoteType_Name");
            entity.Property(e => e.SysCusQuoteTypeOrder).HasColumnName("sys_CusQuoteType_Order");
        });

        modelBuilder.Entity<JobCargo>(entity =>
        {
            entity.HasKey(e => e.JobCargoId);

            entity.ToTable("Job_Cargo");

            entity.Property(e => e.JobCargoId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("JobCargo_ID");
            entity.Property(e => e.JobCargoCommodity)
                .HasMaxLength(50)
                .HasColumnName("JobCargo_Commodity");
            entity.Property(e => e.JobCargoGrossKilos)
                .HasPrecision(18, 2)
                .HasColumnName("JobCargo_GrossKilos");
            entity.Property(e => e.JobCargoHeight)
                .HasPrecision(18, 2)
                .HasColumnName("JobCargo_Height");
            entity.Property(e => e.JobCargoJobId).HasColumnName("JobCargo_JobID");
            entity.Property(e => e.JobCargoLength)
                .HasPrecision(18, 2)
                .HasColumnName("JobCargo_Length");
            entity.Property(e => e.JobCargoNettKilos)
                .HasPrecision(18, 2)
                .HasColumnName("JobCargo_NettKilos");
            entity.Property(e => e.JobCargoPacked).HasColumnName("JobCargo_Packed");
            entity.Property(e => e.JobCargoQty)
                .HasPrecision(18, 2)
                .HasColumnName("JobCargo_Qty");
            entity.Property(e => e.JobCargoWidth)
                .HasPrecision(18, 2)
                .HasColumnName("JobCargo_Width");

            entity.HasOne(d => d.JobCargoJob).WithMany(p => p.JobCargos)
                .HasForeignKey(d => d.JobCargoJobId)
                .HasConstraintName("FK_tbl_Job_Cargo_tbl_Job_Header");

            entity.HasMany(d => d.JobContainers).WithMany(p => p.JobCargos)
                .UsingEntity<Dictionary<string, object>>(
                    "JobPackCargoContainer",
                    r => r.HasOne<JobContainer>().WithMany()
                        .HasForeignKey("JobContainerId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_tbl_Job_PackCargoContainer_tbl_Job_Containers"),
                    l => l.HasOne<JobCargo>().WithMany()
                        .HasForeignKey("JobCargoId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_tbl_Job_PackCargoContainer_tbl_Job_Cargo"),
                    j =>
                    {
                        j.HasKey("JobCargoId", "JobContainerId").HasName("PK_tbl_Job_CargoContainer");
                        j.ToTable("Job_PackCargoContainer");
                        j.IndexerProperty<Guid>("JobCargoId").HasColumnName("JobCargo_ID");
                        j.IndexerProperty<Guid>("JobContainerId").HasColumnName("JobContainer_ID");
                    });
        });

        modelBuilder.Entity<JobContainer>(entity =>
        {
            entity.HasKey(e => e.JobContainersId);

            entity.ToTable("Job_Containers");

            entity.Property(e => e.JobContainersId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("JobContainers_ID");
            entity.Property(e => e.JobContainerHeight)
                .HasPrecision(18, 2)
                .HasColumnName("JobContainer_Height");
            entity.Property(e => e.JobContainerLength)
                .HasPrecision(18, 2)
                .HasColumnName("JobContainer_Length");
            entity.Property(e => e.JobContainerNumber)
                .HasMaxLength(50)
                .HasColumnName("JobContainer_Number");
            entity.Property(e => e.JobContainerType).HasColumnName("JobContainer_Type");
            entity.Property(e => e.JobContainerWidth)
                .HasPrecision(18, 2)
                .HasColumnName("JobContainer_Width");
            entity.Property(e => e.JobId).HasColumnName("Job_ID");

            entity.HasOne(d => d.Job).WithMany(p => p.JobContainers)
                .HasForeignKey(d => d.JobId)
                .HasConstraintName("FK_tbl_Job_Containers_tbl_Job_Header");
        });

        modelBuilder.Entity<JobCostingChargesIn>(entity =>
        {
            entity.HasKey(e => e.JcinId).HasName("PK_tbl_Job_Costing_In");

            entity.ToTable("Job_Costing_ChargesIn");

            entity.Property(e => e.JcinId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("JCIn_ID");
            entity.Property(e => e.JcinActualNetCostCurr)
                .HasPrecision(18, 2)
                .HasColumnName("JCIn_Actual_NetCost_Curr");
            entity.Property(e => e.JcinActualNetCostLocal)
                .HasPrecision(18, 2)
                .HasColumnName("JCIn_Actual_NetCost_Local");
            entity.Property(e => e.JcinActualRoe)
                .HasPrecision(18, 5)
                .HasColumnName("JCIn_Actual_ROE");
            entity.Property(e => e.JcinActualTaxAmountCurr)
                .HasPrecision(18, 2)
                .HasColumnName("JCIn_Actual_TaxAmount_Curr");
            entity.Property(e => e.JcinActualTaxAmountLocal)
                .HasPrecision(18, 2)
                .HasColumnName("JCIn_Actual_TaxAmount_Local");
            entity.Property(e => e.JcinActualTaxCode)
                .HasMaxLength(5)
                .HasColumnName("JCIn_Actual_TaxCode");
            entity.Property(e => e.JcinChargeCode).HasColumnName("JCIn_ChargeCode");
            entity.Property(e => e.JcinDescription)
                .HasMaxLength(100)
                .HasColumnName("JCIn_Description");
            entity.Property(e => e.JcinExpectedNetCostCurr)
                .HasPrecision(18, 2)
                .HasColumnName("JCIn_Expected_NetCost_Curr");
            entity.Property(e => e.JcinExpectedNetCostLocal)
                .HasPrecision(18, 2)
                .HasColumnName("JCIn_Expected_NetCost_Local");
            entity.Property(e => e.JcinExpectedTaxAmountCurr)
                .HasPrecision(18, 2)
                .HasColumnName("JCIn_Expected_TaxAmount_Curr");
            entity.Property(e => e.JcinExpectedTaxAmountLocal)
                .HasPrecision(18, 2)
                .HasColumnName("JCIn_Expected_TaxAmount_Local");
            entity.Property(e => e.JcinExpectedTaxCode)
                .HasMaxLength(5)
                .HasColumnName("JCIn_Expected_TaxCode");
            entity.Property(e => e.JcinExternalNotes)
                .HasMaxLength(100)
                .HasColumnName("JCIn_ExternalNotes");
            entity.Property(e => e.JcinFrom).HasColumnName("JCIn_From");
            entity.Property(e => e.JcinFromCurr).HasColumnName("JCIn_FromCurr");
            entity.Property(e => e.JcinFromRoe)
                .HasPrecision(18, 5)
                .HasColumnName("JCIn_FromROE");
            entity.Property(e => e.JcinInternalNotes)
                .HasMaxLength(100)
                .HasColumnName("JCIn_InternalNotes");
            entity.Property(e => e.JcinMatchStatus).HasColumnName("JCIn_Match_Status");
            entity.Property(e => e.JcinShowCurrency)
                .HasDefaultValue(false)
                .HasColumnName("JCIn_ShowCurrency");
            entity.Property(e => e.JcinShowLocal)
                .HasDefaultValue(true)
                .HasColumnName("JCIn_ShowLocal");
            entity.Property(e => e.JcinTs).HasColumnName("JCIn_TS");
            entity.Property(e => e.JobId).HasColumnName("Job_ID");

            entity.HasOne(d => d.Job).WithMany(p => p.JobCostingChargesIns)
                .HasForeignKey(d => d.JobId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_Job_Costing_ChargesIn_tbl_Job_Header");
        });

        modelBuilder.Entity<JobCostingChargesOut>(entity =>
        {
            entity.HasKey(e => e.JcoutId);

            entity.ToTable("Job_Costing_ChargesOut");

            entity.Property(e => e.JcoutId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("JCOut_ID");
            entity.Property(e => e.JcoutActualNetCostCurr)
                .HasPrecision(18, 2)
                .HasColumnName("JCOut_Actual_NetCost_Curr");
            entity.Property(e => e.JcoutActualNetCostLocal)
                .HasPrecision(18, 2)
                .HasColumnName("JCOut_Actual_NetCost_Local");
            entity.Property(e => e.JcoutActualRoe)
                .HasPrecision(18, 5)
                .HasColumnName("JCOut_ActualROE");
            entity.Property(e => e.JcoutActualTaxAmountCurr)
                .HasPrecision(18, 2)
                .HasColumnName("JCOut_Actual_TaxAmount_Curr");
            entity.Property(e => e.JcoutActualTaxAmountLocal)
                .HasPrecision(18, 2)
                .HasColumnName("JCOut_Actual_TaxAmount_Local");
            entity.Property(e => e.JcoutActualTaxCode)
                .HasMaxLength(10)
                .HasColumnName("JCOut_Actual_TaxCode");
            entity.Property(e => e.JcoutChargeCode).HasColumnName("JCOut_ChargeCode");
            entity.Property(e => e.JcoutDescription)
                .HasMaxLength(100)
                .HasColumnName("JCOut_Description");
            entity.Property(e => e.JcoutExpectedNetCostCurr)
                .HasPrecision(18, 2)
                .HasColumnName("JCOut_Expected_NetCost_Curr");
            entity.Property(e => e.JcoutExpectedNetCostLocal)
                .HasPrecision(18, 2)
                .HasColumnName("JCOut_Expected_NetCost_Local");
            entity.Property(e => e.JcoutExpectedTaxAmountCurr)
                .HasPrecision(18, 2)
                .HasColumnName("JCOut_Expected_TaxAmount_Curr");
            entity.Property(e => e.JcoutExpectedTaxAmountLocal)
                .HasPrecision(18, 2)
                .HasColumnName("JCOut_Expected_TaxAmount_Local");
            entity.Property(e => e.JcoutExpectedTaxCode)
                .HasMaxLength(10)
                .HasColumnName("JCOut_Expected_TaxCode");
            entity.Property(e => e.JcoutExternalNotes)
                .HasMaxLength(100)
                .HasColumnName("JCOut_ExternalNotes");
            entity.Property(e => e.JcoutInternalNotes)
                .HasMaxLength(100)
                .HasColumnName("JCOut_InternalNotes");
            entity.Property(e => e.JcoutInvoice).HasColumnName("JCOut_Invoice");
            entity.Property(e => e.JcoutInvoiced).HasColumnName("JCOut_Invoiced");
            entity.Property(e => e.JcoutPaidStatus).HasColumnName("JCOut_PaidStatus");
            entity.Property(e => e.JcoutShowCurrency)
                .HasDefaultValue(false)
                .HasColumnName("JCOut_ShowCurrency");
            entity.Property(e => e.JcoutShowLocal)
                .HasDefaultValue(true)
                .HasColumnName("JCOut_ShowLocal");
            entity.Property(e => e.JcoutTo).HasColumnName("JCOut_To");
            entity.Property(e => e.JcoutToCurr).HasColumnName("JCOut_ToCurr");
            entity.Property(e => e.JcoutToRoe)
                .HasPrecision(18, 5)
                .HasColumnName("JCOut_ToROE");
            entity.Property(e => e.JcoutTs).HasColumnName("JCOut_TS");
            entity.Property(e => e.JobId).HasColumnName("Job_ID");

            entity.HasOne(d => d.Job).WithMany(p => p.JobCostingChargesOuts)
                .HasForeignKey(d => d.JobId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_Job_Costing_ChargesOut_tbl_Job_Header");
        });

        modelBuilder.Entity<JobHeader>(entity =>
        {
            entity.HasKey(e => e.JobId);

            entity.ToTable("Job_Header");

            entity.Property(e => e.JobId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Job_ID");
            entity.Property(e => e.JobCarrier).HasColumnName("Job_Carrier");
            entity.Property(e => e.JobConsignee).HasColumnName("Job_Consignee");
            entity.Property(e => e.JobConsigneeAddress).HasColumnName("Job_ConsigneeAddress");
            entity.Property(e => e.JobCreatedBy).HasColumnName("Job_CreatedBy");
            entity.Property(e => e.JobCreatedDate)
                .HasDefaultValueSql("now()")
                .HasColumnType("timestamp without time zone")
                .HasColumnName("Job_CreatedDate");
            entity.Property(e => e.JobCustomer).HasColumnName("Job_Customer");
            entity.Property(e => e.JobCustomerAddress).HasColumnName("Job_CustomerAddress");
            entity.Property(e => e.JobExportBroker).HasColumnName("Job_ExportBroker");
            entity.Property(e => e.JobImportBroker).HasColumnName("Job_ImportBroker");
            entity.Property(e => e.JobNumber)
                .ValueGeneratedOnAdd()
                .HasColumnName("Job_Number");
            entity.Property(e => e.JobOfficeId).HasColumnName("Job_OfficeID");
            entity.Property(e => e.JobPeriod)
                .HasMaxLength(6)
                .HasColumnName("Job_Period");
            entity.Property(e => e.JobRevRecognitionDate).HasColumnName("Job_RevRecognitionDate");
            entity.Property(e => e.JobShipper).HasColumnName("Job_Shipper");
            entity.Property(e => e.JobShipperAddress).HasColumnName("Job_ShipperAddress");
            entity.Property(e => e.JobSupplier).HasColumnName("Job_Supplier");
            entity.Property(e => e.JobType).HasColumnName("Job_Type");
        });

        modelBuilder.Entity<JobRouting>(entity =>
        {
            entity.HasKey(e => e.JobRouteId);

            entity.ToTable("Job_Routing");

            entity.Property(e => e.JobRouteId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("JobRoute_ID");
            entity.Property(e => e.JobId).HasColumnName("Job_ID");
            entity.Property(e => e.JobRouteCarrier).HasColumnName("JobRoute_Carrier");
            entity.Property(e => e.JobRouteDestinationUnlocode)
                .HasMaxLength(5)
                .HasColumnName("JobRoute_DestinationUNLocode");
            entity.Property(e => e.JobRouteLegEta)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("JobRoute_LegETA");
            entity.Property(e => e.JobRouteLegEtd)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("JobRoute_LegETD");
            entity.Property(e => e.JobRouteLegType).HasColumnName("JobRoute_LegType");
            entity.Property(e => e.JobRouteMode).HasColumnName("JobRoute_Mode");
            entity.Property(e => e.JobRouteOrderNo).HasColumnName("JobRoute_OrderNo");
            entity.Property(e => e.JobRouteOriginUnlocode)
                .HasMaxLength(5)
                .HasColumnName("JobRoute_OriginUNLocode");
            entity.Property(e => e.JobRouteTracked).HasColumnName("JobRoute_Tracked");
            entity.Property(e => e.JobRouteVessel)
                .HasMaxLength(50)
                .HasColumnName("JobRoute_Vessel");
            entity.Property(e => e.JobRouteVoyageNumber)
                .HasMaxLength(50)
                .HasColumnName("JobRoute_VoyageNumber");
        });

        modelBuilder.Entity<OrgAddress>(entity =>
        {
            entity.HasKey(e => e.OrgAddId);

            entity.ToTable("Org_Addresses");

            entity.Property(e => e.OrgAddId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("OrgAdd_ID");
            entity.Property(e => e.OrgAddCountry)
                .HasMaxLength(2)
                .HasColumnName("OrgAdd_Country");
            entity.Property(e => e.OrgAddCountyState)
                .HasMaxLength(50)
                .HasColumnName("OrgAdd_CountyState");
            entity.Property(e => e.OrgAddLine1)
                .HasMaxLength(50)
                .HasColumnName("OrgAdd_Line1");
            entity.Property(e => e.OrgAddLine2)
                .HasMaxLength(50)
                .HasColumnName("OrgAdd_Line2");
            entity.Property(e => e.OrgAddMainEmail)
                .HasMaxLength(100)
                .HasColumnName("OrgAdd_MainEmail");
            entity.Property(e => e.OrgAddMainPhone)
                .HasMaxLength(50)
                .HasColumnName("OrgAdd_MainPhone");
            entity.Property(e => e.OrgAddPostZipCode)
                .HasMaxLength(50)
                .HasColumnName("OrgAdd_PostZipCode");
            entity.Property(e => e.OrgAddTownCity)
                .HasMaxLength(50)
                .HasColumnName("OrgAdd_TownCity");
            entity.Property(e => e.OrgAddUnlocode)
                .HasMaxLength(5)
                .HasColumnName("OrgAdd_UNLOCODE");
            entity.Property(e => e.OrgId).HasColumnName("Org_ID");
            entity.Property(e => e.OrgNameOverride)
                .HasMaxLength(100)
                .HasColumnName("Org_NameOverride");

            entity.HasOne(d => d.Org).WithMany(p => p.OrgAddresses)
                .HasForeignKey(d => d.OrgId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_Org_Addresses_tbl_Org_Master");
        });

        modelBuilder.Entity<OrgAddressType>(entity =>
        {
            entity.HasKey(e => new { e.OrgAddId, e.OrgAddTypeType });

            entity.ToTable("Org_AddressTypes");

            entity.Property(e => e.OrgAddId).HasColumnName("OrgAdd_ID");
            entity.Property(e => e.OrgAddTypeType).HasColumnName("OrgAddType_Type");
            entity.Property(e => e.OrgAddTypeIsDefault).HasColumnName("OrgAddType_IsDefault");

            entity.HasOne(d => d.OrgAdd).WithMany(p => p.OrgAddressTypes)
                .HasForeignKey(d => d.OrgAddId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_Org_AddressTypes_tbl_Org_Addresses");

            entity.HasOne(d => d.OrgAddTypeTypeNavigation).WithMany(p => p.OrgAddressTypes)
                .HasForeignKey(d => d.OrgAddTypeType)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_Org_AddressTypes_tbl_sys_AddressTypes");
        });

        modelBuilder.Entity<OrgContact>(entity =>
        {
            entity.HasKey(e => e.OrgContactId);

            entity.ToTable("Org_Contacts");

            entity.Property(e => e.OrgContactId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("OrgContact_ID");
            entity.Property(e => e.OrgContactFirstName)
                .HasMaxLength(50)
                .HasColumnName("OrgContact_FirstName");
            entity.Property(e => e.OrgContactLastName)
                .HasMaxLength(50)
                .HasColumnName("OrgContact_LastName");
            entity.Property(e => e.OrgId).HasColumnName("Org_ID");

            entity.HasOne(d => d.Org).WithMany(p => p.OrgContacts)
                .HasForeignKey(d => d.OrgId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_Org_Contacts_tbl_Org_Master");
        });

        modelBuilder.Entity<OrgContactEmail>(entity =>
        {
            entity.HasKey(e => e.OrgContactEmailId);

            entity.ToTable("OrgContact_Emails");

            entity.Property(e => e.OrgContactEmailId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("OrgContactEmail_ID");
            entity.Property(e => e.OrgContactEmailEmail)
                .HasMaxLength(200)
                .HasColumnName("OrgContactEmail_Email");
            entity.Property(e => e.OrgContactEmailType).HasColumnName("OrgContactEmail_Type");
            entity.Property(e => e.OrgContactId).HasColumnName("OrgContact_ID");

            entity.HasOne(d => d.OrgContact).WithMany(p => p.OrgContactEmails)
                .HasForeignKey(d => d.OrgContactId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_tbl_OrgContact_Emails_tbl_Org_Contacts");
        });

        modelBuilder.Entity<OrgCurrencyAccount>(entity =>
        {
            entity.HasKey(e => new { e.OrgId, e.OrgCurrencyCode });

            entity.ToTable("Org_CurrencyAccounts");

            entity.Property(e => e.OrgId).HasColumnName("Org_ID");
            entity.Property(e => e.OrgCurrencyCode).HasColumnName("OrgCurrency_Code");
            entity.Property(e => e.OrgCurrencyPurchaseLedgerCode)
                .HasMaxLength(50)
                .HasColumnName("OrgCurrency_PurchaseLedgerCode");
            entity.Property(e => e.OrgCurrencySalesLedgerCode)
                .HasMaxLength(50)
                .HasColumnName("OrgCurrency_SalesLedgerCode");
        });

        modelBuilder.Entity<OrgMaster>(entity =>
        {
            entity.HasKey(e => e.OrgId);

            entity.ToTable("Org_Master");

            entity.Property(e => e.OrgId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Org_ID");
            entity.Property(e => e.OrgBaseCurrency).HasColumnName("Org_BaseCurrency");
            entity.Property(e => e.OrgName)
                .HasMaxLength(100)
                .HasColumnName("Org_Name");
        });

        modelBuilder.Entity<OrgType>(entity =>
        {
            entity.HasKey(e => e.OrgTypeId);

            entity.ToTable("Org_Types");

            entity.Property(e => e.OrgTypeId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("OrgType_ID");
            entity.Property(e => e.OrgTypeName)
                .HasMaxLength(50)
                .HasColumnName("OrgType_Name");
            entity.Property(e => e.OrgTypeOrder)
                .HasMaxLength(10)
                .HasColumnName("OrgType_Order");

            entity.HasMany(d => d.Orgs).WithMany(p => p.OrgTypes)
                .UsingEntity<Dictionary<string, object>>(
                    "OrgMasterType",
                    r => r.HasOne<OrgMaster>().WithMany()
                        .HasForeignKey("OrgId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_tbl_Org_Master_Type_tbl_Org_Master"),
                    l => l.HasOne<OrgType>().WithMany()
                        .HasForeignKey("OrgTypeId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_tbl_Org_Master_Type_tbl_Org_Types"),
                    j =>
                    {
                        j.HasKey("OrgTypeId", "OrgId");
                        j.ToTable("Org_Master_Type");
                        j.IndexerProperty<Guid>("OrgTypeId").HasColumnName("OrgType_ID");
                        j.IndexerProperty<Guid>("OrgId").HasColumnName("Org_ID");
                    });
        });

        modelBuilder.Entity<SysAddressType>(entity =>
        {
            entity.HasKey(e => e.SysAddressTypeId);

            entity.ToTable("sys_AddressTypes");

            entity.Property(e => e.SysAddressTypeId).HasColumnName("sys_AddressType_ID");
            entity.Property(e => e.SysAddressTypeDescription)
                .HasMaxLength(50)
                .HasColumnName("sys_AddressType_Description");
        });

        modelBuilder.Entity<SysAirline>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("sys_Airlines");

            entity.Property(e => e.RmAccountingCode)
                .HasMaxLength(4)
                .HasColumnName("RM_AccountingCode");
            entity.Property(e => e.RmAccountingSecondaryFlag)
                .HasMaxLength(1)
                .HasColumnName("RM_AccountingSecondaryFlag");
            entity.Property(e => e.RmAddressLine1)
                .HasMaxLength(40)
                .HasColumnName("RM_AddressLine1");
            entity.Property(e => e.RmAddressLine2)
                .HasMaxLength(40)
                .HasColumnName("RM_AddressLine2");
            entity.Property(e => e.RmAirlineCity)
                .HasMaxLength(25)
                .HasColumnName("RM_AirlineCity");
            entity.Property(e => e.RmAirlineCountry)
                .HasMaxLength(44)
                .HasColumnName("RM_AirlineCountry");
            entity.Property(e => e.RmAirlineLogo).HasColumnName("RM_AirlineLogo");
            entity.Property(e => e.RmAirlineName1)
                .HasMaxLength(40)
                .HasColumnName("RM_AirlineName1");
            entity.Property(e => e.RmAirlineName2)
                .HasMaxLength(40)
                .HasColumnName("RM_AirlineName2");
            entity.Property(e => e.RmAirlinePostalCode)
                .HasMaxLength(10)
                .HasColumnName("RM_AirlinePostalCode");
            entity.Property(e => e.RmAirlinePrefix)
                .HasMaxLength(3)
                .HasColumnName("RM_AirlinePrefix");
            entity.Property(e => e.RmAirlinePrefixSecondaryFlag)
                .HasMaxLength(1)
                .HasColumnName("RM_AirlinePrefixSecondaryFlag");
            entity.Property(e => e.RmAirlineState)
                .HasMaxLength(20)
                .HasColumnName("RM_AirlineState");
            entity.Property(e => e.RmAutoVersion).HasColumnName("RM_AutoVersion");
            entity.Property(e => e.RmContactNameOciidentifier)
                .HasMaxLength(2)
                .HasColumnName("RM_ContactNameOCIIdentifier");
            entity.Property(e => e.RmContactPhoneOciidentifier)
                .HasMaxLength(2)
                .HasColumnName("RM_ContactPhoneOCIIdentifier");
            entity.Property(e => e.RmDuplicateFlagIndicator).HasColumnName("RM_DuplicateFlagIndicator");
            entity.Property(e => e.RmEagleAddedAirlinePrefixOrAccountingCode)
                .HasMaxLength(3)
                .HasColumnName("RM_EagleAddedAirlinePrefixOrAccountingCode");
            entity.Property(e => e.RmEmergencyContactName)
                .HasMaxLength(20)
                .HasColumnName("RM_EmergencyContactName");
            entity.Property(e => e.RmEmergencyContactTitle)
                .HasMaxLength(20)
                .HasColumnName("RM_EmergencyContactTitle");
            entity.Property(e => e.RmEmergencyTeletype)
                .HasMaxLength(8)
                .HasColumnName("RM_EmergencyTeletype");
            entity.Property(e => e.RmIsActive).HasColumnName("RM_IsActive");
            entity.Property(e => e.RmIsCasscontrolled).HasColumnName("RM_IsCASSControlled");
            entity.Property(e => e.RmIsSystem).HasColumnName("RM_IsSystem");
            entity.Property(e => e.RmIsUpdatable).HasColumnName("RM_IsUpdatable");
            entity.Property(e => e.RmLabelShortName)
                .HasMaxLength(35)
                .HasColumnName("RM_LabelShortName");
            entity.Property(e => e.RmMembershipFlagArinc).HasColumnName("RM_MembershipFlagARINC");
            entity.Property(e => e.RmMembershipFlagAta).HasColumnName("RM_MembershipFlagATA");
            entity.Property(e => e.RmMembershipFlagIata).HasColumnName("RM_MembershipFlagIATA");
            entity.Property(e => e.RmMembershipFlagSita).HasColumnName("RM_MembershipFlagSITA");
            entity.Property(e => e.RmPk).HasColumnName("RM_PK");
            entity.Property(e => e.RmReservationsContactName)
                .HasMaxLength(20)
                .HasColumnName("RM_ReservationsContactName");
            entity.Property(e => e.RmReservationsContactTeletype)
                .HasMaxLength(8)
                .HasColumnName("RM_ReservationsContactTeletype");
            entity.Property(e => e.RmReservationsContactTitle)
                .HasMaxLength(20)
                .HasColumnName("RM_ReservationsContactTitle");
            entity.Property(e => e.RmReservationsDeptTeletype)
                .HasMaxLength(8)
                .HasColumnName("RM_ReservationsDeptTeletype");
            entity.Property(e => e.RmRnNkairlineCountry)
                .HasMaxLength(2)
                .HasColumnName("RM_RN_NKAirlineCountry");
            entity.Property(e => e.RmSystemCreateTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RM_SystemCreateTimeUtc");
            entity.Property(e => e.RmSystemCreateUser)
                .HasMaxLength(3)
                .HasColumnName("RM_SystemCreateUser");
            entity.Property(e => e.RmSystemLastEditTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RM_SystemLastEditTimeUtc");
            entity.Property(e => e.RmSystemLastEditUser)
                .HasMaxLength(3)
                .HasColumnName("RM_SystemLastEditUser");
            entity.Property(e => e.RmThreeLetterCode)
                .HasMaxLength(3)
                .HasColumnName("RM_ThreeLetterCode");
            entity.Property(e => e.RmTwoCharacterCode)
                .HasMaxLength(2)
                .HasColumnName("RM_TwoCharacterCode");
            entity.Property(e => e.RmTypeOfOperationsCode)
                .HasMaxLength(1)
                .HasColumnName("RM_TypeOfOperationsCode");
        });

        modelBuilder.Entity<SysCarriersConsortium>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("sys_CarriersConsortiums");

            entity.Property(e => e.RgCode)
                .HasMaxLength(25)
                .HasColumnName("RG_Code");
            entity.Property(e => e.RgOh).HasColumnName("RG_OH");
            entity.Property(e => e.RgPk).HasColumnName("RG_PK");
            entity.Property(e => e.RgSystemCreateTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RG_SystemCreateTimeUtc");
            entity.Property(e => e.RgSystemCreateUser)
                .HasMaxLength(3)
                .HasColumnName("RG_SystemCreateUser");
            entity.Property(e => e.RgSystemLastEditTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RG_SystemLastEditTimeUtc");
            entity.Property(e => e.RgSystemLastEditUser)
                .HasMaxLength(3)
                .HasColumnName("RG_SystemLastEditUser");
        });

        modelBuilder.Entity<SysCityTown>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("sys_CityTown");

            entity.Property(e => e.R9AutoVersion).HasColumnName("R9_AutoVersion");
            entity.Property(e => e.R9InternationalName)
                .HasMaxLength(50)
                .HasColumnName("R9_InternationalName");
            entity.Property(e => e.R9IsActive).HasColumnName("R9_IsActive");
            entity.Property(e => e.R9IsSystem).HasColumnName("R9_IsSystem");
            entity.Property(e => e.R9LocalLanguageName)
                .HasMaxLength(50)
                .HasColumnName("R9_LocalLanguageName");
            entity.Property(e => e.R9Pk).HasColumnName("R9_PK");
            entity.Property(e => e.R9R3TimeZone).HasColumnName("R9_R3_TimeZone");
            entity.Property(e => e.R9RnNkcountry)
                .HasMaxLength(2)
                .HasColumnName("R9_RN_NKCountry");
            entity.Property(e => e.R9RwNkstate)
                .HasMaxLength(3)
                .HasColumnName("R9_RW_NKState");
            entity.Property(e => e.R9SystemCreateTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("R9_SystemCreateTimeUtc");
            entity.Property(e => e.R9SystemCreateUser)
                .HasMaxLength(3)
                .HasColumnName("R9_SystemCreateUser");
            entity.Property(e => e.R9SystemLastEditTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("R9_SystemLastEditTimeUtc");
            entity.Property(e => e.R9SystemLastEditUser)
                .HasMaxLength(3)
                .HasColumnName("R9_SystemLastEditUser");
        });

        modelBuilder.Entity<SysCommodityCode>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("sys_CommodityCode");

            entity.Property(e => e.RhAutoVersion).HasColumnName("RH_AutoVersion");
            entity.Property(e => e.RhCode)
                .HasMaxLength(4)
                .HasColumnName("RH_Code");
            entity.Property(e => e.RhContainerVentRequired).HasColumnName("RH_ContainerVentRequired");
            entity.Property(e => e.RhDescription)
                .HasMaxLength(500)
                .HasColumnName("RH_Description");
            entity.Property(e => e.RhExpiryDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RH_ExpiryDate");
            entity.Property(e => e.RhFnNknmfc)
                .HasMaxLength(15)
                .HasColumnName("RH_FN_NKNMFC");
            entity.Property(e => e.RhIatacommodityItem)
                .HasMaxLength(7)
                .HasColumnName("RH_IATACommodityItem");
            entity.Property(e => e.RhIsActive).HasColumnName("RH_IsActive");
            entity.Property(e => e.RhIsFlammable).HasColumnName("RH_IsFlammable");
            entity.Property(e => e.RhIsForwarding).HasColumnName("RH_IsForwarding");
            entity.Property(e => e.RhIsHazardous).HasColumnName("RH_IsHazardous");
            entity.Property(e => e.RhIsLandTransport).HasColumnName("RH_IsLandTransport");
            entity.Property(e => e.RhIsPerishable).HasColumnName("RH_IsPerishable");
            entity.Property(e => e.RhIsPersonalEffects).HasColumnName("RH_IsPersonalEffects");
            entity.Property(e => e.RhIsShipping).HasColumnName("RH_IsShipping");
            entity.Property(e => e.RhIsSystem).HasColumnName("RH_IsSystem");
            entity.Property(e => e.RhIsTimber).HasColumnName("RH_IsTimber");
            entity.Property(e => e.RhPk).HasColumnName("RH_PK");
            entity.Property(e => e.RhReeferMaxTemperature)
                .HasMaxLength(32)
                .HasColumnName("RH_ReeferMaxTemperature");
            entity.Property(e => e.RhReeferMinTemperature)
                .HasMaxLength(32)
                .HasColumnName("RH_ReeferMinTemperature");
            entity.Property(e => e.RhSystemCreateTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RH_SystemCreateTimeUtc");
            entity.Property(e => e.RhSystemCreateUser)
                .HasMaxLength(3)
                .HasColumnName("RH_SystemCreateUser");
            entity.Property(e => e.RhSystemLastEditTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RH_SystemLastEditTimeUtc");
            entity.Property(e => e.RhSystemLastEditUser)
                .HasMaxLength(3)
                .HasColumnName("RH_SystemLastEditUser");
            entity.Property(e => e.RhUniversalCommodityGroup)
                .HasMaxLength(10)
                .HasColumnName("RH_UniversalCommodityGroup");
        });

        modelBuilder.Entity<SysContainer>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("sys_Containers");

            entity.Property(e => e.RcCode)
                .HasMaxLength(10)
                .HasColumnName("RC_Code");
            entity.Property(e => e.RcContainerType)
                .HasMaxLength(3)
                .HasColumnName("RC_ContainerType");
            entity.Property(e => e.RcContour)
                .HasMaxLength(1)
                .HasColumnName("RC_Contour");
            entity.Property(e => e.RcCubicCapacity)
                .HasMaxLength(32)
                .HasColumnName("RC_CubicCapacity");
            entity.Property(e => e.RcCubicCapacityUq)
                .HasMaxLength(2)
                .HasColumnName("RC_CubicCapacityUQ");
            entity.Property(e => e.RcDescription)
                .HasMaxLength(45)
                .HasColumnName("RC_Description");
            entity.Property(e => e.RcDimensionUq)
                .HasMaxLength(2)
                .HasColumnName("RC_DimensionUQ");
            entity.Property(e => e.RcDoorOpeningHeight)
                .HasMaxLength(32)
                .HasColumnName("RC_DoorOpeningHeight");
            entity.Property(e => e.RcDoorOpeningUq)
                .HasMaxLength(2)
                .HasColumnName("RC_DoorOpeningUQ");
            entity.Property(e => e.RcDoorOpeningWidth)
                .HasMaxLength(32)
                .HasColumnName("RC_DoorOpeningWidth");
            entity.Property(e => e.RcFreightRateClass)
                .HasMaxLength(4)
                .HasColumnName("RC_FreightRateClass");
            entity.Property(e => e.RcGrossWeight)
                .HasMaxLength(32)
                .HasColumnName("RC_GrossWeight");
            entity.Property(e => e.RcHandlingRateClass)
                .HasMaxLength(4)
                .HasColumnName("RC_HandlingRateClass");
            entity.Property(e => e.RcHasTynes).HasColumnName("RC_HasTynes");
            entity.Property(e => e.RcHasVents).HasColumnName("RC_HasVents");
            entity.Property(e => e.RcHeight)
                .HasMaxLength(32)
                .HasColumnName("RC_Height");
            entity.Property(e => e.RcIatarateClass)
                .HasMaxLength(3)
                .HasColumnName("RC_IATARateClass");
            entity.Property(e => e.RcInsideHeight)
                .HasMaxLength(32)
                .HasColumnName("RC_InsideHeight");
            entity.Property(e => e.RcInsideLength)
                .HasMaxLength(32)
                .HasColumnName("RC_InsideLength");
            entity.Property(e => e.RcInsideUq)
                .HasMaxLength(2)
                .HasColumnName("RC_InsideUQ");
            entity.Property(e => e.RcInsideWidth)
                .HasMaxLength(32)
                .HasColumnName("RC_InsideWidth");
            entity.Property(e => e.RcIsActive).HasColumnName("RC_IsActive");
            entity.Property(e => e.RcIsControlledAtmosphere).HasColumnName("RC_IsControlledAtmosphere");
            entity.Property(e => e.RcIsHighCube).HasColumnName("RC_IsHighCube");
            entity.Property(e => e.RcIsIso).HasColumnName("RC_IsIso");
            entity.Property(e => e.RcIsSystem).HasColumnName("RC_IsSystem");
            entity.Property(e => e.RcIsoequipmentSizeTypeCode)
                .HasMaxLength(10)
                .HasColumnName("RC_ISOEquipmentSizeTypeCode");
            entity.Property(e => e.RcIsotype)
                .HasMaxLength(4)
                .HasColumnName("RC_ISOType");
            entity.Property(e => e.RcLength)
                .HasMaxLength(32)
                .HasColumnName("RC_Length");
            entity.Property(e => e.RcNetWeight)
                .HasMaxLength(32)
                .HasColumnName("RC_NetWeight");
            entity.Property(e => e.RcPk).HasColumnName("RC_PK");
            entity.Property(e => e.RcShippingMode)
                .HasMaxLength(3)
                .HasColumnName("RC_ShippingMode");
            entity.Property(e => e.RcStorageClass)
                .HasMaxLength(3)
                .HasColumnName("RC_StorageClass");
            entity.Property(e => e.RcSystemCreateTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RC_SystemCreateTimeUtc");
            entity.Property(e => e.RcSystemCreateUser)
                .HasMaxLength(3)
                .HasColumnName("RC_SystemCreateUser");
            entity.Property(e => e.RcSystemLastEditTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RC_SystemLastEditTimeUtc");
            entity.Property(e => e.RcSystemLastEditUser)
                .HasMaxLength(3)
                .HasColumnName("RC_SystemLastEditUser");
            entity.Property(e => e.RcTareWeight)
                .HasMaxLength(32)
                .HasColumnName("RC_TareWeight");
            entity.Property(e => e.RcTeu)
                .HasMaxLength(32)
                .HasColumnName("RC_TEU");
            entity.Property(e => e.RcUscontainerCode)
                .HasMaxLength(2)
                .HasColumnName("RC_USContainerCode");
            entity.Property(e => e.RcWeightUq)
                .HasMaxLength(2)
                .HasColumnName("RC_WeightUQ");
            entity.Property(e => e.RcWidth)
                .HasMaxLength(32)
                .HasColumnName("RC_Width");
        });

        modelBuilder.Entity<SysCurrency>(entity =>
        {
            entity.HasKey(e => e.CurrencyId);

            entity.ToTable("sys_Currency");

            entity.Property(e => e.CurrencyId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Currency_ID");
            entity.Property(e => e.CurrencyCode)
                .HasMaxLength(3)
                .HasColumnName("Currency_Code");
            entity.Property(e => e.CurrencyName)
                .HasMaxLength(50)
                .HasColumnName("Currency_Name");
            entity.Property(e => e.CurrencySubUnitName)
                .HasMaxLength(50)
                .HasColumnName("Currency_SubUnitName");
            entity.Property(e => e.CurrencySubUnitRatio).HasColumnName("Currency_SubUnitRatio");
            entity.Property(e => e.CurrencySymbol)
                .HasMaxLength(10)
                .HasColumnName("Currency_Symbol");
            entity.Property(e => e.CurrencyUnitName)
                .HasMaxLength(50)
                .HasColumnName("Currency_UnitName");
        });

        modelBuilder.Entity<SysDocType>(entity =>
        {
            entity.HasKey(e => e.DocTypesPk);

            entity.ToTable("sys_DocTypes");

            entity.Property(e => e.DocTypesPk)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("DocTypes_PK");
            entity.Property(e => e.DocTypesDesc)
                .HasMaxLength(50)
                .HasColumnName("DocTypes_Desc");
            entity.Property(e => e.DocTypesDocType)
                .HasMaxLength(4)
                .HasColumnName("DocTypes_DocType");
            entity.Property(e => e.DocTypesIsDefaultPeriodic).HasColumnName("DocTypes_IsDefaultPeriodic");
            entity.Property(e => e.DocTypesIsPublishUpdatable).HasColumnName("DocTypes_IsPublishUpdatable");
            entity.Property(e => e.DocTypesIsPublished).HasColumnName("DocTypes_IsPublished");
            entity.Property(e => e.DocTypesLogSystemCreatedDocsToEdocs).HasColumnName("DocTypes_LogSystemCreatedDocsToEDocs");
            entity.Property(e => e.DocTypesParseType)
                .HasMaxLength(4)
                .HasColumnName("DocTypes_ParseType");
            entity.Property(e => e.DocTypesReferenceType)
                .HasMaxLength(3)
                .HasColumnName("DocTypes_ReferenceType");
            entity.Property(e => e.DocTypesSaveVersions).HasColumnName("DocTypes_SaveVersions");
            entity.Property(e => e.DocTypesSystemCreatedBy).HasColumnName("DocTypes_SystemCreatedBy");
            entity.Property(e => e.DocTypesSystemCreatedTime)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("DocTypes_SystemCreatedTime");
            entity.Property(e => e.DocTypesSystemLastEditedBy).HasColumnName("DocTypes_SystemLastEditedBy");
            entity.Property(e => e.DocTypesSystemLastEditedDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("DocTypes_SystemLastEditedDate");
        });

        modelBuilder.Entity<SysEmailType>(entity =>
        {
            entity.HasKey(e => e.SysEmailTypeId);

            entity.ToTable("sys_EmailType");

            entity.Property(e => e.SysEmailTypeId).HasColumnName("sys_EmailType_ID");
            entity.Property(e => e.SysEmailTypeGrouping).HasColumnName("sys_EmailType_Grouping");
            entity.Property(e => e.SysEmailTypeName)
                .HasMaxLength(50)
                .HasColumnName("sys_EmailType_Name");
        });

        modelBuilder.Entity<SysListGrouping>(entity =>
        {
            entity.HasKey(e => e.SysListGroupingId);

            entity.ToTable("sys_ListGrouping");

            entity.Property(e => e.SysListGroupingId).HasColumnName("sys_ListGrouping_ID");
            entity.Property(e => e.SysListGroupingName)
                .HasMaxLength(50)
                .HasColumnName("sys_ListGrouping_Name");
        });

        modelBuilder.Entity<SysModule>(entity =>
        {
            entity.HasKey(e => e.ModuleCode);

            entity.ToTable("sys_Modules");

            entity.Property(e => e.ModuleCode)
                .HasMaxLength(5)
                .HasColumnName("Module_Code");
            entity.Property(e => e.ModuleDescription)
                .HasMaxLength(50)
                .HasColumnName("Module_Description");
        });

        modelBuilder.Entity<SysPhoneType>(entity =>
        {
            entity.HasKey(e => e.SysPhoneTypeId);

            entity.ToTable("sys_PhoneType");

            entity.Property(e => e.SysPhoneTypeId).HasColumnName("sys_PhoneType_ID");
            entity.Property(e => e.SysPhoneTypeGrouping).HasColumnName("sys_PhoneType_Grouping");
            entity.Property(e => e.SysPhoneTypeName)
                .HasMaxLength(50)
                .HasColumnName("sys_PhoneType_Name");
        });

        modelBuilder.Entity<SysRefUnloco>(entity =>
        {
            entity
                .HasNoKey()
                .ToTable("sys_RefUNLOCO");

            entity.Property(e => e.RlCode)
                .HasMaxLength(5)
                .HasColumnName("RL_Code");
            entity.Property(e => e.RlGeoLocation).HasColumnName("RL_GeoLocation");
            entity.Property(e => e.RlHasAirport).HasColumnName("RL_HasAirport");
            entity.Property(e => e.RlHasBorderCrossing).HasColumnName("RL_HasBorderCrossing");
            entity.Property(e => e.RlHasCustomsLodge).HasColumnName("RL_HasCustomsLodge");
            entity.Property(e => e.RlHasDischarge).HasColumnName("RL_HasDischarge");
            entity.Property(e => e.RlHasOutport).HasColumnName("RL_HasOutport");
            entity.Property(e => e.RlHasPost).HasColumnName("RL_HasPost");
            entity.Property(e => e.RlHasRail).HasColumnName("RL_HasRail");
            entity.Property(e => e.RlHasRoad).HasColumnName("RL_HasRoad");
            entity.Property(e => e.RlHasSeaport).HasColumnName("RL_HasSeaport");
            entity.Property(e => e.RlHasStore).HasColumnName("RL_HasStore");
            entity.Property(e => e.RlHasTerminal).HasColumnName("RL_HasTerminal");
            entity.Property(e => e.RlHasUnload).HasColumnName("RL_HasUnload");
            entity.Property(e => e.RlIata)
                .HasMaxLength(3)
                .HasColumnName("RL_IATA");
            entity.Property(e => e.RlIataregionCode)
                .HasMaxLength(3)
                .HasColumnName("RL_IATARegionCode");
            entity.Property(e => e.RlIsActive).HasColumnName("RL_IsActive");
            entity.Property(e => e.RlIsSystem).HasColumnName("RL_IsSystem");
            entity.Property(e => e.RlIsUpdatable).HasColumnName("RL_IsUpdatable");
            entity.Property(e => e.RlNameWithDiacriticals)
                .HasMaxLength(35)
                .HasColumnName("RL_NameWithDiacriticals");
            entity.Property(e => e.RlPk).HasColumnName("RL_PK");
            entity.Property(e => e.RlPortName)
                .HasMaxLength(35)
                .HasColumnName("RL_PortName");
            entity.Property(e => e.RlR3).HasColumnName("RL_R3");
            entity.Property(e => e.RlRnNkcountryCode)
                .HasMaxLength(2)
                .HasColumnName("RL_RN_NKCountryCode");
            entity.Property(e => e.RlRw).HasColumnName("RL_RW");
            entity.Property(e => e.RlSystemCreateTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RL_SystemCreateTimeUtc");
            entity.Property(e => e.RlSystemCreateUser)
                .HasMaxLength(3)
                .HasColumnName("RL_SystemCreateUser");
            entity.Property(e => e.RlSystemLastEditTimeUtc)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("RL_SystemLastEditTimeUtc");
            entity.Property(e => e.RlSystemLastEditUser)
                .HasMaxLength(3)
                .HasColumnName("RL_SystemLastEditUser");
        });

        modelBuilder.Entity<SysUserRole>(entity =>
        {
            entity.HasKey(e => e.SysUserRoleId);

            entity.ToTable("sys_UserRoles");

            entity.Property(e => e.SysUserRoleId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("sys_UserRole_ID");
            entity.Property(e => e.SysUserRoleName)
                .HasMaxLength(50)
                .HasColumnName("sys_UserRole_Name");

            entity.HasMany(d => d.Users).WithMany(p => p.SysUserRoles)
                .UsingEntity<Dictionary<string, object>>(
                    "CmpUsersRole",
                    r => r.HasOne<CmpUser>().WithMany()
                        .HasForeignKey("UserId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_tbl_cmp_Users_Roles_tbl_cmp_Users"),
                    l => l.HasOne<SysUserRole>().WithMany()
                        .HasForeignKey("SysUserRoleId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("FK_tbl_cmp_Users_Roles_tbl_sys_UserRoles"),
                    j =>
                    {
                        j.HasKey("SysUserRoleId", "UserId");
                        j.ToTable("cmp_Users_Roles");
                        j.IndexerProperty<Guid>("SysUserRoleId").HasColumnName("sys_UserRole_ID");
                        j.IndexerProperty<Guid>("UserId").HasColumnName("User_ID");
                    });
        });

        modelBuilder.Entity<Warehouse>(entity =>
        {
            entity.HasKey(e => e.WhId).HasName("PK_tbl_Warehouses");

            entity.ToTable("Warehouse");

            entity.Property(e => e.WhId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("WH_ID");
            entity.Property(e => e.WhAddress1)
                .HasMaxLength(50)
                .HasColumnName("WH_Address1");
            entity.Property(e => e.WhAddress2)
                .HasMaxLength(50)
                .HasColumnName("WH_Address2");
            entity.Property(e => e.WhCountry)
                .HasMaxLength(2)
                .HasColumnName("WH_Country");
            entity.Property(e => e.WhCountyState)
                .HasMaxLength(50)
                .HasColumnName("WH_CountyState");
            entity.Property(e => e.WhMainEmail)
                .HasMaxLength(100)
                .HasColumnName("WH_MainEmail");
            entity.Property(e => e.WhMainPhone)
                .HasMaxLength(50)
                .HasColumnName("WH_MainPhone");
            entity.Property(e => e.WhName)
                .HasMaxLength(50)
                .HasColumnName("WH_Name");
            entity.Property(e => e.WhOrganisation)
                .HasMaxLength(50)
                .HasColumnName("WH_Organisation");
            entity.Property(e => e.WhPostZipCode)
                .HasMaxLength(50)
                .HasColumnName("WH_PostZipCode");
            entity.Property(e => e.WhTownCity)
                .HasMaxLength(50)
                .HasColumnName("WH_TownCity");
            entity.Property(e => e.WhUnlocode)
                .HasMaxLength(5)
                .HasColumnName("WH_UNLOCODE");
        });

        modelBuilder.Entity<WarehouseArea>(entity =>
        {
            entity.HasKey(e => e.WhaId);

            entity.ToTable("Warehouse_Areas");

            entity.Property(e => e.WhaId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("WHA_ID");
            entity.Property(e => e.WhaDescription).HasColumnName("WHA_Description");
            entity.Property(e => e.WhaEnabled)
                .HasDefaultValue(true)
                .HasColumnName("WHA_Enabled");
            entity.Property(e => e.WhaName)
                .HasMaxLength(50)
                .HasColumnName("WHA_Name");
            entity.Property(e => e.WhaType)
                .HasDefaultValue(1)
                .HasColumnName("WHA_Type");
            entity.Property(e => e.WhaWarehouse).HasColumnName("WHA_Warehouse");
        });

        modelBuilder.Entity<WarehouseLocation>(entity =>
        {
            entity.HasKey(e => e.WhlId).HasName("PK_tbl_WarehouseLocations");

            entity.ToTable("Warehouse_Locations");

            entity.Property(e => e.WhlId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("WHL_ID");
            entity.Property(e => e.WhlAreaId).HasColumnName("WHL_AreaID");
            entity.Property(e => e.WhlDepth).HasColumnName("WHL_Depth");
            entity.Property(e => e.WhlEnabled)
                .HasDefaultValue(true)
                .HasColumnName("WHL_Enabled");
            entity.Property(e => e.WhlHeight).HasColumnName("WHL_Height");
            entity.Property(e => e.WhlMaxKilos).HasColumnName("WHL_MaxKilos");
            entity.Property(e => e.WhlMultiProduct)
                .HasDefaultValue(false)
                .HasColumnName("WHL_MultiProduct");
            entity.Property(e => e.WhlType).HasColumnName("WHL_Type");
            entity.Property(e => e.WhlWidth).HasColumnName("WHL_Width");
        });

        modelBuilder.Entity<WorkflowItem>(entity =>
        {
            entity.HasKey(e => e.WorkflowId).HasName("PK_tbl_CusQuote_Workflow");

            entity.ToTable("Workflow_Items");

            entity.Property(e => e.WorkflowId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("Workflow_ID");
            entity.Property(e => e.WorkflowAssignedUser).HasColumnName("Workflow_AssignedUser");
            entity.Property(e => e.WorkflowCompletedDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("Workflow_CompletedDate");
            entity.Property(e => e.WorkflowCompletedUser).HasColumnName("Workflow_CompletedUser");
            entity.Property(e => e.WorkflowCreatedDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("Workflow_CreatedDate");
            entity.Property(e => e.WorkflowCreatedUser).HasColumnName("Workflow_CreatedUser");
            entity.Property(e => e.WorkflowDependsOn).HasColumnName("Workflow_DependsOn");
            entity.Property(e => e.WorkflowDueDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("Workflow_DueDate");
            entity.Property(e => e.WorkflowNotes)
                .HasMaxLength(200)
                .HasColumnName("Workflow_Notes");
            entity.Property(e => e.WorkflowRecordId).HasColumnName("Workflow_RecordID");
            entity.Property(e => e.WorkflowRecordType)
                .HasMaxLength(10)
                .HasColumnName("Workflow_RecordType");
            entity.Property(e => e.WorkflowTaskDescription)
                .HasMaxLength(50)
                .HasColumnName("Workflow_TaskDescription");
            entity.Property(e => e.WorkflowTaskStatus).HasColumnName("Workflow_TaskStatus");
            entity.Property(e => e.WorkflowTaskType).HasColumnName("Workflow_TaskType");
        });

        modelBuilder.Entity<WorkflowTemplatesHeader>(entity =>
        {
            entity.HasKey(e => e.WorkflowTemplateId).HasName("PK_tbl_Workflow_Templates");

            entity.ToTable("Workflow_Templates_Header");

            entity.Property(e => e.WorkflowTemplateId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("WorkflowTemplate_ID");
            entity.Property(e => e.WorkflowTemplateDescription)
                .HasMaxLength(50)
                .HasColumnName("WorkflowTemplate_Description");
            entity.Property(e => e.WorkflowTemplateModule)
                .HasMaxLength(5)
                .HasColumnName("WorkflowTemplate_Module");
        });

        modelBuilder.Entity<WorkflowTemplatesLine>(entity =>
        {
            entity.HasKey(e => e.WorkflowTemplateLineId);

            entity.ToTable("Workflow_Templates_Lines");

            entity.Property(e => e.WorkflowTemplateLineId)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("WorkflowTemplateLine_ID");
            entity.Property(e => e.WorkflowTemplateId).HasColumnName("WorkflowTemplate_ID");
            entity.Property(e => e.WorkflowTemplateLineBaseType).HasColumnName("WorkflowTemplateLine_BaseType");
            entity.Property(e => e.WorkflowTemplateLineCarrier).HasColumnName("WorkflowTemplateLine_Carrier");
            entity.Property(e => e.WorkflowTemplateLineConsignee).HasColumnName("WorkflowTemplateLine_Consignee");
            entity.Property(e => e.WorkflowTemplateLineCreatedBy).HasColumnName("WorkflowTemplateLine_CreatedBy");
            entity.Property(e => e.WorkflowTemplateLineCreatedDate)
                .HasColumnType("timestamp without time zone")
                .HasColumnName("WorkflowTemplateLine_CreatedDate");
            entity.Property(e => e.WorkflowTemplateLineCustomer).HasColumnName("WorkflowTemplateLine_Customer");
            entity.Property(e => e.WorkflowTemplateLineCustomsBroker).HasColumnName("WorkflowTemplateLine_CustomsBroker");
            entity.Property(e => e.WorkflowTemplateLineDefaultStatus).HasColumnName("WorkflowTemplateLine_DefaultStatus");
            entity.Property(e => e.WorkflowTemplateLineDestinationUnlocode)
                .HasMaxLength(5)
                .HasColumnName("WorkflowTemplateLine_DestinationUNLOCODE");
            entity.Property(e => e.WorkflowTemplateLineDueDateBefore).HasColumnName("WorkflowTemplateLine_DueDateBefore");
            entity.Property(e => e.WorkflowTemplateLineDueDateVariance).HasColumnName("WorkflowTemplateLine_DueDateVariance");
            entity.Property(e => e.WorkflowTemplateLineDueDateVarianceUnit).HasColumnName("WorkflowTemplateLine_DueDateVarianceUnit");
            entity.Property(e => e.WorkflowTemplateLineOrder).HasColumnName("WorkflowTemplateLine_Order");
            entity.Property(e => e.WorkflowTemplateLineOriginUnlocode)
                .HasMaxLength(5)
                .HasColumnName("WorkflowTemplateLine_OriginUNLOCODE");
            entity.Property(e => e.WorkflowTemplateLinePledgerAcc).HasColumnName("WorkflowTemplateLine_PLedgerAcc");
            entity.Property(e => e.WorkflowTemplateLineShipper).HasColumnName("WorkflowTemplateLine_Shipper");
            entity.Property(e => e.WorkflowTemplateLineSledgerAcc).HasColumnName("WorkflowTemplateLine_SLedgerAcc");
            entity.Property(e => e.WorkflowTemplateLineTaskDescription)
                .HasMaxLength(50)
                .HasColumnName("WorkflowTemplateLine_TaskDescription");
            entity.Property(e => e.WorkflowTemplateLineUserAssignment).HasColumnName("WorkflowTemplateLine_UserAssignment");
            entity.Property(e => e.WorkflowTemplateLineUserId)
                .HasMaxLength(50)
                .HasColumnName("WorkflowTemplateLine_UserID");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
