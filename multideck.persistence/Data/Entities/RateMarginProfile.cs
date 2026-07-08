using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RateMarginProfile
{
    public Guid RatemarginProfileId { get; set; }

    public string RatemarginProfileCode { get; set; } = null!;

    public string RatemarginProfileName { get; set; } = null!;

    public string RatemarginProfileStatusCode { get; set; } = null!;

    public Guid? RatemarginProfileOrgOfficeId { get; set; }

    public Guid? RatemarginProfileLegalEntityId { get; set; }

    public Guid? RatemarginProfileBrandId { get; set; }

    public Guid? RatemarginProfileCustomerOrgId { get; set; }

    public string? RatemarginProfileModeCode { get; set; }

    public string? RatemarginProfileDescription { get; set; }

    public DateTime RatemarginProfileCreatedAt { get; set; }

    public Guid? RatemarginProfileCreatedBy { get; set; }

    public virtual ICollection<CusQuoteRevenueOption> CusQuoteRevenueOptions { get; set; } = new List<CusQuoteRevenueOption>();

    public virtual ICollection<RateMarginRule> RateMarginRules { get; set; } = new List<RateMarginRule>();

    public virtual CmpBrand? RatemarginProfileBrand { get; set; }

    public virtual CmpUser? RatemarginProfileCreatedByNavigation { get; set; }

    public virtual OrgMaster? RatemarginProfileCustomerOrg { get; set; }

    public virtual CmpLegalEntity? RatemarginProfileLegalEntity { get; set; }

    public virtual SysJobTransportMode? RatemarginProfileModeCodeNavigation { get; set; }

    public virtual CmpOffice? RatemarginProfileOrgOffice { get; set; }

    public virtual SysRateStatus RatemarginProfileStatusCodeNavigation { get; set; } = null!;
}
