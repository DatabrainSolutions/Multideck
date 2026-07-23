using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsBondedAuthorisation
{
    public Guid WmsbondAuthId { get; set; }

    public Guid WmsbondAuthFacilityId { get; set; }

    public string WmsbondAuthAuthorisationNumber { get; set; } = null!;

    public string WmsbondAuthJurisdictionCode { get; set; } = null!;

    public string WmsbondAuthWarehouseTypeCode { get; set; } = null!;

    public string? WmsbondAuthAuthorityName { get; set; }

    public Guid? WmsbondAuthHolderOrgId { get; set; }

    public DateOnly WmsbondAuthValidFrom { get; set; }

    public DateOnly? WmsbondAuthValidTo { get; set; }

    public string WmsbondAuthStatusCode { get; set; } = null!;

    public string WmsbondAuthApprovedProceduresJson { get; set; } = null!;

    public string WmsbondAuthApprovedHandlingJson { get; set; } = null!;

    public string WmsbondAuthConditionsJson { get; set; } = null!;

    public DateTime WmsbondAuthCreatedAt { get; set; }

    public Guid? WmsbondAuthCreatedBy { get; set; }

    public virtual ICollection<WmsBondedAuthorisationSite> WmsBondedAuthorisationSites { get; set; } = new List<WmsBondedAuthorisationSite>();

    public virtual ICollection<WmsBondedDepositor> WmsBondedDepositors { get; set; } = new List<WmsBondedDepositor>();

    public virtual ICollection<WmsBondedEntry> WmsBondedEntries { get; set; } = new List<WmsBondedEntry>();

    public virtual ICollection<WmsBondedEquivalenceRule> WmsBondedEquivalenceRules { get; set; } = new List<WmsBondedEquivalenceRule>();

    public virtual ICollection<WmsBondedGuarantee> WmsBondedGuarantees { get; set; } = new List<WmsBondedGuarantee>();

    public virtual ICollection<WmsBondedReconciliation> WmsBondedReconciliations { get; set; } = new List<WmsBondedReconciliation>();

    public virtual ICollection<WmsBondedUsualHandling> WmsBondedUsualHandlings { get; set; } = new List<WmsBondedUsualHandling>();

    public virtual CmpUser? WmsbondAuthCreatedByNavigation { get; set; }

    public virtual WmsFacility WmsbondAuthFacility { get; set; } = null!;

    public virtual OrgMaster? WmsbondAuthHolderOrg { get; set; }

    public virtual SysWmsbondedWarehouseType WmsbondAuthWarehouseTypeCodeNavigation { get; set; } = null!;
}
