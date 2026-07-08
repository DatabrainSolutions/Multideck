using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class FinAuthorityRule
{
    public Guid FinauthId { get; set; }

    public string FinauthCode { get; set; } = null!;

    public string FinauthName { get; set; } = null!;

    public string FinauthActionTypeCode { get; set; } = null!;

    public Guid? FinauthLegalEntityId { get; set; }

    public Guid? FinauthOrgOfficeId { get; set; }

    public Guid? FinauthBrandId { get; set; }

    public decimal? FinauthMaxAmount { get; set; }

    public decimal? FinauthMaxMarginImpactAmount { get; set; }

    public string? FinauthCurrencyCodeSnapshot { get; set; }

    public string? FinauthRequiredApproverRoleCode { get; set; }

    public Guid? FinauthRequiredApproverUserId { get; set; }

    public bool FinauthAutoApproveWithinLimit { get; set; }

    public int FinauthPriority { get; set; }

    public bool FinauthIsActive { get; set; }

    public DateTime FinauthCreatedAt { get; set; }

    public Guid? FinauthCreatedBy { get; set; }

    public virtual ICollection<FinAuthorityRuleCondition> FinAuthorityRuleConditions { get; set; } = new List<FinAuthorityRuleCondition>();

    public virtual SysFinanceAuthorityActionType FinauthActionTypeCodeNavigation { get; set; } = null!;

    public virtual CmpBrand? FinauthBrand { get; set; }

    public virtual CmpUser? FinauthCreatedByNavigation { get; set; }

    public virtual CmpLegalEntity? FinauthLegalEntity { get; set; }

    public virtual CmpOffice? FinauthOrgOffice { get; set; }

    public virtual CmpUser? FinauthRequiredApproverUser { get; set; }
}
