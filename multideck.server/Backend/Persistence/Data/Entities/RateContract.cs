using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateContract
{
    public Guid RatecontractId { get; set; }

    public string RatecontractCode { get; set; } = null!;

    public string RatecontractName { get; set; } = null!;

    public string RatecontractTypeCode { get; set; } = null!;

    public string RatecontractStatusCode { get; set; } = null!;

    public Guid? RatecontractOrgOfficeId { get; set; }

    public Guid? RatecontractLegalEntityId { get; set; }

    public Guid? RatecontractBrandId { get; set; }

    public Guid? RatecontractCarrierOrgId { get; set; }

    public Guid? RatecontractSupplierOrgId { get; set; }

    public Guid? RatecontractCustomerOrgId { get; set; }

    public Guid? RatecontractAgentOrgId { get; set; }

    public Guid? RatecontractCurrencyId { get; set; }

    public string? RatecontractCurrencyCodeSnapshot { get; set; }

    public DateOnly? RatecontractValidFrom { get; set; }

    public DateOnly? RatecontractValidTo { get; set; }

    public string? RatecontractExternalReference { get; set; }

    public Guid? RatecontractOwnerUserId { get; set; }

    public Guid? RatecontractCurrentVersionId { get; set; }

    public string? RatecontractNotes { get; set; }

    public string RatecontractMetadataJson { get; set; } = null!;

    public DateTime RatecontractCreatedAt { get; set; }

    public Guid? RatecontractCreatedBy { get; set; }

    public DateTime RatecontractUpdatedAt { get; set; }

    public Guid? RatecontractUpdatedBy { get; set; }

    public bool RatecontractIsDeleted { get; set; }

    public virtual ICollection<CusQuoteCostOption> CusQuoteCostOptions { get; set; } = new List<CusQuoteCostOption>();

    public virtual ICollection<RateAuditEvent> RateAuditEvents { get; set; } = new List<RateAuditEvent>();

    public virtual ICollection<RateContractVersion> RateContractVersions { get; set; } = new List<RateContractVersion>();

    public virtual ICollection<RateImportBatch> RateImportBatches { get; set; } = new List<RateImportBatch>();

    public virtual ICollection<RateRateResult> RateRateResults { get; set; } = new List<RateRateResult>();

    public virtual ICollection<RateServiceProduct> RateServiceProducts { get; set; } = new List<RateServiceProduct>();

    public virtual ICollection<RateTariffAssignment> RateTariffAssignments { get; set; } = new List<RateTariffAssignment>();

    public virtual OrgMaster? RatecontractAgentOrg { get; set; }

    public virtual CmpBrand? RatecontractBrand { get; set; }

    public virtual OrgMaster? RatecontractCarrierOrg { get; set; }

    public virtual CmpUser? RatecontractCreatedByNavigation { get; set; }

    public virtual SysCurrency? RatecontractCurrency { get; set; }

    public virtual RateContractVersion? RatecontractCurrentVersion { get; set; }

    public virtual OrgMaster? RatecontractCustomerOrg { get; set; }

    public virtual CmpLegalEntity? RatecontractLegalEntity { get; set; }

    public virtual CmpOffice? RatecontractOrgOffice { get; set; }

    public virtual CmpUser? RatecontractOwnerUser { get; set; }

    public virtual SysRateStatus RatecontractStatusCodeNavigation { get; set; } = null!;

    public virtual OrgMaster? RatecontractSupplierOrg { get; set; }

    public virtual SysRateContractType RatecontractTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? RatecontractUpdatedByNavigation { get; set; }
}
