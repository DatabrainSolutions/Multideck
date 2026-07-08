using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class TceLicense
{
    public Guid TcelicenseId { get; set; }

    public string TcelicenseNumber { get; set; } = null!;

    public string TcelicenseTypeCode { get; set; } = null!;

    public string TcelicenseStatusCode { get; set; } = null!;

    public Guid? TcelicenseOrgOfficeId { get; set; }

    public Guid? TcelicenseLegalEntityId { get; set; }

    public Guid? TcelicenseBrandId { get; set; }

    public Guid? TcelicenseCustomerOrgId { get; set; }

    public string? TcelicenseIssuingAuthority { get; set; }

    public string? TcelicenseJurisdictionCode { get; set; }

    public string? TcelicenseReference { get; set; }

    public DateOnly? TcelicenseIssueDate { get; set; }

    public DateOnly? TcelicenseEffectiveFrom { get; set; }

    public DateOnly? TcelicenseExpiryDate { get; set; }

    public string TcelicenseCurrencyCodeSnapshot { get; set; } = null!;

    public decimal? TcelicenseValueLimitAmount { get; set; }

    public decimal TcelicenseValueUsedAmount { get; set; }

    public decimal? TcelicenseQuantityLimit { get; set; }

    public decimal TcelicenseQuantityUsed { get; set; }

    public string TcelicenseCountryScopeJson { get; set; } = null!;

    public string TcelicensePartyScopeJson { get; set; } = null!;

    public string TcelicenseConditionsJson { get; set; } = null!;

    public string? TcelicenseNotes { get; set; }

    public string TcelicenseMetadataJson { get; set; } = null!;

    public DateTime TcelicenseCreatedAt { get; set; }

    public Guid? TcelicenseCreatedBy { get; set; }

    public DateTime TcelicenseUpdatedAt { get; set; }

    public Guid? TcelicenseUpdatedBy { get; set; }

    public virtual ICollection<TceAiinsight> TceAiinsights { get; set; } = new List<TceAiinsight>();

    public virtual ICollection<TceComplianceCheckItem> TceComplianceCheckItems { get; set; } = new List<TceComplianceCheckItem>();

    public virtual ICollection<TceLicenseLine> TceLicenseLines { get; set; } = new List<TceLicenseLine>();

    public virtual ICollection<TceLicenseUsage> TceLicenseUsages { get; set; } = new List<TceLicenseUsage>();

    public virtual CmpBrand? TcelicenseBrand { get; set; }

    public virtual CmpUser? TcelicenseCreatedByNavigation { get; set; }

    public virtual OrgMaster? TcelicenseCustomerOrg { get; set; }

    public virtual CmpLegalEntity? TcelicenseLegalEntity { get; set; }

    public virtual CmpOffice? TcelicenseOrgOffice { get; set; }

    public virtual SysTcelicenseStatus TcelicenseStatusCodeNavigation { get; set; } = null!;

    public virtual SysTcelicenseType TcelicenseTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? TcelicenseUpdatedByNavigation { get; set; }
}
